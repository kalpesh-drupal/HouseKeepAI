import type { PmsFlashSnapshot, PmsProvider } from "@prisma/client";

/** SkyTouch Welcome / Home page flash metrics shown on the HouseKeepAI dashboard. */
export type PmsFlashStats = {
  occupancyPercent: number | null;
  expectedAdr: number | null;
  totalArrivals: number | null;
  checkInsCompleted: number | null;
  checkInsRemaining: number | null;
  totalDepartures: number | null;
  vacantDirtyRemaining: number | null;
  totalRoomsAvailable: number | null;
  /** Status-bar counts under the welcome greeting. */
  checkIns: number | null;
  stayovers: number | null;
  vacant: number | null;
  ooo: number | null;
  available: number | null;
  collectedAt: string;
  sourceUrl?: string;
};

export function parseFlashStatsJson(raw: string | null | undefined): PmsFlashStats | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PmsFlashStats;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function flashStatsFromSnapshot(row: PmsFlashSnapshot): PmsFlashStats {
  return {
    occupancyPercent: row.occupancyPercent,
    expectedAdr: row.expectedAdr,
    totalArrivals: row.totalArrivals,
    checkInsCompleted: row.checkInsCompleted,
    checkInsRemaining: row.checkInsRemaining,
    totalDepartures: row.totalDepartures,
    vacantDirtyRemaining: row.vacantDirtyRemaining,
    totalRoomsAvailable: row.totalRoomsAvailable,
    checkIns: row.checkIns,
    stayovers: row.stayovers,
    vacant: row.vacant,
    ooo: row.ooo,
    available: row.available,
    collectedAt: row.collectedAt.toISOString(),
    sourceUrl: row.sourceUrl || undefined,
  };
}

export function flashSnapshotCreateData(
  hotelId: string,
  provider: PmsProvider,
  flash: PmsFlashStats
) {
  return {
    hotelId,
    provider,
    collectedAt: new Date(flash.collectedAt),
    sourceUrl: flash.sourceUrl || null,
    occupancyPercent: flash.occupancyPercent,
    expectedAdr: flash.expectedAdr,
    totalArrivals: flash.totalArrivals,
    checkInsCompleted: flash.checkInsCompleted,
    checkInsRemaining: flash.checkInsRemaining,
    totalDepartures: flash.totalDepartures,
    vacantDirtyRemaining: flash.vacantDirtyRemaining,
    totalRoomsAvailable: flash.totalRoomsAvailable,
    checkIns: flash.checkIns,
    stayovers: flash.stayovers,
    vacant: flash.vacant,
    ooo: flash.ooo,
    available: flash.available,
  };
}

export function formatFlashCollectedAt(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
