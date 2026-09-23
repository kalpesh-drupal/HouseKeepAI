import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyHkListRows, dedupeBuildRows, HkImportMode, parseHkListCsv } from "@/lib/hk-upload";
import { extractPdfText, pdfTextToCsv } from "@/lib/pdf-hk";
import { prisma } from "@/lib/prisma";

async function extractTextFromUpload(req: NextRequest): Promise<{
  text: string;
  sourceFormat: string;
  mode: HkImportMode;
  error?: string;
  status?: number;
}> {
  const contentType = req.headers.get("content-type") || "";
  let text = "";
  let sourceFormat = "csv";
  let mode: HkImportMode = "update";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const modeRaw = String(form.get("mode") || "update").toLowerCase();
    mode = modeRaw === "build" ? "build" : "update";

    const file = form.get("file");
    if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
      return { text: "", sourceFormat, mode, error: "File required", status: 400 };
    }
    const name = ("name" in file ? String(file.name) : "upload.csv").toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = "type" in file ? String(file.type || "") : "";

    if (name.endsWith(".pdf") || mime === "application/pdf") {
      sourceFormat = "pdf";
      try {
        const pdfText = await extractPdfText(buf);
        if (!pdfText) {
          return {
            text: "",
            sourceFormat,
            mode,
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
            error: "PDF text found but no room rows detected. Include Room and Room Type columns.",
            status: 400,
          };
        }
      } catch {
        return {
          text: "",
          sourceFormat,
          mode,
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
          error: "Excel parsing failed. Please upload CSV or PDF instead.",
          status: 400,
        };
      }
    } else if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt") || !name.includes(".")) {
      sourceFormat = name.endsWith(".tsv") ? "tsv" : "csv";
      text = buf.toString("utf-8");
    } else {
      return {
        text: "",
        sourceFormat,
        mode,
        error: "Unsupported file type. Upload CSV (.csv) or PDF (.pdf).",
        status: 400,
      };
    }
  } else {
    const body = await req.json();
    text = body.csv || body.text || "";
    mode = body.mode === "build" ? "build" : "update";
  }

  return { text, sourceFormat, mode };
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

  const rows = parseHkListCsv(extracted.text);
  if (!rows.length) {
    return NextResponse.json(
      {
        error:
          extracted.mode === "build"
            ? "No rooms found. Expected columns like Room and Room Type."
            : "No valid rows found. Expected headers like Room, Status, Housekeeper.",
      },
      { status: 400 }
    );
  }

  // If hotel has no rooms yet and user didn't pick a mode, prefer build
  let mode = extracted.mode;
  const roomCount = await prisma.room.count({ where: { hotelId: session.user.hotelId } });
  if (roomCount === 0 && mode === "update") {
    mode = "build";
  }

  const result = await applyHkListRows(session.user.hotelId, rows, mode);
  const previewRows = mode === "build" ? dedupeBuildRows(rows).slice(0, 15) : rows.slice(0, 10);
  return NextResponse.json({
    success: true,
    ...result,
    mode,
    sourceFormat: extracted.sourceFormat,
    preview: previewRows,
  });
}
