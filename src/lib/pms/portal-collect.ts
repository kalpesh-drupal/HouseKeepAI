import { PmsProvider, PmsSyncStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto-secret";
import { collectSkyTouchHousekeepingReport } from "@/lib/pms/skytouch-portal";
import { collectSynxisHousekeepingReport } from "@/lib/pms/synxis-portal";
import { importPmsReportFile } from "@/lib/pms/import-report";
import { flashSnapshotCreateData } from "@/lib/pms/flash-stats";
import type { ImapOtpConfig } from "@/lib/pms/email-otp";

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
    compareWarnings?: string[];
    boardSummary?: Awaited<ReturnType<typeof collectSynxisHousekeepingReport>>["boardSummary"];
  };
  try {
    if (provider === PmsProvider.SYNXIS) {
      let imap: ImapOtpConfig | null = null;
      if (connection.portalImapHost && connection.portalImapUser && connection.portalImapPasswordEnc) {
        try {
          imap = {
            host: connection.portalImapHost,
            port: connection.portalImapPort || 993,
            user: connection.portalImapUser,
            password: decryptSecret(connection.portalImapPasswordEnc),
            mailbox: connection.portalImapMailbox || "INBOX",
          };
        } catch {
          throw new Error("Could not decrypt SynXis IMAP password. Re-save it on the PMS page.");
        }
      }
      let sessionJson: string | null = null;
      if (connection.portalSessionEnc) {
        try {
          sessionJson = decryptSecret(connection.portalSessionEnc);
        } catch {
          sessionJson = null;
        }
      }
      const syn = await collectSynxisHousekeepingReport({
        loginUrl: connection.portalLoginUrl,
        username: connection.portalUsername,
        password,
        selectorsJson: connection.portalSelectors,
        auth: {
          storageStateJson: sessionJson,
          storageStateAt: connection.portalSessionAt,
          imap,
        },
      });
      if (syn.storageStateJson || syn.rotatedPassword) {
        await prisma.pmsConnection.update({
          where: { id: connection.id },
          data: {
            ...(syn.storageStateJson
              ? {
                  portalSessionEnc: encryptSecret(syn.storageStateJson),
                  portalSessionAt: new Date(),
                }
              : {}),
            ...(syn.rotatedPassword
              ? { portalPasswordEnc: encryptSecret(syn.rotatedPassword) }
              : {}),
          },
        });
        if (syn.rotatedPassword) {
          console.info(
            `[portal-collect] SynXis portal password rotated automatically for hotel=${hotelId} (forced change)`
          );
        }
      }
      file = {
        buffer: syn.buffer,
        filename: syn.filename,
        mime: syn.mime,
        flash: syn.flash,
        boardError: syn.boardError,
        compareWarnings: syn.compareWarnings,
        boardSummary: syn.boardSummary,
      };
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
  const summary = file.boardSummary;
  const summaryHint = summary
    ? ` Room Status: ${summary.roomTotal} rooms · Dirty ${summary.dirtyTotal} · Clean ${
        (summary.vacantClean ?? 0) + (summary.occupiedClean ?? 0)
      } · V/D ${summary.vacantDirty} O/D ${summary.occupiedDirty}.`
    : "";
  const compareHint = file.compareWarnings?.length
    ? ` Discrepancy: ${file.compareWarnings.slice(0, 5).join("; ")}${
        file.compareWarnings.length > 5 ? "…" : ""
      }.`
    : "";
  const warningHint = importedSummary.warnings?.length
    ? ` Warnings: ${importedSummary.warnings.slice(0, 3).join(" | ")}`
    : "";
  const roomPart = file.filename
    ? `Collected ${file.filename}. Updated ${importedSummary.updated}, created ${importedSummary.created}, skipped ${importedSummary.skipped}.`
    : provider === PmsProvider.SYNXIS
      ? "SynXis Room Status board was not imported."
      : provider === PmsProvider.SKYTOUCH
        ? "Home flash stats collected; room board was not imported."
        : "SynXis collect finished without a room file.";

  const records = importedSummary.updated + importedSummary.created;
  const hasCompareMismatch = Boolean(file.compareWarnings?.length);
  const status =
    file.flash || records > 0
      ? file.boardError && !records
        ? PmsSyncStatus.PARTIAL
        : hasCompareMismatch
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
      message: `${roomPart}${flashHint}${summaryHint}${boardHint}${compareHint}${warningHint}`,
    },
  });

  return {
    imported: importedSummary,
    filename: file.filename,
    flash: file.flash ?? null,
    boardError: file.boardError,
    compareWarnings: file.compareWarnings ?? [],
    boardSummary: file.boardSummary ?? null,
  };
}
