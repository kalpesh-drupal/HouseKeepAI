import type { PmsFlashSnapshot, PmsProvider } from "@prisma/client";

/** Home / Welcome / SPH Dashboard flash metrics shown on the HouseKeepAI dashboard. */
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
  /** SynXis SPH Dashboard (and similar) room-status / stay counts. */
  preArrivals: number | null;
  dayUse: number | null;
  checkedOut: number | null;
  vacantClean: number | null;
  vacantDirty: number | null;
  occupiedClean: number | null;
  occupiedDirty: number | null;
  outOfInventory: number | null;
  collectedAt: string;
  sourceUrl?: string;
};

export function parseFlashStatsJson(raw: string | null | undefined): PmsFlashStats | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PmsFlashStats;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      occupancyPercent: parsed.occupancyPercent ?? null,
      expectedAdr: parsed.expectedAdr ?? null,
      totalArrivals: parsed.totalArrivals ?? null,
      checkInsCompleted: parsed.checkInsCompleted ?? null,
      checkInsRemaining: parsed.checkInsRemaining ?? null,
      totalDepartures: parsed.totalDepartures ?? null,
      vacantDirtyRemaining: parsed.vacantDirtyRemaining ?? null,
      totalRoomsAvailable: parsed.totalRoomsAvailable ?? null,
      checkIns: parsed.checkIns ?? null,
      stayovers: parsed.stayovers ?? null,
      vacant: parsed.vacant ?? null,
      ooo: parsed.ooo ?? null,
      available: parsed.available ?? null,
      preArrivals: parsed.preArrivals ?? null,
      dayUse: parsed.dayUse ?? null,
      checkedOut: parsed.checkedOut ?? null,
      vacantClean: parsed.vacantClean ?? null,
      vacantDirty: parsed.vacantDirty ?? null,
      occupiedClean: parsed.occupiedClean ?? null,
      occupiedDirty: parsed.occupiedDirty ?? null,
      outOfInventory: parsed.outOfInventory ?? null,
      collectedAt: parsed.collectedAt,
      sourceUrl: parsed.sourceUrl,
    };
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
    preArrivals: row.preArrivals,
    dayUse: row.dayUse,
    checkedOut: row.checkedOut,
    vacantClean: row.vacantClean,
    vacantDirty: row.vacantDirty,
    occupiedClean: row.occupiedClean,
    occupiedDirty: row.occupiedDirty,
    outOfInventory: row.outOfInventory,
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
    preArrivals: flash.preArrivals,
    dayUse: flash.dayUse,
    checkedOut: flash.checkedOut,
    vacantClean: flash.vacantClean,
    vacantDirty: flash.vacantDirty,
    occupiedClean: flash.occupiedClean,
    occupiedDirty: flash.occupiedDirty,
    outOfInventory: flash.outOfInventory,
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
