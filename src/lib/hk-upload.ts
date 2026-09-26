import { CleaningStatus, GuestStayStatus, RoomStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CHECKLIST_ITEMS } from "@/lib/utils";
import { resetRoomChecklist } from "@/lib/room-inventory";

export type HkListRow = {
  roomNumber: string;
  roomType?: string;
  floor?: number;
  status?: string;
  guestStatus?: string;
  housekeeperEmail?: string;
  housekeeperName?: string;
  priority?: number;
  rush?: boolean;
  vip?: boolean;
  guestName?: string;
  notes?: string;
  estimatedMinutes?: number;
};

export type HkApplyResult = {
  updated: number;
  created: number;
  removed: number;
  skipped: number;
  assigned: number;
  unassigned: number;
  markedDirty: number;
  markedClean: number;
  statusApplied: number;
  statusMissing: number;
  total: number;
  errors: string[];
  warnings: string[];
  unmappedStatusSamples: string[];
};

function normalizeHeader(h: string) {
  return h
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/[^a-z0-9#]+/g, "");
}

const HEADER_MAP: Record<string, keyof HkListRow> = {
  room: "roomNumber",
  roomnumber: "roomNumber",
  roomno: "roomNumber",
  roomnum: "roomNumber",
  roomnbr: "roomNumber",
  rm: "roomNumber",
  rmno: "roomNumber",
  "room#": "roomNumber",
  unit: "roomNumber",
  unitno: "roomNumber",
  roomtype: "roomType",
  roomcategory: "roomType",
  rmtype: "roomType",
  category: "roomType",
  // bare "type" is ambiguous (room type vs status) — resolved per value below
  floor: "floor",
  fl: "floor",
  level: "floor",
  status: "status",
  roomstatus: "status",
  hkstatus: "status",
  hskstatus: "status",
  housekeepingstatus: "status",
  fostatus: "guestStatus",
  frontofficestatus: "guestStatus",
  frontofficestatuscode: "guestStatus",
  gueststatus: "guestStatus",
  occupancy: "guestStatus",
  occupancystatus: "guestStatus",
  reservationstatus: "guestStatus",
  staystatus: "guestStatus",
  hk: "status",
  hsk: "status",
  condition: "status",
  roomcondition: "status",
  cleanstatus: "status",
  cleaningstatus: "status",
  hkcode: "status",
  statuscode: "status",
  rmstatus: "status",
  housekeeper: "housekeeperName",
  housekeepername: "housekeeperName",
  attendant: "housekeeperName",
  assignedto: "housekeeperName",
  maid: "housekeeperName",
  staff: "housekeeperName",
  employee: "housekeeperName",
  housekeeperemail: "housekeeperEmail",
  email: "housekeeperEmail",
  priority: "priority",
  rush: "rush",
  vip: "vip",
  guest: "guestName",
  guestname: "guestName",
  notes: "notes",
  frontdesknotes: "notes",
  comment: "notes",
  comments: "notes",
  estimatedminutes: "estimatedMinutes",
  etaminutes: "estimatedMinutes",
};

function statusParts(raw: string) {
  return {
    compact: raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""),
    spaced: raw.trim().toUpperCase().replace(/[\s/_-]+/g, " ").trim(),
  };
}

/**
 * Housekeeping condition from a report cell: clean, dirty, out of order, out of inventory.
 * Guest words in the same cell (stayover, occupied, departing) are ignored here.
 */
