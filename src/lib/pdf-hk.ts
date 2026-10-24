import { extractText, getDocumentProxy } from "unpdf";
import { stackedRoomsToCsv } from "@/lib/hk-upload";
import { isReportRoomHeader } from "@/lib/pms/report-catalog";

/**
 * Extract plain text from a PDF buffer (housekeeping lists exported as PDF).
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const joined = Array.isArray(text) ? text.join("\n") : String(text || "");
  return joined.trim();
}

/**
 * Convert PDF text into CSV that parseHkListCsv can read.
 * Supports CSV tables, stacked "room number then description below", and simple one-line rows.
 */
const ROOM_LIST_DETAIL =
  /^([A-Za-z]{1,4}\d+)\s+(Dirty|Clean|Ready|Pickup|Inspected)\s+(Occupied|Vacant)(?:\s+(Stay\s*Overs|Checked\s*Out|Arrivals|Arrival|Due\s*Out))?(?:\s+(.*))?$/i;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Synxis-style room list:
 *   101 RM2 Dirty Occupied Stay Overs Oct 04 Oct 09
 *   201
 *   Pet Friendly
 *   RM2 Dirty Occupied Stay Overs Sep 27 Oct 23
 */
function reportYear(raw: string) {
  const match = raw.match(/\b\d{1,2}\/\d{1,2}\/(20\d{2})\b/);
  return match ? Number(match[1]) : new Date().getFullYear();
}

function monthDay(token: string, year: number) {
  const match = token.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
  if (!match) return "";
  const month = MONTHS.indexOf(match[1].toLowerCase());
  if (month < 0) return "";
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

/** Synxis Room List PDF: Room, Room Type, Housekeeping Status, Occupancy Status, Guest Status. */
export function printedRoomListToCsv(raw: string): string | null {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 3) return null;

  const year = reportYear(raw);
  const rows: string[][] = [];
  let pendingRoom = "";
  let petFriendly = false;

  for (const line of lines) {
    if (/^pet friendly$/i.test(line)) {
      petFriendly = true;
      continue;
    }
    if (/^\d{2,4}$/.test(line)) {
      pendingRoom = line;
      continue;
    }
    if (
      /^(room|type|housekeeping|status|occupancy|guest|check-in|check-out|ooo\/ooi|notes)$/i.test(line) ||
      /page\s+\d+\s+of\s+\d+/i.test(line) ||
      /^room list\b/i.test(line) ||
      /^\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(line)
    ) {
      continue;
    }

    let roomNumber = pendingRoom;
    let rest = line;
    const inline = line.match(/^(\d{2,4})\s+(.+)$/);
    if (inline) {
      roomNumber = inline[1];
      rest = inline[2];
      pendingRoom = "";
    }
    const detail = rest.match(ROOM_LIST_DETAIL);
    if (!roomNumber || !detail) continue;

    const dates = [...(detail[5] || "").matchAll(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/gi)].map((match) =>
      match[0]
    );
    const checkIn = dates[0] ? monthDay(dates[0], year) : "";
    let checkOut = dates[1] ? monthDay(dates[1], year) : "";
    if (checkIn && checkOut && checkOut < checkIn) {
      checkOut = monthDay(dates[1], year + 1);
    }
    const notes = [
      petFriendly ? "Pet Friendly" : "",
      (detail[5] || "").replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/gi, "").trim(),
    ]
      .filter(Boolean)
      .join(" · ");
    rows.push([
      roomNumber,
      detail[1],
      detail[2],
      detail[3],
      detail[4] || "",
      checkIn,
      checkOut,
      csvEscape(notes),
    ]);
    petFriendly = false;
    pendingRoom = "";
  }

  if (rows.length < 5) return null;
  return [
    "Room,Room Type,Housekeeping Status,Occupancy Status,Guest Status,Check-In,Check-Out,Notes",
    ...rows.map((row) => row.join(",")),
  ].join("\n");
}

const CHECKOFF_STATUS =
  /^(?:(\d+)\/(\d+)\s+)?(VAC|OCC)\s+(Dirty|Ready|Clean)(?:\s+(.*))?$/i;

