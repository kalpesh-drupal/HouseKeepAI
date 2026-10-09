import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyHkListRows, dedupeBuildRows, HkImportMode, parsePmsHkReport, pmsReportError, resolvePmsRowStatus } from "@/lib/hk-upload";
import { extractPdfText, housekeepingCheckOffToCsv, pdfTextToCsv, printedRoomListToCsv } from "@/lib/pdf-hk";
import { prisma } from "@/lib/prisma";
import { getReportPms } from "@/lib/pms/report-catalog";

async function extractTextFromUpload(req: NextRequest): Promise<{
  text: string;
  sourceFormat: string;
  mode: HkImportMode;
  reportPms: string;
  rawText: string;
  error?: string;
  status?: number;
}> {
  const contentType = req.headers.get("content-type") || "";
  let text = "";
  let sourceFormat = "csv";
  let mode: HkImportMode = "update";
  let reportPms = "";
  let rawText = "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const modeRaw = String(form.get("mode") || "update").toLowerCase();
    mode = modeRaw === "build" ? "build" : "update";
    reportPms = String(form.get("pms") || "");

    const file = form.get("file");
    if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
      return { text: "", sourceFormat, mode, reportPms,
            rawText, error: "File required", status: 400 };
    }
    const name = ("name" in file ? String(file.name) : "upload.csv").toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = "type" in file ? String(file.type || "") : "";

    if (name.endsWith(".pdf") || mime === "application/pdf") {
      sourceFormat = "pdf";
      try {
        const pdfText = await extractPdfText(buf);
        rawText = pdfText;
        if (!pdfText) {
          return {
            text: "",
            sourceFormat,
            mode,
            reportPms,
            rawText,
            error: "Could not read text from this PDF. Export a text-based PDF or use CSV.",
            status: 400,
          };
        }
        text = pdfTextToCsv(pdfText);
        if (!text.trim()) {
          return {
            text: "",
            sourceFormat,
            mode,
            reportPms,
            rawText,
            error: "PDF text found but no room rows detected. Include the PMS room column.",
            status: 400,
          };
        }
      } catch {
        return {
          text: "",
          sourceFormat,
          mode,
          reportPms,
            rawText,
          error: "Failed to parse PDF. Try CSV, or ensure the PDF contains selectable text.",
          status: 400,
        };
      }
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      sourceFormat = "excel";
      try {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buf, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        text = XLSX.utils.sheet_to_csv(sheet);
      } catch {
        return {
          text: "",
          sourceFormat,
          mode,
          reportPms,
            rawText,
          error: "Excel parsing failed. Please upload CSV or PDF instead.",
          status: 400,
        };
      }
    } else if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt") || !name.includes(".")) {
      sourceFormat = name.endsWith(".tsv") ? "tsv" : "csv";
      text = buf.toString("utf-8");
      rawText = text;
    } else {
      return {
        text: "",
        sourceFormat,
        mode,
        reportPms,
            rawText,
        error: "Unsupported file type. Upload CSV (.csv) or PDF (.pdf).",
        status: 400,
      };
    }
  } else {
    const body = await req.json();
    text = body.csv || body.text || "";
    rawText = text;
    mode = body.mode === "build" ? "build" : "update";
    reportPms = String(body.pms || "");
  }

  return { text, sourceFormat, mode, reportPms, rawText };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["OWNER", "GENERAL_MANAGER", "EXECUTIVE_HOUSEKEEPER", "FRONT_DESK"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const extracted = await extractTextFromUpload(req);
  if (extracted.error) {
    return NextResponse.json({ error: extracted.error }, { status: extracted.status || 400 });
  }

  if (!extracted.text.trim()) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  const hotel = await prisma.hotel.findUnique({
    where: { id: session.user.hotelId },
    select: { reportPms: true },
  });
  const profile = getReportPms(extracted.reportPms) || getReportPms(hotel?.reportPms);
  if (!profile) {
    return NextResponse.json({ error: "Choose the PMS this housekeeping report came from." }, { status: 400 });
  }

  let source = extracted.text;
  const reportText = extracted.rawText || extracted.text;
  if (profile.id === "SYNXIS") {
    const synxisCsv = printedRoomListToCsv(reportText);
    if (synxisCsv) source = synxisCsv;
  }
  if (profile.id === "SKYTOUCH" || profile.id === "CHOICE_ADVANTAGE") {
    const checkOffCsv = housekeepingCheckOffToCsv(reportText);
    if (checkOffCsv) source = checkOffCsv;
  }
  const parsed = parsePmsHkReport(source, profile.id);

  // If hotel has no rooms yet and user didn't pick a mode, prefer build
  let mode = extracted.mode;
  const roomCount = await prisma.room.count({ where: { hotelId: session.user.hotelId } });
  if (roomCount === 0 && mode === "update") {
    mode = "build";
  }

  const parseError = pmsReportError(profile, parsed, mode);
  if (parseError) {
    return NextResponse.json({ error: parseError }, { status: 400 });
  }

  if (profile.id !== hotel?.reportPms) {
    await prisma.hotel.update({
      where: { id: session.user.hotelId },
      data: { reportPms: profile.id },
    });
  }

  const rows = parsed.rows;
  const result = await applyHkListRows(session.user.hotelId, rows, mode, profile.id);
  const previewRows = (mode === "build" ? dedupeBuildRows(rows).slice(0, 15) : rows.slice(0, 10)).map((row) => {
    const resolved = resolvePmsRowStatus(row, profile.id);
    return {
      room: row.roomNumber,
      type: row.roomType || "",
      reportStatus: [row.status, row.guestStatus, row.service].filter(Boolean).join(" / "),
      housekeeping: resolved.hk || "",
      guestStay: resolved.guest || "",
    };
  });
  return NextResponse.json({
    success: true,
    ...result,
    mode,
    reportPms: profile.id,
    reportPmsLabel: profile.label,
    sourceFormat: extracted.sourceFormat,
    preview: previewRows,
  });
}
