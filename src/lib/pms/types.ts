import { RoomStatus } from "@prisma/client";

export type PmsReservation = {
  roomNumber: string;
  guestName: string;
  arrivalDate: string; // ISO
  departureDate: string;
  vip?: boolean;
  status?: "RESERVED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED";
};

export type PmsRoomStatus = {
  roomNumber: string;
  status: RoomStatus | "DIRTY" | "CLEAN" | "INSPECTED" | "OOO" | "OCCUPIED";
  blocked?: boolean;
};

export type PmsSyncPayload = {
  reservations: PmsReservation[];
  roomStatuses: PmsRoomStatus[];
};

export type PmsConnector = {
  provider:
    | "SKYTOUCH"
    | "SYNXIS"
    | "OPERA"
    | "CLOUDBEDS"
    | "MEWS"
    | "STAYNTOUCH"
    | "AUTOCLERK"
    | "LITTLE_HOTELIER";
  fetchSyncData: (config: {
    propertyId?: string | null;
    apiKey?: string | null;
    apiSecret?: string | null;
    baseUrl?: string | null;
  }) => Promise<PmsSyncPayload>;
};

export function mapExternalStatus(status: PmsRoomStatus["status"]): RoomStatus {
  switch (status) {
    case "DIRTY":
    case "VACANT_DIRTY":
      return RoomStatus.VACANT_DIRTY;
    case "CLEAN":
    case "VACANT_CLEAN":
      return RoomStatus.VACANT_CLEAN;
    case "INSPECTED":
      return RoomStatus.INSPECTED;
    case "OOO":
    case "OUT_OF_ORDER":
      return RoomStatus.OUT_OF_ORDER;
    case "OCCUPIED":
      return RoomStatus.OCCUPIED;
    case "CLEANING":
      return RoomStatus.CLEANING;
    case "MAINTENANCE":
      return RoomStatus.MAINTENANCE;
    default:
      return RoomStatus.VACANT_DIRTY;
  }
}
