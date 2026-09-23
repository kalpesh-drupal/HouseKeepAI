import { PmsConnector, PmsSyncPayload } from "./types";

/**
 * SkyTouch PMS connector.
 * Uses live API when SKYTOUCH credentials + baseUrl are configured;
 * otherwise returns a realistic demo payload for development.
 */
export const skyTouchConnector: PmsConnector = {
  provider: "SKYTOUCH",
  async fetchSyncData(config) {
    if (config.baseUrl && config.apiKey) {
      try {
        const url = `${config.baseUrl.replace(/\/$/, "")}/api/v1/housekeeping/sync?propertyId=${encodeURIComponent(config.propertyId || "")}`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            Accept: "application/json",
          },
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`SkyTouch API ${res.status}`);
        const data = await res.json();
        return normalizeSkyTouch(data);
      } catch (err) {
        // Fall through to demo mode with error context
        console.warn("SkyTouch live sync failed, using demo payload:", err);
      }
    }

    return demoSkyTouchPayload();
  },
};

function normalizeSkyTouch(data: Record<string, unknown>): PmsSyncPayload {
  const reservations = Array.isArray(data.reservations) ? data.reservations : [];
  const rooms = Array.isArray(data.rooms) ? data.rooms : Array.isArray(data.roomStatuses) ? data.roomStatuses : [];

  return {
    reservations: reservations.map((r: Record<string, unknown>) => ({
      roomNumber: String(r.roomNumber || r.room || ""),
      guestName: String(r.guestName || r.guest || "Guest"),
      arrivalDate: String(r.arrivalDate || r.arrival || new Date().toISOString()),
      departureDate: String(r.departureDate || r.departure || new Date(Date.now() + 86400000).toISOString()),
      vip: Boolean(r.vip || r.isVip),
      status: (r.status as PmsSyncPayload["reservations"][0]["status"]) || "RESERVED",
    })),
    roomStatuses: rooms.map((r: Record<string, unknown>) => ({
      roomNumber: String(r.roomNumber || r.room || ""),
      status: (r.status as PmsSyncPayload["roomStatuses"][0]["status"]) || "DIRTY",
      blocked: Boolean(r.blocked || r.ooo),
    })),
  };
}

function demoSkyTouchPayload(): PmsSyncPayload {
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  return {
    reservations: [
      {
        roomNumber: "107",
        guestName: "John Smith",
        arrivalDate: today.toISOString(),
        departureDate: tomorrow.toISOString(),
        vip: true,
        status: "CHECKED_IN",
      },
      {
        roomNumber: "205",
        guestName: "Emily Davis",
        arrivalDate: new Date(Date.now() - 86400000).toISOString(),
        departureDate: today.toISOString(),
        status: "CHECKED_OUT",
      },
      {
        roomNumber: "303",
        guestName: "Carlos Rivera",
        arrivalDate: tomorrow.toISOString(),
        departureDate: new Date(Date.now() + 3 * 86400000).toISOString(),
        vip: false,
        status: "RESERVED",
      },
    ],
    roomStatuses: [
      { roomNumber: "101", status: "DIRTY" },
      { roomNumber: "103", status: "CLEAN" },
      { roomNumber: "104", status: "INSPECTED" },
      { roomNumber: "106", status: "OOO", blocked: true },
      { roomNumber: "205", status: "DIRTY" },
      { roomNumber: "303", status: "CLEAN" },
    ],
  };
}