export function parseStatus(raw?: string): RoomStatus | undefined {
  if (!raw?.trim()) return undefined;
  const { compact, spaced } = statusParts(raw);

  if (/\bOUT\s*OF\s*INVENTORY\b|\bOOI\b/.test(spaced) || compact === "OOI" || compact === "OUTOFINVENTORY" || compact === "OUTOFINV") {
    return RoomStatus.OUT_OF_INVENTORY;
  }
  if (/\bOUT\s*OF\s*ORDER\b|\bOOO\b|\bBLOCKED\b/.test(spaced) || compact === "OOO" || compact === "OUTOFORDER" || compact === "BLOCKED") {
    return RoomStatus.OUT_OF_ORDER;
  }
  if (compact === "MAINTENANCE" || compact === "MT" || compact === "REPAIR" || /\bMAINTENANCE\b|\bREPAIR\b/.test(spaced)) {
    return RoomStatus.MAINTENANCE;
  }
  if (compact === "CLEANING" || compact === "INPROGRESS" || compact === "IP" || /\bCLEANING\b|\bIN\s*PROGRESS\b|\bBEING\s*CLEANED\b/.test(spaced)) {
    return RoomStatus.CLEANING;
  }
  if (compact === "INSPECTED" || compact === "INSP" || compact === "PASSED" || /\bINSPECT(ED|ION)?\b|\bPASSED\b/.test(spaced)) {
    return RoomStatus.INSPECTED;
  }
  if (
    compact.includes("DIRTY") ||
    ["D", "VD", "DI", "DU", "OD", "DRTY", "PICKUP", "TOUCHUP", "TURNOVER"].includes(compact) ||
    /\bDIRTY\b|\bPICK\s*UP\b|\bTOUCH\s*UP\b/.test(spaced)
  ) {
    return RoomStatus.VACANT_DIRTY;
  }
  if (
    ["C", "VC", "CL", "CU", "OC", "CLEAN", "READY", "VACANTCLEAN", "READYCLEAN"].includes(compact) ||
    /\bCLEAN\b|\bREADY\b/.test(spaced)
  ) {
    return RoomStatus.VACANT_CLEAN;
  }
  if (/\bVACANT\b/.test(spaced) && /\bD\b/.test(spaced)) return RoomStatus.VACANT_DIRTY;
  if (/\bVACANT\b/.test(spaced) && /\bC\b/.test(spaced)) return RoomStatus.VACANT_CLEAN;
  return undefined;
}

/** Guest stay from a report cell: stayover, departing, checked out, arriving, occupied. */
export function parseGuestStay(raw?: string): GuestStayStatus | undefined {
  if (!raw?.trim()) return undefined;
  const { compact, spaced } = statusParts(raw);

  if (compact === "STAYOVER" || compact === "SO" || compact === "SLEEPOVER" || compact.startsWith("STAYOVER") || /\bSTAY\s*OVER\b|\bSLEEP\s*OVER\b/.test(spaced)) {
    return GuestStayStatus.STAYOVER;
  }
  if (
    ["CHECKEDOUT", "CHECKOUT", "CO", "DEPARTED"].includes(compact) ||
    /\bCHECKED\s*OUT\b|\bCHECK[\s-]*OUT\b/.test(spaced)
  ) {
    return GuestStayStatus.CHECKED_OUT;
  }
  if (
    ["DEPARTING", "DEPARTURE", "DUEOUT", "DO"].includes(compact) ||
    compact.startsWith("DUEOUT") ||
    compact.startsWith("DEPART") ||
    /\bDEPARTING\b|\bDEPARTURE\b|\bDUE\s*OUT\b/.test(spaced)
  ) {
    return GuestStayStatus.DEPARTING;
  }
  if (
    ["ARRIVING", "ARRIVAL", "DUEIN", "CHECKIN", "CHECKEDIN", "ARR"].includes(compact) ||
    compact.startsWith("ARRIV") ||
    /\bARRIV|\bDUE\s*IN\b|\bCHECK[\s-]*IN\b/.test(spaced)
  ) {
    return GuestStayStatus.ARRIVING;
  }
  if (compact === "OD" || compact === "OC" || ["OCCUPIED", "OCC"].includes(compact) || compact.startsWith("OCCUPIED") || /\bOCCUPIED\b|\bOCC\b/.test(spaced)) {
    return GuestStayStatus.OCCUPIED;
  }
  if (compact === "MAINTENANCE" || compact === "MAINT" || /\bMAINTENANCE\b|\bMAINT\b/.test(spaced)) {
    return GuestStayStatus.MAINTENANCE;
  }
  if (compact === "VACANT" || compact === "EMPTY" || /\bVACANT\b/.test(spaced)) {
    return GuestStayStatus.VACANT;
  }
  return undefined;
}

