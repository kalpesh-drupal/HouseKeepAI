import { PmsConnector, PmsSyncPayload } from "./types";

function demoPayload(provider: string): PmsSyncPayload {
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  return {
    reservations: [
      {
        roomNumber: "107",
        guestName: `${provider} Guest`,
        arrivalDate: today.toISOString(),
        departureDate: tomorrow.toISOString(),
        vip: true,
        status: "CHECKED_IN",
      },
      {
        roomNumber: "220",
        guestName: "Arriving Guest",
        arrivalDate: tomorrow.toISOString(),
        departureDate: new Date(Date.now() + 3 * 86400000).toISOString(),
        status: "RESERVED",
      },
    ],
    roomStatuses: [
      { roomNumber: "101", status: "DIRTY" },
      { roomNumber: "103", status: "CLEAN" },
      { roomNumber: "106", status: "OOO", blocked: true },
      { roomNumber: "208", status: "CLEAN" },
    ],
  };
}

async function tryLiveFetch(
  url: string,
  headers: Record<string, string>
): Promise<PmsSyncPayload | null> {
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const reservations = Array.isArray(data.reservations) ? data.reservations : Array.isArray(data.stays) ? data.stays : [];
    const rooms = Array.isArray(data.rooms) ? data.rooms : Array.isArray(data.roomStatuses) ? data.roomStatuses : Array.isArray(data.inventory) ? data.inventory : [];
    return {
      reservations: reservations.map((r: Record<string, unknown>) => ({
        roomNumber: String(r.roomNumber || r.room || r.roomCode || ""),
        guestName: String(r.guestName || r.guest || r.primaryGuest || "Guest"),
        arrivalDate: String(r.arrivalDate || r.arrival || new Date().toISOString()),
        departureDate: String(r.departureDate || r.departure || new Date(Date.now() + 86400000).toISOString()),
        vip: Boolean(r.vip || r.isVip || r.vipFlag),
        status: (r.status as PmsSyncPayload["reservations"][0]["status"]) || "RESERVED",
      })),
      roomStatuses: rooms.map((r: Record<string, unknown>) => ({
        roomNumber: String(r.roomNumber || r.room || r.roomCode || ""),
        status: (r.status || r.hkStatus) as PmsSyncPayload["roomStatuses"][0]["status"],
        blocked: Boolean(r.blocked || r.ooo || r.outOfOrder),
      })),
    };
  } catch {
    return null;
  }
}

function makeConnector(
  provider: PmsConnector["provider"],
  buildUrl: (cfg: { baseUrl: string; propertyId: string }) => string,
  buildHeaders: (cfg: { apiKey: string; apiSecret?: string | null }) => Record<string, string>
): PmsConnector {
  return {
    provider,
    async fetchSyncData(config) {
      if (config.baseUrl && config.apiKey) {
        const live = await tryLiveFetch(
          buildUrl({ baseUrl: config.baseUrl.replace(/\/$/, ""), propertyId: config.propertyId || "" }),
          buildHeaders({ apiKey: config.apiKey, apiSecret: config.apiSecret })
        );
        if (live) return live;
      }
      return demoPayload(provider);
    },
  };
}

export const operaConnector = makeConnector(
  "OPERA",
  ({ baseUrl, propertyId }) => `${baseUrl}/operacloud/hk/v1/hotels/${propertyId}/rooms`,
  ({ apiKey }) => ({ Authorization: `Bearer ${apiKey}`, Accept: "application/json" })
);

export const cloudbedsConnector = makeConnector(
  "CLOUDBEDS",
  ({ baseUrl }) => `${baseUrl}/api/v1.2/getRooms`,
  ({ apiKey }) => ({ Authorization: `Bearer ${apiKey}`, Accept: "application/json" })
);

export const mewsConnector = makeConnector(
  "MEWS",
  ({ baseUrl }) => `${baseUrl}/api/connector/v1/resources/getAll`,
  ({ apiKey }) => ({ "Content-Type": "application/json", "Client-Token": apiKey })
);

export const staynTouchConnector = makeConnector(
  "STAYNTOUCH",
  ({ baseUrl, propertyId }) => `${baseUrl}/connect/houskeeping/${propertyId}`,
  ({ apiKey }) => ({ Authorization: `Bearer ${apiKey}`, Accept: "application/json" })
);

export const autoClerkConnector = makeConnector(
  "AUTOCLERK",
  ({ baseUrl, propertyId }) => `${baseUrl}/api/properties/${propertyId}/rooms`,
  ({ apiKey }) => ({ "X-API-Key": apiKey, Accept: "application/json" })
);

export const littleHotelierConnector = makeConnector(
  "LITTLE_HOTELIER",
  ({ baseUrl, propertyId }) => `${baseUrl}/api/v1/properties/${propertyId}/rooms`,
  ({ apiKey }) => ({ Authorization: `Bearer ${apiKey}`, Accept: "application/json" })
);
