import { RoomStatus } from "@prisma/client";
import { ROOM_STATUS_CONFIG } from "@/lib/utils";

/** The portal this hotel last logged into. Null keeps HouseKeepAI's own words. */
export type PortalPms = "SKYTOUCH" | "SYNXIS" | null;

const OCCUPIED_STAYS = new Set(["OCCUPIED", "DEPARTING", "STAYOVER", "ARRIVING"]);

function baseLabel(status: RoomStatus) {
  return ROOM_STATUS_CONFIG[status]?.label ?? status;
}

/** Condition word for legends, filters, and counts (no occupancy). */
export function pmsStatusLabel(status: RoomStatus, provider: PortalPms): string {
  if (provider === "SKYTOUCH") {
    if (status === RoomStatus.VACANT_DIRTY) return "DIRTY";
    if (status === RoomStatus.VACANT_CLEAN || status === RoomStatus.INSPECTED) return "Ready";
  }
  return baseLabel(status);
}

/** Room badge. SynXis pairs occupancy with Dirty/Clean the way Room Status does. */
export function pmsRoomLabel(
  status: RoomStatus,
  guestStatus: string | null | undefined,
  provider: PortalPms
): string {
  if (provider === "SYNXIS") {
    const occupied = guestStatus != null && OCCUPIED_STAYS.has(guestStatus);
    if (status === RoomStatus.VACANT_DIRTY) return occupied ? "Occupied/Dirty" : "Vacant/Dirty";
    if (status === RoomStatus.VACANT_CLEAN || status === RoomStatus.INSPECTED) {
      return occupied ? "Occupied/Clean" : "Vacant/Clean";
    }
  }
  return pmsStatusLabel(status, provider);
}

export function pmsFilterLabel(key: "dirty" | "clean", provider: PortalPms): string {
  if (provider === "SKYTOUCH") return key === "dirty" ? "DIRTY" : "Ready";
  return key === "dirty" ? "Dirty" : "Clean";
}

/** Chart slice names. Inspected stays its own slice so Ready is not drawn twice. */
export function pmsChartName(name: string, provider: PortalPms): string {
  if (provider === "SKYTOUCH") {
    if (name === "Dirty") return "DIRTY";
    if (name === "Clean") return "Ready";
  }
  return name;
}

export function pmsPortalName(provider: PortalPms): string | null {
  if (provider === "SKYTOUCH") return "SkyTouch";
  if (provider === "SYNXIS") return "SynXis";
  return null;
}
