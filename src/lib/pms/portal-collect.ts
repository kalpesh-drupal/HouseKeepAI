import { PmsProvider, PmsSyncStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto-secret";
import { collectSkyTouchHousekeepingReport } from "@/lib/pms/skytouch-portal";
import { collectSynxisHousekeepingReport } from "@/lib/pms/synxis-portal";
import { importPmsReportFile } from "@/lib/pms/import-report";
import { flashSnapshotCreateData } from "@/lib/pms/flash-stats";

const PORTAL_REPORT_PMS: Partial<Record<PmsProvider, string>> = {
  SKYTOUCH: "SKYTOUCH",
  SYNXIS: "SYNXIS",
};

const PORTAL_COLLECT_PROVIDERS: PmsProvider[] = [PmsProvider.SKYTOUCH, PmsProvider.SYNXIS];

export async function runPortalCollect(hotelId: string, provider: PmsProvider) {
  if (!PORTAL_COLLECT_PROVIDERS.includes(provider)) {
    throw new Error("Portal collect is available for SkyTouch and SynXis. Other PMS portals come next.");
  }

  const connection = await prisma.pmsConnection.findUnique({
    where: { hotelId_provider: { hotelId, provider } },
  });
  if (!connection) {
    throw new Error(`Save ${provider} portal login on the PMS page first.`);
  }
  if (!connection.portalLoginUrl?.trim()) {
    throw new Error(`Save the hotel's ${provider} https login URL, then click Collect again.`);
  }
  if (!connection.portalUsername?.trim() || !connection.portalPasswordEnc) {
    throw new Error(`Save the ${provider} portal username and password, then click Collect again.`);
  }
  if (!connection.portalEnabled) {
    await prisma.pmsConnection.update({
      where: { id: connection.id },
      data: { portalEnabled: true },
    });
  }

  let password = "";
  try {
    password = decryptSecret(connection.portalPasswordEnc);
  } catch {
    throw new Error("Could not decrypt the stored portal password. Re-save it on the PMS page.");
  }

  const { assertPlaywrightHost } = await import("@/lib/pms/playwright-host");
  try {
    assertPlaywrightHost();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Portal collect unavailable on this host";
    await prisma.pmsSyncLog.create({
      data: {
        hotelId,
        provider,
        action: "PORTAL_COLLECT",
        records: 0,
        status: PmsSyncStatus.FAILED,
        message,
      },
    });
    throw err;
  }

  const reportPms = PORTAL_REPORT_PMS[provider] || provider;
  let file: {
    buffer: Buffer | null;
    filename: string | null;
    mime: string | null;
    flash?: Awaited<ReturnType<typeof collectSkyTouchHousekeepingReport>>["flash"];
    boardError?: string;
  };
  try {
    if (provider === PmsProvider.SYNXIS) {
      const syn = await collectSynxisHousekeepingReport({
        loginUrl: connection.portalLoginUrl,
        username: connection.portalUsername,
        password,
        selectorsJson: connection.portalSelectors,
      });
      file = { ...syn, flash: null };
    } else {
      file = await collectSkyTouchHousekeepingReport({
        loginUrl: connection.portalLoginUrl,
        username: connection.portalUsername,
        password,
        selectorsJson: connection.portalSelectors,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Portal collect failed";
    await prisma.pmsSyncLog.create({
      data: {
        hotelId,
        provider,
        action: "PORTAL_COLLECT",
        records: 0,
        status: PmsSyncStatus.FAILED,
        message,
      },
    });
    throw err;
  } finally {
    password = "";
  }

  if (file.flash) {
    await prisma.$transaction([
      prisma.pmsFlashSnapshot.create({
        data: flashSnapshotCreateData(hotelId, provider, file.flash),
      }),
      prisma.pmsConnection.update({
        where: { id: connection.id },
        data: {
          portalFlashJson: JSON.stringify(file.flash),
          portalFlashAt: new Date(file.flash.collectedAt),
          lastSyncAt: new Date(),
        },
      }),
    ]);
  }

  let imported: Awaited<ReturnType<typeof importPmsReportFile>> | null = null;
  if (file.buffer && file.filename && file.mime) {
    imported = await importPmsReportFile({
      hotelId,
      reportPms,
      mode: "update",
      filename: file.filename,
      mime: file.mime,
      buffer: file.buffer,
    });
  }
  const importedSummary = imported ?? {
    updated: 0,
    created: 0,
    skipped: 0,
    mode: "update" as const,
    warnings: [] as string[],
    preview: [] as Array<{ room: string; housekeeping: string; guestStay: string }>,
    statusMissing: 0,
  };

  await prisma.pmsConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  const flashHint = file.flash
    ? ` Home: occupancy ${file.flash.occupancyPercent ?? "—"}%, ADR ${file.flash.expectedAdr ?? "—"}, arrivals ${file.flash.totalArrivals ?? "—"}, departures ${file.flash.totalDepartures ?? "—"}, stayovers ${file.flash.stayovers ?? "—"}.`
    : "";
  const boardHint = file.boardError ? ` Board: ${file.boardError}` : "";
  const warningHint = importedSummary.warnings?.length
    ? ` Warnings: ${importedSummary.warnings.slice(0, 3).join(" | ")}`
    : "";
  const roomPart = file.filename
    ? `Collected ${file.filename}. Updated ${importedSummary.updated}, created ${importedSummary.created}, skipped ${importedSummary.skipped}.`
    : provider === PmsProvider.SKYTOUCH
      ? "Home flash stats collected; room board was not imported."
      : "SynXis collect finished without a room file.";

  const records = importedSummary.updated + importedSummary.created;
  const status =
    file.flash || records > 0
      ? file.boardError && !records
        ? PmsSyncStatus.PARTIAL
        : PmsSyncStatus.SUCCESS
      : PmsSyncStatus.PARTIAL;

  await prisma.pmsSyncLog.create({
    data: {
      hotelId,
      provider,
      action: "PORTAL_COLLECT",
      records,
      status,
      message: `${roomPart}${flashHint}${boardHint}${warningHint}`,
    },
  });

  return {
    imported: importedSummary,
    filename: file.filename,
    flash: file.flash ?? null,
    boardError: file.boardError,
  };
}
