import { applyHkListRows, dedupeBuildRows, HkImportMode, parsePmsHkReport, pmsReportError, resolvePmsRowStatus } from "@/lib/hk-upload";
import { extractPdfText, housekeepingCheckOffToCsv, pdfTextToCsv, printedRoomListToCsv } from "@/lib/pdf-hk";
import { prisma } from "@/lib/prisma";
import { getReportPms } from "@/lib/pms/report-catalog";

export type ReportFileInput = {
  hotelId: string;
  reportPms: string;
  mode?: HkImportMode;
  filename?: string;
  mime?: string;
  buffer: Buffer;
};

/**
 * Parse a downloaded PMS housekeeping file the same way manual upload does.
 */
export async function importPmsReportFile(input: ReportFileInput) {
  const profile = getReportPms(input.reportPms);
  if (!profile) {
    throw new Error("Unknown PMS report type");
  }

  const name = (input.filename || "report.csv").toLowerCase();
  const mime = input.mime || "";
  let text = "";
  let rawText = "";
  let sourceFormat = "csv";

  if (name.endsWith(".pdf") || mime === "application/pdf") {
    sourceFormat = "pdf";
    const pdfText = await extractPdfText(input.buffer);
    rawText = pdfText;
    if (!pdfText) {
      throw new Error("Could not read text from the downloaded PDF.");
    }
    text = pdfTextToCsv(pdfText);
    if (!text.trim()) {
      throw new Error("PDF downloaded but no room rows were detected.");
    }
  } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    sourceFormat = "excel";
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(input.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    text = XLSX.utils.sheet_to_csv(sheet);
    rawText = text;
  } else {
    sourceFormat = name.endsWith(".tsv") ? "tsv" : "csv";
    text = input.buffer.toString("utf-8");
    rawText = text;
  }

  if (!text.trim()) {
    throw new Error("Downloaded report was empty");
  }

  let source = text;
  const reportText = rawText || text;
  if (profile.id === "SYNXIS") {
    const synxisCsv = printedRoomListToCsv(reportText);
    if (synxisCsv) source = synxisCsv;
  }
  if (profile.id === "SKYTOUCH" || profile.id === "CHOICE_ADVANTAGE") {
    const checkOffCsv = housekeepingCheckOffToCsv(reportText);
    if (checkOffCsv) {
      source = checkOffCsv;
    } else {
      const fromPdfLayout = pdfTextToCsv(reportText);
      if (fromPdfLayout.trim()) source = fromPdfLayout;
    }
  }

  let mode: HkImportMode = input.mode || "update";
  const roomCount = await prisma.room.count({ where: { hotelId: input.hotelId } });
  if (roomCount === 0 && mode === "update") mode = "build";

  const parsed = parsePmsHkReport(source, profile.id);
  const parseError = pmsReportError(profile, parsed, mode);
  if (parseError) throw new Error(parseError);

  const hotel = await prisma.hotel.findUnique({
    where: { id: input.hotelId },
    select: { reportPms: true },
  });
  if (profile.id !== hotel?.reportPms) {
    await prisma.hotel.update({
      where: { id: input.hotelId },
      data: { reportPms: profile.id },
    });
  }

  const result = await applyHkListRows(input.hotelId, parsed.rows, mode, profile.id);
  const preview = (mode === "build" ? dedupeBuildRows(parsed.rows).slice(0, 10) : parsed.rows.slice(0, 10)).map(
    (row) => {
      const resolved = resolvePmsRowStatus(row, profile.id);
      return {
        room: row.roomNumber,
        housekeeping: resolved.hk || "",
        guestStay: resolved.guest || "",
      };
    }
  );

  return {
    ...result,
    mode,
    reportPms: profile.id,
    reportPmsLabel: profile.label,
    sourceFormat,
    preview,
  };
}