export function isReportStatus(raw?: string) {
  return Boolean(parseStatus(raw) || parseGuestStay(raw));
}

function statusesFromRow(row: HkListRow) {
  const fromStatus = {
    hk: parseStatus(row.status),
    guest: parseGuestStay(row.status),
  };
  const fromGuestColumn = parseGuestStay(row.guestStatus);
  return {
    hk: fromStatus.hk,
    guest: fromGuestColumn ?? fromStatus.guest,
  };
}

function looksLikeRoomType(value: string) {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (isReportStatus(v)) return false;
  return /suite|standard|deluxe|king|queen|twin|double|single|studio|accessible|ada|connecting|family|executive|premium|villa|cottage|room/.test(
    v
  );
}

function resolveAmbiguousTypeOrStatus(value: string): { status?: string; roomType?: string } {
  const v = value.trim();
  if (!v) return {};
  if (isReportStatus(v)) return { status: v };
  if (looksLikeRoomType(v)) return { roomType: v };
  // Unknown short codes often are status (DI, CL) already handled by parseStatus
  return { roomType: v };
}

function cleaningForStatus(status: RoomStatus): CleaningStatus | undefined {
  if (status === RoomStatus.VACANT_DIRTY || status === RoomStatus.OUT_OF_ORDER || status === RoomStatus.OUT_OF_INVENTORY) {
    return CleaningStatus.NOT_STARTED;
  }
  if (status === RoomStatus.VACANT_CLEAN || status === RoomStatus.INSPECTED) {
    return CleaningStatus.COMPLETED;
  }
  if (status === RoomStatus.CLEANING) {
    return CleaningStatus.IN_PROGRESS;
  }
  return undefined;
}

function parseBool(v?: string) {
  if (!v) return false;
  return ["1", "true", "yes", "y", "rush", "vip"].includes(v.trim().toLowerCase());
}

/** Infer floor from room number: 101→1, 220→2, 1005→10, "A-201"→2 */
export function inferFloorFromRoomNumber(roomNumber: string, explicitFloor?: number): number {
  if (explicitFloor != null && Number.isFinite(explicitFloor) && explicitFloor > 0) {
    return Math.floor(explicitFloor);
  }
  const digits = String(roomNumber).replace(/\D/g, "");
  if (!digits) return 1;
  if (digits.length <= 2) return 1;
  if (digits.length === 3) return Number(digits[0]) || 1;
  if (digits.length === 4) return Number(digits.slice(0, 2)) || 1;
  return Number(digits.slice(0, digits.length - 2)) || 1;
}

function normalizeRoomType(raw?: string) {
  const t = (raw || "").trim();
  if (!t) return "Standard";
  return t.replace(/\s+/g, " ");
}

