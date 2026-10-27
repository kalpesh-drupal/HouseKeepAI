import { PmsBoardCondition, PmsProvider, PmsSyncStatus, PmsWriteJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto-secret";
import { writeSkyTouchBoardConditions } from "@/lib/pms/skytouch-portal";
import { writeSynxisRoomsClean } from "@/lib/pms/synxis-portal";
import type { ImapOtpConfig } from "@/lib/pms/email-otp";

/** Providers that can receive Mark Clean portal write-back when portalEnabled. */
const PORTAL_WRITE_PROVIDERS = [PmsProvider.SKYTOUCH, PmsProvider.SYNXIS] as const;

/** Mark Clean → SkyTouch Ready; SynXis Clean. */
export function boardConditionForProvider(provider: PmsProvider, kind: "clean"): PmsBoardCondition {
  if (kind !== "clean") return PmsBoardCondition.DIRTY;
  return provider === PmsProvider.SYNXIS ? PmsBoardCondition.CLEAN : PmsBoardCondition.READY;
}

/** @deprecated use boardConditionForProvider — SkyTouch maps Mark Clean → Ready */
export function boardConditionForAppStatus(kind: "clean"): PmsBoardCondition {
  return boardConditionForProvider(PmsProvider.SKYTOUCH, kind);
}

/**
 * Queue Mark Clean write-back for every enabled portal PMS on this hotel
 * (SkyTouch and/or SynXis). Hotels that have not enabled portal are skipped.
 */
export async function enqueuePortalMarkClean(input: {
  hotelId: string;
  roomId: string;
  roomNumber: string;
}) {
  const connections = await prisma.pmsConnection.findMany({
    where: {
      hotelId: input.hotelId,
      provider: { in: [...PORTAL_WRITE_PROVIDERS] },
      portalEnabled: true,
    },
  });

  const jobs = [];
  for (const connection of connections) {
    if (!connection.portalLoginUrl || !connection.portalUsername || !connection.portalPasswordEnc) {
      console.warn(
        `[portal-write] skip ${connection.provider} room=${input.roomNumber}: portal login incomplete`
      );
      continue;
    }

    const condition = boardConditionForProvider(connection.provider, "clean");

    await prisma.pmsWriteJob.updateMany({
      where: {
        hotelId: input.hotelId,
        provider: connection.provider,
        roomNumber: input.roomNumber,
        status: { in: [PmsWriteJobStatus.PENDING, PmsWriteJobStatus.RUNNING] },
      },
      data: {
        status: PmsWriteJobStatus.FAILED,
        lastError: "Superseded by newer Mark Clean",
        completedAt: new Date(),
      },
    });

    const job = await prisma.pmsWriteJob.create({
      data: {
        hotelId: input.hotelId,
        provider: connection.provider,
        roomId: input.roomId,
        roomNumber: input.roomNumber,
        condition,
        status: PmsWriteJobStatus.PENDING,
      },
    });
    console.info(
      `[portal-write] queued job=${job.id} provider=${connection.provider} room=${input.roomNumber} condition=${condition}`
    );
    jobs.push(job);
  }

  if (!jobs.length) {
    console.warn(
      `[portal-write] no portal write queued for room=${input.roomNumber} (enable SkyTouch and/or SynXis portal on PMS page)`
    );
  }
  return jobs;
}

/** @deprecated prefer enqueuePortalMarkClean */
export async function enqueueSkyTouchBoardWrite(input: {
  hotelId: string;
  roomId: string;
  roomNumber: string;
  kind: "clean";
}) {
  const jobs = await enqueuePortalMarkClean(input);
  return jobs.find((j) => j.provider === PmsProvider.SKYTOUCH) ?? null;
}

/** Start portal writes when Chromium is available (not on Vercel). */
export function schedulePortalWriteProcessing(hotelId: string) {
  void (async () => {
    const { playwrightHostUnsupportedReason } = await import("@/lib/pms/playwright-host");
    const blocked = playwrightHostUnsupportedReason();
    if (blocked) {
      console.info("[portal-write] queued for agent worker:", blocked);
      return;
    }
    await processPendingPortalWrites(hotelId);
  })().catch((err) => {
    console.error("[portal-write]", err instanceof Error ? err.message : err);
  });
}

export async function processPendingPortalWrites(hotelId?: string) {
  const sky = await processPendingSkyTouchWrites(hotelId);
  const syn = await processPendingSynxisWrites(hotelId);
  return {
    hotels: sky.hotels + syn.hotels,
    jobs: sky.jobs + syn.jobs,
    updated: sky.updated + syn.updated,
    failed: sky.failed + syn.failed,
  };
}

export async function processPendingSkyTouchWrites(hotelId?: string) {
  await prisma.pmsWriteJob.updateMany({
    where: {
      provider: PmsProvider.SKYTOUCH,
      status: PmsWriteJobStatus.PENDING,
      condition: { in: [PmsBoardCondition.CLEAN, PmsBoardCondition.DIRTY] },
      ...(hotelId ? { hotelId } : {}),
    },
    data: {
      status: PmsWriteJobStatus.FAILED,
      lastError: "Cancelled — only Mark Clean writes to SkyTouch",
      completedAt: new Date(),
    },
  });

  return processProviderWrites({
    hotelId,
    provider: PmsProvider.SKYTOUCH,
    condition: PmsBoardCondition.READY,
    write: async (connection, password, rooms) => {
      const result = await writeSkyTouchBoardConditions({
        loginUrl: connection.portalLoginUrl!,
        username: connection.portalUsername!,
        password,
        selectorsJson: connection.portalSelectors,
        updates: rooms.map((roomNumber) => ({ roomNumber, condition: "READY" as const })),
      });
      return {
        rooms: result.rooms.map((r) => ({ roomNumber: r.roomNumber, ok: r.ok, error: r.error })),
        error: result.error,
      };
    },
  });
}

export async function processPendingSynxisWrites(hotelId?: string) {
  // SynXis Mark Clean → CLEAN only (ignore READY/DIRTY leftovers).
  await prisma.pmsWriteJob.updateMany({
    where: {
      provider: PmsProvider.SYNXIS,
      status: PmsWriteJobStatus.PENDING,
      condition: { in: [PmsBoardCondition.READY, PmsBoardCondition.DIRTY] },
      ...(hotelId ? { hotelId } : {}),
    },
    data: {
      status: PmsWriteJobStatus.FAILED,
      lastError: "Cancelled — SynXis portal write-back is Mark Clean → Clean only",
      completedAt: new Date(),
    },
  });

  return processProviderWrites({
    hotelId,
    provider: PmsProvider.SYNXIS,
    condition: PmsBoardCondition.CLEAN,
    write: async (connection, password, rooms) => {
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
          throw new Error("Could not decrypt SynXis IMAP password");
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
      const result = await writeSynxisRoomsClean({
        loginUrl: connection.portalLoginUrl!,
        username: connection.portalUsername!,
        password,
        selectorsJson: connection.portalSelectors,
        roomNumbers: rooms,
        auth: {
          storageStateJson: sessionJson,
          storageStateAt: connection.portalSessionAt,
          imap,
        },
      });
      if (result.storageStateJson && connection.id) {
        await prisma.pmsConnection.update({
          where: { id: connection.id },
          data: {
            portalSessionEnc: encryptSecret(result.storageStateJson),
            portalSessionAt: new Date(),
          },
        });
      }
      return {
        rooms: result.rooms.map((r) => ({ roomNumber: r.roomNumber, ok: r.ok, error: r.error })),
        error: result.error,
      };
    },
  });
}

async function processProviderWrites(opts: {
  hotelId?: string;
  provider: PmsProvider;
  condition: PmsBoardCondition;
  write: (
    connection: {
      id: string;
      portalLoginUrl: string | null;
      portalUsername: string | null;
      portalPasswordEnc: string | null;
      portalSelectors: string | null;
      portalEnabled: boolean;
      portalSessionEnc: string | null;
      portalSessionAt: Date | null;
      portalImapHost: string | null;
      portalImapPort: number | null;
      portalImapUser: string | null;
      portalImapPasswordEnc: string | null;
      portalImapMailbox: string | null;
    },
    password: string,
    roomNumbers: string[]
  ) => Promise<{ rooms: Array<{ roomNumber: string; ok: boolean; error?: string }>; error?: string }>;
}) {
  const where = {
    provider: opts.provider,
    status: PmsWriteJobStatus.PENDING,
    condition: opts.condition,
    ...(opts.hotelId ? { hotelId: opts.hotelId } : {}),
  };
  const pending = await prisma.pmsWriteJob.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 40,
  });
  if (!pending.length) return { hotels: 0, jobs: 0, updated: 0, failed: 0 };

  const byHotel = new Map<string, typeof pending>();
  for (const job of pending) {
    const list = byHotel.get(job.hotelId) || [];
    list.push(job);
    byHotel.set(job.hotelId, list);
  }

  let updated = 0;
  let failed = 0;

  for (const [hid, jobs] of byHotel) {
    const connection = await prisma.pmsConnection.findUnique({
      where: { hotelId_provider: { hotelId: hid, provider: opts.provider } },
    });
    if (
      !connection?.portalEnabled ||
      !connection.portalLoginUrl ||
      !connection.portalUsername ||
      !connection.portalPasswordEnc
    ) {
      await prisma.pmsWriteJob.updateMany({
        where: { id: { in: jobs.map((j) => j.id) } },
        data: {
          status: PmsWriteJobStatus.FAILED,
          lastError: `${opts.provider} portal login is not configured`,
          completedAt: new Date(),
        },
      });
      failed += jobs.length;
      continue;
    }

    let password = "";
    try {
      password = decryptSecret(connection.portalPasswordEnc);
    } catch {
      await prisma.pmsWriteJob.updateMany({
        where: { id: { in: jobs.map((j) => j.id) } },
        data: {
          status: PmsWriteJobStatus.FAILED,
          lastError: "Could not decrypt portal password",
          completedAt: new Date(),
        },
      });
      failed += jobs.length;
      continue;
    }

    const latestByRoom = new Map<string, (typeof jobs)[number]>();
    for (const job of jobs) latestByRoom.set(job.roomNumber, job);

    const jobIds = jobs.map((j) => j.id);
    await prisma.pmsWriteJob.updateMany({
      where: { id: { in: jobIds } },
      data: { status: PmsWriteJobStatus.RUNNING, attempts: { increment: 1 } },
    });

    let hotelUpdated = 0;
    let hotelFailed = 0;
    try {
      const result = await opts.write(connection, password, [...latestByRoom.keys()]);

      for (const job of jobs) {
        const latest = latestByRoom.get(job.roomNumber);
        if (latest && latest.id !== job.id) {
          await prisma.pmsWriteJob.update({
            where: { id: job.id },
            data: {
              status: PmsWriteJobStatus.FAILED,
              lastError: "Superseded in batch",
              completedAt: new Date(),
            },
          });
          hotelFailed += 1;
          continue;
        }
        const outcome = result.rooms.find((r) => r.roomNumber === job.roomNumber);
        if (outcome?.ok) {
          await prisma.pmsWriteJob.update({
            where: { id: job.id },
            data: { status: PmsWriteJobStatus.SUCCESS, completedAt: new Date(), lastError: null },
          });
          hotelUpdated += 1;
        } else {
          await prisma.pmsWriteJob.update({
            where: { id: job.id },
            data: {
              status: PmsWriteJobStatus.FAILED,
              lastError: outcome?.error || result.error || "Write failed",
              completedAt: new Date(),
            },
          });
          hotelFailed += 1;
        }
      }

      updated += hotelUpdated;
      failed += hotelFailed;

      await prisma.pmsSyncLog.create({
        data: {
          hotelId: hid,
          provider: opts.provider,
          action: "PORTAL_WRITE",
          records: hotelUpdated,
          status:
            hotelFailed && !hotelUpdated
              ? PmsSyncStatus.FAILED
              : hotelFailed
                ? PmsSyncStatus.PARTIAL
                : PmsSyncStatus.SUCCESS,
          message: `Wrote ${result.rooms.filter((r) => r.ok).length} room(s) via ${opts.provider} portal.${
            result.error ? ` ${result.error}` : ""
          }`,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Portal write failed";
      await prisma.pmsWriteJob.updateMany({
        where: { id: { in: jobIds }, status: PmsWriteJobStatus.RUNNING },
        data: { status: PmsWriteJobStatus.FAILED, lastError: message, completedAt: new Date() },
      });
      failed += jobs.length;
      await prisma.pmsSyncLog.create({
        data: {
          hotelId: hid,
          provider: opts.provider,
          action: "PORTAL_WRITE",
          records: 0,
          status: PmsSyncStatus.FAILED,
          message,
        },
      });
    } finally {
      password = "";
    }
  }

  return { hotels: byHotel.size, jobs: pending.length, updated, failed };
}