function slashDate(token: string) {
  const match = token.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return "";
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return `${year}-${String(Number(match[1])).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

function pushCheckOffRow(
  rows: string[][],
  input: {
    room: string;
    type: string;
    occupancyCode: string;
    condition: string;
    tail?: string;
  }
) {
  let tail = (input.tail || "").trim();
  let stay = "";
  if (/^stay\b/i.test(tail)) {
    stay = "Stayover";
    tail = tail.replace(/^stay\s*/i, "");
  } else if (/^c\/o\b/i.test(tail)) {
    stay = input.occupancyCode.toUpperCase() === "OCC" ? "Departing" : "Checked Out";
    tail = tail.replace(/^c\/o\s*/i, "");
  } else if (/\bstay(?:over)?\b/i.test(tail)) {
    stay = "Stayover";
  } else if (/\bc\/o\b|\bcheck(?:ed)?\s*out\b/i.test(tail)) {
    stay = input.occupancyCode.toUpperCase() === "OCC" ? "Departing" : "Checked Out";
  }
  if (/^full\b/i.test(tail)) tail = tail.replace(/^full\s*/i, "");

  const dateTokens = [...tail.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)].map((match) => match[0]);
  const beforeDates = tail.split(/\d{1,2}\/\d{1,2}\/\d{2,4}/)[0].trim();
  const attendant = beforeDates.match(/^([A-Z])\s+(.+)$/);
  let housekeeper = "";
  let notes = "";
  if (attendant) {
    if (/^inspection$/i.test(attendant[2])) notes = "Inspection";
    else housekeeper = attendant[2];
  } else if (beforeDates && !/^(stay|c\/o|full)$/i.test(beforeDates)) {
    notes = beforeDates;
  }

  const dates = dateTokens.map(slashDate).filter(Boolean);
  const checkIn = dates.length >= 2 ? dates[0] : dates[0] || "";
  const checkOut = dates.length >= 2 ? dates[1] : "";
  const afterDates = tail
    .split(/\d{1,2}\/\d{1,2}\/\d{2,4}/)
    .slice(1)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (afterDates) notes = [notes, afterDates].filter(Boolean).join(" · ");
  const occupancy = input.occupancyCode.toUpperCase() === "OCC" ? "Occupied" : "Vacant";
  const guest = stay || (occupancy === "Occupied" ? "Occupied" : "Vacant");
  const condition = /^dirty$/i.test(input.condition) ? "Dirty" : "Ready";

  rows.push([
    input.room,
    input.type || "STD",
    condition,
    occupancy,
    guest,
    housekeeper,
    checkIn,
    checkOut,
    csvEscape(notes),
  ]);
}

function parseCheckOffTableLine(line: string, rows: string[][]) {
  const cells = line
    .split(/\t|\s{2,}/)
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (cells.length < 3) return false;
  if (!/^\d{3,4}$/.test(cells[0])) return false;
  if (/^room$/i.test(cells[0])) return false;

  const occupancy = cells.find((cell) => /^(VAC|OCC)$/i.test(cell));
  const condition = cells.find((cell) => /^(Dirty|Ready|Clean)$/i.test(cell));
  if (!occupancy || !condition) return false;

  const type = cells[1] && !/^\d+$/.test(cells[1]) && !/^(VAC|OCC)$/i.test(cells[1]) ? cells[1] : "STD";
  const occIndex = cells.findIndex((cell) => /^(VAC|OCC)$/i.test(cell));
  const condIndex = cells.findIndex((cell) => /^(Dirty|Ready|Clean)$/i.test(cell));
  const tailStart = Math.max(occIndex, condIndex) + 1;
  const tail = cells.slice(tailStart).join(" ");
  pushCheckOffRow(rows, {
    room: cells[0],
    type,
    occupancyCode: occupancy,
    condition,
    tail,
  });
  return true;
}

/**
 * SkyTouch and Choice Advantage "Housekeeping Check-Off List".
 * Room, Type, People, Status (VAC/OCC), Condition (Dirty/Ready), Stay/C/O, housekeeper, arrival, departure.
 * Also accepts on-screen HTML table text (tab / multi-space separated).
 */
export function housekeepingCheckOffToCsv(raw: string): string | null {
  const looksLikeCheckOff =
    /housekeeping check-off list/i.test(raw) ||
    (/\b(VAC|OCC)\b/i.test(raw) && /\b(Dirty|Ready|Clean)\b/i.test(raw) && /\b\d{3,4}\b/.test(raw));
  if (!looksLikeCheckOff) return null;

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rows: string[][] = [];
  let pending: { room: string; type: string; rest: string } | null = null;

  const flush = () => {
    if (!pending?.rest) return;
    const status = pending.rest.match(CHECKOFF_STATUS);
    if (!status) {
      pending = null;
      return;
    }
    pushCheckOffRow(rows, {
      room: pending.room,
      type: pending.type,
      occupancyCode: status[3],
      condition: status[4],
      tail: status[5] || "",
    });
    pending = null;
  };

  for (const line of lines) {
    if (
      /housekeeping check-off list|business date|property name|property code|date\/time of printing|software version/i.test(line) ||
      /^(room|type|people|status|condition|stay\/c\/o|service|housekeeper|update|notes|special|requests|arrival|departure|last clean)$/i.test(line) ||
      /^page\s+\d+\s+of\s+\d+/i.test(line)
    ) {
      continue;
    }

    if (parseCheckOffTableLine(line, rows)) {
      pending = null;
      continue;
    }

    // One-line room rows from the on-screen report window.
    const oneLine = line.match(
      /^(\d{3,4})\s+([A-Za-z][A-Za-z0-9/-]*)\s+(?:(\d+)\s+)?(VAC|OCC)\s+(Dirty|Ready|Clean)(?:\s+(.*))?$/i
    );
    if (oneLine) {
      pending = null;
      pushCheckOffRow(rows, {
        room: oneLine[1],
        type: oneLine[2],
        occupancyCode: oneLine[4],
        condition: oneLine[5],
        tail: oneLine[6] || "",
      });
      continue;
    }

    if (pending && !pending.rest && /^[A-Z]{1,3}$/.test(line)) {
      pending.type += line;
      continue;
    }

    if (pending && !pending.rest && CHECKOFF_STATUS.test(line)) {
      pending.rest = line;
      flush();
      continue;
    }

    const roomLine = line.match(/^(\d{3,4})\s+([A-Z][A-Z0-9]*)(?:\s+(.*))?$/);
    if (!roomLine) continue;
    flush();
    pending = { room: roomLine[1], type: roomLine[2], rest: (roomLine[3] || "").trim() };
    if (pending.rest) flush();
  }
  flush();

  if (!rows.length) return null;
  return [
    "Room,Room Type,Housekeeping Status,Occupancy Status,Guest Status,Housekeeper,Check-In,Check-Out,Notes",
    ...rows.map((row) => row.join(",")),
  ].join("\n");
}

export function pdfTextToCsv(raw: string): string {
  // Prefer stacked room-number + description layout (common on printed HK PDFs)
  const stacked = stackedRoomsToCsv(raw);
  if (stacked) return stacked;

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return "";

  // Already looks like CSV
  const commaLines = lines.filter((l) => l.includes(","));
  if (commaLines.length >= 2 && /room/i.test(commaLines[0])) {
    return commaLines.join("\n");
  }
  if (commaLines.length >= 1 && !/room/i.test(lines[0]) && /^\d{3,4}\s*,/.test(commaLines[0])) {
    return ["Room,Status,Housekeeper,Priority,Rush,VIP,Notes", ...commaLines].join("\n");
  }

  // Tab or multi-space separated table
  const splitRow = (line: string) =>
    line.includes("\t")
      ? line.split("\t").map((c) => c.trim())
      : line
          .split(/\s{2,}|\s*\|\s*/)
          .map((c) => c.trim())
          .filter(Boolean);

  const headerIdx = lines.findIndex((l) => {
    const cells = splitRow(l).map((c) => c.toLowerCase());
    return cells.some((c) => isReportRoomHeader(c));
  });

  if (headerIdx >= 0) {
    const headerCells = splitRow(lines[headerIdx]);
    const rows = [headerCells.join(",")];
    for (const line of lines.slice(headerIdx + 1)) {
      const cells = splitRow(line);
      if (!cells.length) continue;
      if (/^page\s*\d+/i.test(cells[0]) || /housekeeping list/i.test(line)) continue;
      rows.push(cells.map(csvEscape).join(","));
    }
    return rows.join("\n");
  }

  // Fallback: lines starting with a room number + rest on same line
  const dataRows: string[] = [];
  for (const line of lines) {
    const m = line.match(/^((?:[A-Za-z]-?)?\d{2,4}[A-Za-z]?)\s+(.+)$/);
    if (!m) continue;
    dataRows.push([m[1], csvEscape(m[2]), ""].join(","));
  }

  if (!dataRows.length) {
    if (raw.includes(",") && /room/i.test(raw)) return raw;
    // Last resort: return raw so stacked parser inside parseHkListCsv can still try
    return raw;
  }

  return ["Room,Room Type,Status", ...dataRows].join("\n");
}
