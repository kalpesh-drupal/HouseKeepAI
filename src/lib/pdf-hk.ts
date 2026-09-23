import { extractText, getDocumentProxy } from "unpdf";
import { stackedRoomsToCsv } from "@/lib/hk-upload";

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
    return cells.some((c) => c === "room" || c === "room#" || c === "room no" || c === "roomno");
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

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
