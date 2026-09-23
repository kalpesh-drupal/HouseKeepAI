import { prisma } from "@/lib/prisma";
import { CleaningStatus, PmsProvider, RoomStatus } from "@prisma/client";
import { skyTouchConnector } from "./skytouch";
import { synxisConnector } from "./synxis";
import {
  operaConnector,
  cloudbedsConnector,
  mewsConnector,
  staynTouchConnector,
  autoClerkConnector,
  littleHotelierConnector,
} from "./providers";
import { mapExternalStatus, PmsConnector } from "./types";
import { resetRoomChecklist } from "@/lib/room-inventory";

export type ConflictPolicy = "PMS_WINS" | "MANUAL_WINS" | "PMS_RESERVATIONS_ONLY";

const connectors: Record<PmsProvider, PmsConnector> = {
  SKYTOUCH: skyTouchConnector,
  SYNXIS: synxisConnector,
  OPERA: operaConnector,
  CLOUDBEDS: cloudbedsConnector,
  MEWS: mewsConnector,
  STAYNTOUCH: staynTouchConnector,
  AUTOCLERK: autoClerkConnector,
  LITTLE_HOTELIER: littleHotelierConnector,
};

function shouldSkipStatusUpdate(
  room: { status: RoomStatus; cleaningStatus: CleaningStatus; manualLock: boolean },
  policy: ConflictPolicy
) {
  if (policy === "PMS_WINS") return false;
  if (room.manualLock) return true;
  if (policy === "MANUAL_WINS") return true;
  // PMS_RESERVATIONS_ONLY: never overwrite active housekeeping work
  if (room.status === RoomStatus.CLEANING) return true;
  if (room.cleaningStatus === CleaningStatus.IN_PROGRESS) return true;
  if (room.cleaningStatus === CleaningStatus.NEEDS_INSPECTION) return true;
  return false;
}

export async function runPmsSync(hotelId: string, provider: PmsProvider) {
  const connection = await prisma.pmsConnection.findUnique({
    where: { hotelId_provider: { hotelId, provider } },
  });

  if (!connection?.enabled) {
    throw new Error(`${provider} connector is not enabled`);
  }

  const policy = (connection.conflictPolicy || "PMS_RESERVATIONS_ONLY") as ConflictPolicy;
  const connector = connectors[provider];
  const payload = await connector.fetchSyncData({
    propertyId: connection.propertyId,
    apiKey: connection.apiKey,
    apiSecret: connection.apiSecret,
    baseUrl: connection.baseUrl,
  });

  let updated = 0;
  let skipped = 0;
  const notes: string[] = [];

  for (const res of payload.reservations) {
    if (!res.roomNumber) continue;
    const room = await prisma.room.findFirst({
      where: { hotelId, number: res.roomNumber },
    });
    if (!room) continue;

    const data: {
      guestName: string;
      arrivalDate: Date;
      departureDate: Date;
      isVip: boolean;
      status?: RoomStatus;
      cleaningStatus?: CleaningStatus;
    } = {
      guestName: res.guestName,
      arrivalDate: new Date(res.arrivalDate),
      departureDate: new Date(res.departureDate),
      isVip: Boolean(res.vip),
    };

    // Reservation fields always sync (guest/dates/VIP)
    if (res.status === "CHECKED_IN") {
      if (!shouldSkipStatusUpdate(room, policy) || policy === "PMS_WINS") {
        data.status = RoomStatus.OCCUPIED;
      } else if (room.status !== RoomStatus.OCCUPIED && room.status !== RoomStatus.CLEANING) {
        // still allow check-in if room isn't mid-clean
        if (!shouldSkipStatusUpdate(room, policy)) data.status = RoomStatus.OCCUPIED;
      }
    }

    if (res.status === "CHECKED_OUT") {
      if (!shouldSkipStatusUpdate(room, policy)) {
        data.status = RoomStatus.VACANT_DIRTY;
        data.cleaningStatus = CleaningStatus.NOT_STARTED;
      } else {
        skipped += 1;
        notes.push(`Skipped status for room ${room.number} (checkout) due to ${policy}`);
      }
    }

    await prisma.room.update({ where: { id: room.id }, data });
    if (data.status === RoomStatus.VACANT_DIRTY) {
      await resetRoomChecklist(room.id);
    }
    updated += 1;
  }

  for (const rs of payload.roomStatuses) {
    if (!rs.roomNumber) continue;
    const room = await prisma.room.findFirst({
      where: { hotelId, number: rs.roomNumber },
    });
    if (!room) continue;

    if (shouldSkipStatusUpdate(room, policy)) {
      skipped += 1;
      notes.push(`Skipped HK status for room ${room.number} (${policy} / active work or lock)`);
      continue;
    }

    const status = rs.blocked ? RoomStatus.OUT_OF_ORDER : mapExternalStatus(rs.status);
    await prisma.room.update({
      where: { id: room.id },
      data: {
        status,
        cleaningStatus:
          status === RoomStatus.VACANT_DIRTY
            ? CleaningStatus.NOT_STARTED
            : status === RoomStatus.VACANT_CLEAN || status === RoomStatus.INSPECTED
              ? CleaningStatus.COMPLETED
              : room.cleaningStatus,
      },
    });
    if (status === RoomStatus.VACANT_DIRTY) {
      await resetRoomChecklist(room.id);
    }
    updated += 1;
  }

  await prisma.pmsConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  const log = await prisma.pmsSyncLog.create({
    data: {
      hotelId,
      provider,
      action: "FULL_SYNC",
      records: updated,
      status: updated > 0 ? "SUCCESS" : "PARTIAL",
      message: `Synced ${payload.reservations.length} reservations and ${payload.roomStatuses.length} room statuses. Updated ${updated}, skipped ${skipped}. Policy=${policy}.${notes.length ? " " + notes.slice(0, 5).join("; ") : ""}`,
    },
  });

  return { updated, skipped, log, payload, policy };
}

/** Sync all enabled connectors that are due based on syncIntervalMinutes. */
export async function runDuePmsSyncs() {
  const connections = await prisma.pmsConnection.findMany({ where: { enabled: true } });
  const results = [];

  for (const conn of connections) {
    const intervalMs = Math.max(1, conn.syncIntervalMinutes || 15) * 60 * 1000;
    const due =
      !conn.lastSyncAt || Date.now() - conn.lastSyncAt.getTime() >= intervalMs;
    if (!due) {
      results.push({ provider: conn.provider, hotelId: conn.hotelId, skipped: true, reason: "not_due" });
      continue;
    }
    try {
      const result = await runPmsSync(conn.hotelId, conn.provider);
      results.push({
        provider: conn.provider,
        hotelId: conn.hotelId,
        updated: result.updated,
        skipped: result.skipped,
      });
    } catch (err) {
      await prisma.pmsSyncLog.create({
        data: {
          hotelId: conn.hotelId,
          provider: conn.provider,
          action: "CRON_SYNC",
          status: "FAILED",
          message: err instanceof Error ? err.message : "Cron sync failed",
        },
      });
      results.push({
        provider: conn.provider,
        hotelId: conn.hotelId,
        error: err instanceof Error ? err.message : "failed",
      });
    }
  }

  return results;
}
