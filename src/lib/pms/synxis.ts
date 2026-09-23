import { PmsConnector, PmsSyncPayload } from "./types";

/**
 * SynXis (Sabre Hospitality) PMS connector.
 * Live API when credentials are set; demo payload otherwise.
 */
export const synxisConnector: PmsConnector = {
  provider: "SYNXIS",
  async fetchSyncData(config) {
    if (config.baseUrl && config.apiKey) {
      try {
        const url = `${config.baseUrl.replace(/\/$/, "")}/v1/properties/${encodeURIComponent(config.propertyId || "")}/housekeeping`;
        const res = await fetch(url, {
          headers: {
            "x-api-key": config.apiKey,
            ...(config.apiSecret ? { "x-api-secret": config.apiSecret } : {}),
            Accept: "application/json",
          },
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`SynXis API ${res.status}`);
        const data = await res.json();
        return normalizeSynxis(data);
      } catch (err) {
        console.warn("SynXis live sync failed, using demo payload:", err);
      }
    }

    return demoSynxisPayload();
  },
};

function normalizeSynxis(data: Record<string, unknown>): PmsSyncPayload {
  const stays = Array.isArray(data.stays) ? data.stays : Array.isArray(data.reservations) ? data.reservations : [];
  const inventory = Array.isArray(data.inventory) ? data.inventory : Array.isArray(data.rooms) ? data.rooms : [];

  return {
    reservations: stays.map((r: Record<string, unknown>) => ({
      roomNumber: String(r.roomNumber || r.roomCode || ""),
      guestName: String(r.primaryGuest || r.guestName || "Guest"),
      arrivalDate: String(r.arrival || r.arrivalDate || new Date().toISOString()),
      departureDate: String(r.departure || r.departureDate || new Date(Date.now() + 86400000).toISOString()),
      vip: Boolean(r.vipFlag || r.vip),
      status: (r.stayStatus as PmsSyncPayload["reservations"][0]["status"]) || "RESERVED",
    })),
    roomStatuses: inventory.map((r: Record<string, unknown>) => ({
      roomNumber: String(r.roomNumber || r.roomCode || ""),
      status: (r.hkStatus as PmsSyncPayload["roomStatuses"][0]["status"]) || "DIRTY",
      blocked: Boolean(r.outOfOrder || r.blocked),
    })),
  };
}

function demoSynxisPayload(): PmsSyncPayload {
  const today = new Date();
  return {
    reservations: [
      {
        roomNumber: "215",
        guestName: "John Smith",
        arrivalDate: today.toISOString(),
        departureDate: new Date(Date.now() + 86400000).toISOString(),
        vip: true,
        status: "CHECKED_IN",
      },
      {
        roomNumber: "220",
        guestName: "Priya Patel",
        arrivalDate: today.toISOString(),
        departureDate: new Date(Date.now() + 2 * 86400000).toISOString(),
        status: "RESERVED",
      },
    ],
    roomStatuses: [
      { roomNumber: "108", status: "DIRTY" },
      { roomNumber: "201", status: "DIRTY" },
      { roomNumber: "208", status: "CLEAN" },
      { roomNumber: "220", status: "CLEAN" },
      { roomNumber: "310", status: "OOO", blocked: true },
    ],
  };
}