function detectDelimiter(headerLine: string) {
  const counts = {
    ",": (headerLine.match(/,/g) || []).length,
    ";": (headerLine.match(/;/g) || []).length,
    "\t": (headerLine.match(/\t/g) || []).length,
  };
  const best = (Object.entries(counts) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

function looksLikeRoomNumber(value: string) {
  const v = value.trim();
  if (!v || v.length > 12) return false;
  // Reject common header/footer junk
  if (/^(room|type|status|floor|total|page|date|guest|notes?|vip|rush|description)$/i.test(v)) return false;
  // 101, 1001, A101, 12A, 101A
  return /^(?:[A-Za-z]-?)?\d{2,4}[A-Za-z]?$/.test(v);
}

/** True when the whole line is only a room number (description is on the next line). */
function isStandaloneRoomNumberLine(line: string) {
  const v = line.trim();
  // Allow optional leading # or "Room "
  const stripped = v.replace(/^#\s*/, "").replace(/^room\s+/i, "").trim();
  return looksLikeRoomNumber(stripped);
}

function extractRoomNumberFromLine(line: string) {
  const v = line.trim().replace(/^#\s*/, "").replace(/^room\s+/i, "").trim();
  if (looksLikeRoomNumber(v)) return v;
  // "101 King Suite" → 101
  const m = v.match(/^((?:[A-Za-z]-?)?\d{2,4}[A-Za-z]?)\b/);
  return m && looksLikeRoomNumber(m[1]) ? m[1] : null;
}

/** True when line is "101 King…" or "101 Dirty" (room + more on same line). */
function isInlineRoomLine(line: string) {
  if (isStandaloneRoomNumberLine(line)) return false;
  const roomNo = extractRoomNumberFromLine(line);
  if (!roomNo) return false;
  const stripped = line.trim().replace(/^#\s*/, "").replace(/^room\s+/i, "").trim();
  return stripped === roomNo || stripped.startsWith(roomNo + " ") || stripped.startsWith(roomNo + "\t");
}

function isJunkReportLine(line: string) {
  return /^(page\s*\d+|housekeeping|report|printed|date|total|continued|confidential)/i.test(line.trim());
}

function looksLikePersonName(value: string) {
  const v = value.trim();
  if (!v || v.length > 40) return false;
  if (isReportStatus(v) || looksLikeRoomType(v) || looksLikeRoomNumber(v)) return false;
  // Two+ words starting with capital, or single capitalized name
  return /^[A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){0,3}$/.test(v);
}

/**
 * Convert reports where each room is:
 *   101
 *   King Non-Smoking
 *   Dirty
 * into CSV rows. Also handles "101 King Non-Smoking" on one line.
 */
export function stackedRoomsToCsv(raw: string): string | null {
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !isJunkReportLine(l));

  if (lines.length < 2) return null;

  // Count standalone room-number lines followed by a description line
  let stackedPairs = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (isStandaloneRoomNumberLine(lines[i]) && !isStandaloneRoomNumberLine(lines[i + 1])) {
      stackedPairs += 1;
    }
  }

  // Prefer stacked layout when many rooms use number-on-own-line format
  const standaloneCount = lines.filter((l) => isStandaloneRoomNumberLine(l)).length;
  const useStacked = stackedPairs >= 2 || (standaloneCount >= 3 && stackedPairs >= standaloneCount * 0.5);
  if (!useStacked) return null;

  const rows: string[] = ["Room,Room Type,Status,Housekeeper"];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!isStandaloneRoomNumberLine(line)) {
      // Same-line: "101 King Non-Smoking" or "101 Dirty"
      const roomNo = extractRoomNumberFromLine(line);
      if (roomNo && line.trim().length > roomNo.length) {
        const rest = line.trim().slice(line.trim().indexOf(roomNo) + roomNo.length).trim();
        if (isReportStatus(rest) && !looksLikeRoomType(rest)) {
          rows.push([roomNo, "", csvEscape(rest), ""].join(","));
        } else {
          // May be "King Dirty" or just type
          const statusMatch = rest.match(/\b(dirty|clean|vacant\s*dirty|vacant\s*clean|out\s*of\s*order|out\s*of\s*inventory|vd|vc|di|cl|ooo|ooi|occupied|stay\s*over|stayover|departing|departure|due\s*out|checked\s*out|checkout|arriving|arrival|cleaning|inspected|maintenance)\b/i);
          if (statusMatch) {
            const status = statusMatch[0];
            const type = rest.replace(statusMatch[0], "").replace(/[|/,-]+/g, " ").trim();
            rows.push([roomNo, csvEscape(type || "Standard"), csvEscape(status), ""].join(","));
          } else {
            rows.push([roomNo, csvEscape(rest), "", ""].join(","));
          }
        }
      }
      i += 1;
      continue;
    }

    const roomNumber = extractRoomNumberFromLine(line)!;
    let roomType = "";
    let status = "";
    let housekeeper = "";
    i += 1;

    // Following lines until next room number: type, optional status, optional attendant
    while (i < lines.length && !isStandaloneRoomNumberLine(lines[i])) {
      const next = lines[i];
      // "105 Dirty" / "106 King" starts a new room on the same line — stop
      if (isInlineRoomLine(next)) break;

      if (isReportStatus(next) && !looksLikeRoomType(next)) {
        if (!status) status = next;
      } else if (looksLikePersonName(next) && roomType) {
        if (!housekeeper) housekeeper = next;
      } else if (!roomType) {
        roomType = next;
      } else if (!status && isReportStatus(next)) {
        status = next;
      } else if (!housekeeper && looksLikePersonName(next)) {
        housekeeper = next;
      } else if (!status) {
        const maybe = isReportStatus(next);
        if (maybe) status = next;
        else roomType = `${roomType} ${next}`.trim();
      }
      i += 1;
    }

    rows.push(
      [roomNumber, csvEscape(roomType || "Standard"), csvEscape(status), csvEscape(housekeeper)].join(",")
    );
  }

  return rows.length > 1 ? rows.join("\n") : null;
}

function csvEscapeLocal(value: string) {
  if (!value) return "";
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// alias used above before rename — keep one helper name
function csvEscape(value: string) {
  return csvEscapeLocal(value);
}

function normalizeRoomNumber(value: string) {
  return String(value).trim().replace(/^#\s*/, "").replace(/^room\s+/i, "").trim();
}

/** Collapse report rows to one entry per room number (last wins). */
export function dedupeBuildRows(rows: HkListRow[]): HkListRow[] {
  const map = new Map<string, HkListRow>();
  for (const row of rows) {
    const roomNumber = normalizeRoomNumber(row.roomNumber || "");
    if (!looksLikeRoomNumber(roomNumber)) continue;
    map.set(roomNumber, {
      ...row,
      roomNumber,
      roomType: normalizeRoomType(row.roomType),
      floor: row.floor && row.floor > 0 ? row.floor : inferFloorFromRoomNumber(roomNumber, row.floor),
    });
  }
  return [...map.values()].sort((a, b) =>
    a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
  );
}

function findHousekeeper(
  users: Array<{ id: string; name: string; email: string }>,
  email?: string,
  name?: string
) {
  if (email?.trim()) {
    const byEmail = users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (byEmail) return byEmail;
  }
  if (!name?.trim()) return null;

  const needle = name.trim().toLowerCase();
  const exact = users.find((x) => x.name.toLowerCase() === needle);
  if (exact) return exact;

  const starts = users.find(
    (x) => x.name.toLowerCase().startsWith(needle) || needle.startsWith(x.name.toLowerCase().split(" ")[0])
  );
  if (starts) return starts;

  return users.find((x) => x.name.toLowerCase().includes(needle) || needle.includes(x.name.toLowerCase())) || null;
}

/** Parse CSV / TSV / semicolon text into housekeeping rows. */
export function parseHkListCsv(text: string): HkListRow[] {
  // Reports with room number on one line and description on the next
  const stacked = stackedRoomsToCsv(text);
  const source = stacked || text;

  const lines = source
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const delimiter = detectDelimiter(lines[0]);
  let headerLine = lines[0];
  let dataLines = lines.slice(1);

  let headers = splitCsvLine(headerLine, delimiter).map(normalizeHeader);
  let mapped: Array<keyof HkListRow | "ambiguousType" | undefined> = headers.map((h) => {
    if (HEADER_MAP[h]) return HEADER_MAP[h];
    if (h === "type") return "ambiguousType";
    const guestColumn =
      h.includes("gueststatus") ||
      h.includes("occupan") ||
      h.includes("reservation") ||
      h.includes("frontoffice") ||
      h.includes("staystatus") ||
      h === "fostatus" ||
      h === "fo";
    if (guestColumn) return "guestStatus";
    // Any remaining header containing status/condition → housekeeping status
    if (h.includes("status") || h.includes("condition") || (h.endsWith("code") && (h.includes("hk") || h.includes("rm")))) {
      return "status";
    }
    if (h.includes("type") || h.includes("category")) return "roomType";
    if (h.includes("attendant") || h.includes("housekeep") || h.includes("maid") || h.includes("assign")) {
      return "housekeeperName";
    }
    return undefined;
  });

  const hasRoomHeader = mapped.includes("roomNumber");

  // No recognizable header — treat first line as data if it starts with a room number
  if (!hasRoomHeader) {
    const firstCols =
      delimiter === "," && !lines[0].includes(",") && !lines[0].includes(";") && !lines[0].includes("\t")
        ? lines[0].split(/\s+/).filter(Boolean)
        : splitCsvLine(lines[0], delimiter);

    if (looksLikeRoomNumber(firstCols[0] || "")) {
      // Space-separated report without headers
      if (firstCols.length >= 2 && !lines[0].includes(delimiter === "\t" ? "\t" : delimiter)) {
        const rows: HkListRow[] = [];
        for (const line of lines) {
          const parts = line.split(/\s+/).filter(Boolean);
          if (!looksLikeRoomNumber(parts[0] || "")) continue;
          const rest = parts.slice(1).join(" ");
          if (isReportStatus(rest) && !looksLikeRoomType(rest)) {
            rows.push({ roomNumber: parts[0], status: rest });
          } else if (isReportStatus(parts[1] || "") && !looksLikeRoomType(parts[1] || "")) {
            rows.push({
              roomNumber: parts[0],
              status: parts[1],
              housekeeperName: parts.slice(2).join(" ") || undefined,
            });
          } else {
            // "101 King Non-Smoking" → type, not status
            rows.push({
              roomNumber: parts[0],
              roomType: rest,
            });
          }
        }
        return rows;
      }
      headerLine = "Room,Status,Housekeeper,Room Type";
      headers = splitCsvLine(headerLine, ",").map(normalizeHeader);
      mapped = headers.map((h) => HEADER_MAP[h]);
      dataLines = lines;
    } else {
      return [];
    }
  }

  const rows: HkListRow[] = [];
  for (const line of dataLines) {
    const cols = splitCsvLine(line, delimiter);
    // Skip repeated header rows mid-file
    if (normalizeHeader(cols[0] || "") === "room" || normalizeHeader(cols[0] || "") === "roomnumber") {
      continue;
    }
    const row: Partial<HkListRow> = {};
    const extras: string[] = [];

    cols.forEach((val, i) => {
      const key = mapped[i];
      const trimmed = val.trim();
      if (!trimmed) return;

      if (key === "ambiguousType") {
        const resolved = resolveAmbiguousTypeOrStatus(trimmed);
        if (resolved.status && !row.status) row.status = resolved.status;
        if (resolved.roomType && !row.roomType) row.roomType = resolved.roomType;
        return;
      }
      if (!key) {
        extras.push(trimmed);
        return;
      }
      if (key === "priority" || key === "estimatedMinutes" || key === "floor") {
        (row as Record<string, unknown>)[key] = Number(trimmed) || 0;
      } else if (key === "rush" || key === "vip") {
        (row as Record<string, unknown>)[key] = parseBool(trimmed);
      } else {
        (row as Record<string, unknown>)[key] = trimmed;
      }
    });

    // Headerless / misaligned fallback: col0 room, col1 status, col2 housekeeper
    if (!row.roomNumber && looksLikeRoomNumber(cols[0] || "")) {
      row.roomNumber = cols[0].trim();
      if (cols[1] && !row.status) row.status = cols[1].trim();
      if (cols[2] && !row.housekeeperName) row.housekeeperName = cols[2].trim();
      if (cols[3] && !row.roomType) row.roomType = cols[3].trim();
    }

    // If status still missing, scan every cell for a recognizable status value
    if (!row.status || !isReportStatus(row.status)) {
      for (const cell of [...cols, ...extras]) {
        if (isReportStatus(cell) && cell.trim() !== row.guestStatus) {
          row.status = cell.trim();
          break;
        }
      }
    }

    if (row.roomNumber) rows.push(row as HkListRow);
  }
  return rows;
}

function splitCsvLine(line: string, delimiter: string) {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export type HkImportMode = "build" | "update";

/**
 * Apply a housekeeping list.
 * - build: make property rooms EXACTLY match report (room number + type); removes extras
 * - update: update status/assignments for existing rooms only (never creates extras)
 */
export async function applyHkListRows(
  hotelId: string,
  rows: HkListRow[],
  mode: HkImportMode = "update"
): Promise<HkApplyResult> {
  const [users, hotel] = await Promise.all([
    prisma.user.findMany({
      where: { hotelId, role: "HOUSEKEEPER", active: true },
    }),
    prisma.hotel.findUnique({ where: { id: hotelId } }),
  ]);

  let updated = 0;
  let created = 0;
  let removed = 0;
  let skipped = 0;
  let assigned = 0;
  let unassigned = 0;
  let markedDirty = 0;
  let markedClean = 0;
  let statusApplied = 0;
  let statusMissing = 0;
  let maxFloor = hotel?.floors ?? 1;
  const errors: string[] = [];
  const warnings: string[] = [];
  const unmappedStatusSamples: string[] = [];

  if (mode === "build") {
    const buildRows = dedupeBuildRows(rows);
    if (!buildRows.length) {
      return {
        updated: 0,
        created: 0,
        removed: 0,
        skipped: rows.length,
        assigned: 0,
        unassigned: 0,
        markedDirty: 0,
        markedClean: 0,
        statusApplied: 0,
        statusMissing: 0,
        total: rows.length,
        errors: ["No valid room numbers found in the report"],
        warnings: [],
        unmappedStatusSamples: [],
      };
    }

    const reportNumbers = new Set(buildRows.map((r) => r.roomNumber));

    // Remove rooms that are NOT on the report so the property matches exactly
    const extras = await prisma.room.findMany({
      where: { hotelId, number: { notIn: [...reportNumbers] } },
      select: { id: true, number: true },
    });
    if (extras.length) {
      await prisma.room.deleteMany({
        where: { id: { in: extras.map((r) => r.id) } },
      });
      removed = extras.length;
      warnings.push(
        `Removed ${removed} room(s) not listed in the report so the hotel matches exactly: ${extras
          .slice(0, 15)
          .map((r) => r.number)
          .join(", ")}${extras.length > 15 ? "…" : ""}`
      );
    }

    for (const row of buildRows) {
      const floor = inferFloorFromRoomNumber(row.roomNumber, row.floor);
      const roomType = normalizeRoomType(row.roomType);
      maxFloor = Math.max(maxFloor, floor);

      const parsed = statusesFromRow(row);
      const status = parsed.hk;
      if (status || parsed.guest) statusApplied += 1;
      else statusMissing += 1;

      const existing = await prisma.room.findFirst({
        where: { hotelId, number: row.roomNumber },
      });

      if (!existing) {
        const initialStatus = status ?? RoomStatus.VACANT_CLEAN;
        try {
          await prisma.room.create({
            data: {
              hotelId,
              number: row.roomNumber,
              floor,
              type: roomType,
              status: initialStatus,
              ...(parsed.guest ? { guestStatus: parsed.guest } : {}),
              cleaningStatus: cleaningForStatus(initialStatus) ?? CleaningStatus.COMPLETED,
              manualLock: true,
              checklistItems: {
                create: DEFAULT_CHECKLIST_ITEMS.map((label, idx) => ({
                  label,
                  sortOrder: idx,
                  completed: false,
                })),
              },
            },
          });
          created += 1;
          if (initialStatus === RoomStatus.VACANT_DIRTY) markedDirty += 1;
          if (initialStatus === RoomStatus.VACANT_CLEAN || initialStatus === RoomStatus.INSPECTED) {
            markedClean += 1;
          }
        } catch {
          skipped += 1;
          errors.push(`Could not create room ${row.roomNumber}`);
        }
      } else {
        await prisma.room.update({
          where: { id: existing.id },
          data: {
            floor,
            type: roomType,
            ...(status
              ? { status, cleaningStatus: cleaningForStatus(status) ?? CleaningStatus.NOT_STARTED }
              : {}),
            ...(parsed.guest ? { guestStatus: parsed.guest } : {}),
            manualLock: true,
          },
        });
        if (status === RoomStatus.VACANT_DIRTY) {
          await resetRoomChecklist(existing.id);
        }
        updated += 1;
        if (status === RoomStatus.VACANT_DIRTY) markedDirty += 1;
        if (status === RoomStatus.VACANT_CLEAN || status === RoomStatus.INSPECTED) markedClean += 1;
      }
    }

    if (hotel) {
      await prisma.hotel.update({
        where: { id: hotelId },
        data: { floors: Math.max(maxFloor, 1) },
      });
    }

    return {
      updated,
      created,
      removed,
      skipped,
      assigned: 0,
      unassigned: 0,
      markedDirty,
      markedClean,
      statusApplied,
      statusMissing,
      total: buildRows.length,
      errors,
      warnings: warnings.slice(0, 25),
      unmappedStatusSamples,
    };
  }

  // --- update mode: never create or delete rooms ---
  for (const row of rows) {
    const roomNumber = normalizeRoomNumber(row.roomNumber);
    if (!looksLikeRoomNumber(roomNumber)) {
      skipped += 1;
      continue;
    }

    const room = await prisma.room.findFirst({
      where: { hotelId, number: roomNumber },
    });

    const roomType = normalizeRoomType(row.roomType);
    const parsed = statusesFromRow(row);
    const status = parsed.hk;
    const rawStatus = [row.status, row.guestStatus].filter(Boolean).join(" / ");
    if (!status && !parsed.guest && rawStatus.trim()) {
      if (unmappedStatusSamples.length < 8 && !unmappedStatusSamples.includes(rawStatus.trim())) {
        unmappedStatusSamples.push(rawStatus.trim());
      }
      warnings.push(`Room ${roomNumber}: unrecognized status "${rawStatus}"`);
      statusMissing += 1;
    } else if (!status && !parsed.guest) {
      statusMissing += 1;
    }

    if (!room) {
      skipped += 1;
      warnings.push(`Room ${roomNumber} not in property — skipped (use Build Property to set the room list)`);
      continue;
    }

    const cleaningStatus = status ? cleaningForStatus(status) : undefined;
    if (status || parsed.guest) statusApplied += 1;

    const hasHkColumn = row.housekeeperEmail !== undefined || row.housekeeperName !== undefined;
    let housekeeperId: string | null | undefined = undefined;

    if (hasHkColumn) {
      const email = row.housekeeperEmail?.trim() || "";
      const name = row.housekeeperName?.trim() || "";
      if (!email && !name) {
        housekeeperId = null;
        unassigned += 1;
      } else {
        const matched = findHousekeeper(users, email || undefined, name || undefined);
        if (matched) {
          housekeeperId = matched.id;
          assigned += 1;
        } else {
          warnings.push(`Room ${roomNumber}: housekeeper "${email || name}" not found — status still updated`);
          housekeeperId = room.housekeeperId;
        }
      }
    }

    if (status === RoomStatus.VACANT_DIRTY) markedDirty += 1;
    if (status === RoomStatus.VACANT_CLEAN || status === RoomStatus.INSPECTED) markedClean += 1;

    await prisma.room.update({
      where: { id: room.id },
      data: {
        ...(status ? { status, cleaningStatus: cleaningStatus ?? CleaningStatus.NOT_STARTED } : {}),
        ...(parsed.guest ? { guestStatus: parsed.guest } : {}),
        ...(row.roomType ? { type: roomType } : {}),
        ...(housekeeperId !== undefined ? { housekeeperId } : {}),
        ...(row.priority != null ? { priority: Number(row.priority) } : {}),
        ...(row.rush != null ? { isRush: Boolean(row.rush) } : {}),
        ...(row.vip != null ? { isVip: Boolean(row.vip) } : {}),
        ...(row.guestName ? { guestName: row.guestName } : {}),
        ...(row.notes ? { frontDeskNotes: row.notes } : {}),
        ...(row.estimatedMinutes != null ? { estimatedMinutes: Number(row.estimatedMinutes) } : {}),
        manualLock: true,
      },
    });
    if (status === RoomStatus.VACANT_DIRTY) {
      await resetRoomChecklist(room.id);
    }
    updated += 1;
  }

  return {
    updated,
    created,
    removed: 0,
    skipped,
    assigned,
    unassigned,
    markedDirty,
    markedClean,
    statusApplied,
    statusMissing,
    total: rows.length,
    errors,
    warnings: warnings.slice(0, 25),
    unmappedStatusSamples,
  };
}
