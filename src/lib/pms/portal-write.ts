import { PmsBoardCondition, PmsProvider, PmsSyncStatus, PmsWriteJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto-secret";
import { writeSkyTouchBoardConditions } from "@/lib/pms/skytouch-portal";

/** Mark Clean in HouseKeepAI → Ready on the SkyTouch Housekeeping Center board. */
export function boardConditionForAppStatus(kind: "clean"): PmsBoardCondition {
  return PmsBoardCondition.READY;
}

export async function enqueueSkyTouchBoardWrite(input: {
  hotelId: string;
  roomId: string;
  roomNumber: string;
  kind: "clean";
}) {
  const connection = await prisma.pmsConnection.findUnique({
    where: { hotelId_provider: { hotelId: input.hotelId, provider: PmsProvider.SKYTOUCH } },
  });
  if (!connection?.portalEnabled) return null;
  if (!connection.portalLoginUrl || !connection.portalUsername || !connection.portalPasswordEnc) return null;

  const condition = boardConditionForAppStatus(input.kind);

  // Replace any older pending job for the same room with the latest Mark Clean.
  await prisma.pmsWriteJob.updateMany({
    where: {
      hotelId: input.hotelId,
      provider: PmsProvider.SKYTOUCH,
      roomNumber: input.roomNumber,
      status: { in: [PmsWriteJobStatus.PENDING, PmsWriteJobStatus.RUNNING] },
    },
    data: { status: PmsWriteJobStatus.FAILED, lastError: "Superseded by newer Mark Clean", completedAt: new Date() },
  });

  const job = await prisma.pmsWriteJob.create({
    data: {
      hotelId: input.hotelId,
      provider: PmsProvider.SKYTOUCH,
      roomId: input.roomId,
      roomNumber: input.roomNumber,
      condition,
      status: PmsWriteJobStatus.PENDING,
    },
  });

  return job;
}

/** Start SkyTouch write immediately after Mark Clean — does not block the housekeeper UI. */
export function schedulePortalWriteProcessing(hotelId: string) {
  void processPendingSkyTouchWrites(hotelId).catch((err) => {
    console.error("[portal-write]", err instanceof Error ? err.message : err);
  });
}

export async function processPendingSkyTouchWrites(hotelId?: string) {
  // Drop legacy ready-to-inspect / dirty queue items — only Mark Clean → Ready is written.
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

  const where = {
    provider: PmsProvider.SKYTOUCH,
    status: PmsWriteJobStatus.PENDING,
    condition: PmsBoardCondition.READY,
    ...(hotelId ? { hotelId } : {}),
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
      where: { hotelId_provider: { hotelId: hid, provider: PmsProvider.SKYTOUCH } },
    });
    if (!connection?.portalEnabled || !connection.portalLoginUrl || !connection.portalUsername || !connection.portalPasswordEnc) {
      await prisma.pmsWriteJob.updateMany({
        where: { id: { in: jobs.map((j) => j.id) } },
        data: {
          status: PmsWriteJobStatus.FAILED,
          lastError: "SkyTouch portal login is not configured",
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

    // Latest condition per room wins within this batch.
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
      const result = await writeSkyTouchBoardConditions({
        loginUrl: connection.portalLoginUrl,
        username: connection.portalUsername,
        password,
        selectorsJson: connection.portalSelectors,
        updates: [...latestByRoom.values()].map((j) => ({
          roomNumber: j.roomNumber,
          condition: j.condition as "READY" | "CLEAN" | "DIRTY",
        })),
      });

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
          provider: PmsProvider.SKYTOUCH,
          action: "PORTAL_WRITE",
          records: hotelUpdated,
          status:
            hotelFailed && !hotelUpdated
              ? PmsSyncStatus.FAILED
              : hotelFailed
                ? PmsSyncStatus.PARTIAL
                : PmsSyncStatus.SUCCESS,
          message: `Wrote ${result.rooms.filter((r) => r.ok).length} room(s) to SkyTouch board.${
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
          provider: PmsProvider.SKYTOUCH,
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
