import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";

const prisma = new PrismaClient();
const sqlite = new DatabaseSync("prisma/dev.db");

const BOOLS = new Set([
  "active",
  "isVip",
  "isRush",
  "manualLock",
  "completed",
  "needsAttention",
  "passed",
  "read",
  "enabled",
]);
const DATES = new Set([
  "createdAt",
  "updatedAt",
  "arrivalDate",
  "departureDate",
  "cleaningStartedAt",
  "foundAt",
  "lastSyncAt",
]);

const TABLES = [
  ["Hotel", "hotel"],
  ["User", "user"],
  ["Room", "room"],
  ["ChecklistItem", "checklistItem"],
  ["Inspection", "inspection"],
  ["InspectionItem", "inspectionItem"],
  ["MaintenanceTicket", "maintenanceTicket"],
  ["GuestRequest", "guestRequest"],
  ["InventoryItem", "inventoryItem"],
  ["LaundryBatch", "laundryBatch"],
  ["LostFoundItem", "lostFoundItem"],
  ["Message", "message"],
  ["RoomPhoto", "roomPhoto"],
  ["PmsConnection", "pmsConnection"],
  ["PmsSyncLog", "pmsSyncLog"],
  ["PushSubscription", "pushSubscription"],
];

function convert(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined || value === "") {
      out[key] = null;
      continue;
    }
    if (BOOLS.has(key)) out[key] = value === 1 || value === true;
    else if (DATES.has(key)) out[key] = new Date(Number(value));
    else out[key] = value;
  }
  return out;
}

const counts = {};
for (const [table, model] of TABLES) {
  const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all().map(convert);
  if (rows.length === 0) {
    counts[table] = 0;
    continue;
  }
  const result = await prisma[model].createMany({ data: rows });
  counts[table] = result.count;
}

console.log(JSON.stringify(counts, null, 2));
await prisma.$disconnect();
sqlite.close();
