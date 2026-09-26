"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { Building2, CheckCircle2, FileSpreadsheet, RefreshCw, Upload, Users } from "lucide-react";
import Link from "next/link";

type Housekeeper = { id: string; name: string; email: string };
type ImportMode = "build" | "update";

type UploadStats = {
  mode?: ImportMode;
  updated: number;
  created: number;
  removed?: number;
  skipped: number;
  assigned: number;
  unassigned: number;
  markedDirty: number;
  markedClean: number;
  statusApplied?: number;
  statusMissing?: number;
  sourceFormat?: string;
  errors?: string[];
  warnings?: string[];
  unmappedStatusSamples?: string[];
};

export function HkUploadForm({
  housekeepers,
  roomCount,
  initialMode,
}: {
  housekeepers: Housekeeper[];
  roomCount: number;
  initialMode?: ImportMode;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<ImportMode>(
    initialMode || (roomCount === 0 ? "build" : "update")
  );
  const [file, setFile] = useState<File | null>(null);
  const [paste, setPaste] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<UploadStats | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStats(null);
    setPreview(null);

    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        form.append("mode", mode);
        res = await fetch("/api/upload/hk-list", { method: "POST", body: form });
      } else if (paste.trim()) {
        res = await fetch("/api/upload/hk-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv: paste, mode }),
        });
      } else {
        setLoading(false);
        setError("Choose a CSV or PDF file (or paste CSV text), then click Import");
        return;
      }

      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(raw);
      } catch {
        setLoading(false);
        setError(`Server returned an invalid response (${res.status}). Try again or use CSV.`);
        return;
      }

      setLoading(false);
      if (data.success) {
        setStats({
          mode: data.mode === "build" ? "build" : "update",
          updated: Number(data.updated) || 0,
          created: Number(data.created) || 0,
          removed: Number(data.removed) || 0,
          skipped: Number(data.skipped) || 0,
          assigned: Number(data.assigned) || 0,
          unassigned: Number(data.unassigned) || 0,
          markedDirty: Number(data.markedDirty) || 0,
          markedClean: Number(data.markedClean) || 0,
          statusApplied: Number(data.statusApplied) || 0,
          statusMissing: Number(data.statusMissing) || 0,
          sourceFormat: typeof data.sourceFormat === "string" ? data.sourceFormat : undefined,
          errors: Array.isArray(data.errors) ? (data.errors as string[]) : [],
          warnings: Array.isArray(data.warnings) ? (data.warnings as string[]) : [],
          unmappedStatusSamples: Array.isArray(data.unmappedStatusSamples)
            ? (data.unmappedStatusSamples as string[])
            : [],
        });
        setPreview(Array.isArray(data.preview) ? (data.preview as Record<string, unknown>[]) : null);
      } else {
        setError(typeof data.error === "string" ? data.error : "Upload failed");
      }
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Network error while uploading");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("build")}
          className={`rounded-2xl border p-4 text-left transition ${
            mode === "build"
              ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200"
              : "border-border bg-card hover:bg-muted"
          }`}
        >
          <div className="mb-1 flex items-center gap-2 font-semibold text-emerald-950">
            <Building2 className="h-4 w-4" />
            Build property from report
          </div>
          <p className="text-xs text-muted-foreground">
            Makes the hotel room list <strong>exactly match</strong> the report (Room + Room Type). Rooms not in the
            file are removed; only report rooms are kept.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setMode("update")}
          className={`rounded-2xl border p-4 text-left transition ${
            mode === "update"
              ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200"
              : "border-border bg-card hover:bg-muted"
          }`}
        >
          <div className="mb-1 flex items-center gap-2 font-semibold text-blue-950">
            <RefreshCw className="h-4 w-4" />
            Update room status (daily)
          </div>
          <p className="text-xs text-muted-foreground">
            Daily use: set housekeeping status (clean, dirty, out of order, out of inventory) and guest status
            (occupied, stayover, departing, checked out, arriving). Assign housekeepers for rooms that already exist.{" "}
            <strong>Never creates new rooms.</strong>
          </p>
        </button>
      </div>

      <div
        className={`rounded-2xl border p-5 text-sm ${
          mode === "build"
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : "border-blue-200 bg-blue-50 text-blue-950"
        }`}
      >
        {mode === "build" ? (
          <>
            <p className="font-semibold">Exact property build from report</p>
            <p className="mt-1">
              We will keep <strong>only</strong> the room numbers and room types in your file. Any other rooms
              currently in the system will be removed so the hotel matches the report exactly. Property now has{" "}
              <strong>{roomCount}</strong> room{roomCount === 1 ? "" : "s"}.
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">Updating statuses only</p>
            <p className="mt-1">
              Unknown room numbers in the file are skipped — no extra rooms will be added. Need to add rooms? Switch
              to <strong>Build property from report</strong>.
            </p>
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2 font-semibold">
            <Users className="h-4 w-4 text-primary" />
            Active housekeepers
          </div>
          {housekeepers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No housekeepers yet. Add them in{" "}
              <Link href="/settings" className="text-primary underline">
                Settings
              </Link>{" "}
              for daily assignment matching.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {housekeepers.map((h) => (
                <li key={h.id} className="flex justify-between gap-2">
                  <span className="font-medium">{h.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{h.email}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 text-sm">
          <div className="mb-3 flex items-center gap-2 font-semibold">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            File columns
          </div>
          {mode === "build" ? (
            <>
              <p className="text-muted-foreground">
                Required: <code className="rounded bg-muted px-1">Room</code>
              </p>
              <p className="mt-2 text-muted-foreground">
                Recommended: <code className="rounded bg-muted px-1">Room Type</code>,{" "}
                <code className="rounded bg-muted px-1">Floor</code>
              </p>
              <p className="mt-2 text-muted-foreground">Optional: Status (applied if present)</p>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                Required: <code className="rounded bg-muted px-1">Room</code>,{" "}
                <code className="rounded bg-muted px-1">Status</code>
              </p>
              <p className="mt-2 text-muted-foreground">
                Status accepts clean, dirty, out of order, and out of inventory. A separate{" "}
                <code className="rounded bg-muted px-1">Guest Status</code> column (or the same cell) can be occupied,
                departing, stayover, checked out, or arriving. Example: <code className="rounded bg-muted px-1">Stayover Dirty</code>.
              </p>
              <p className="mt-2 text-muted-foreground">
                Optional: Housekeeper, Rush, VIP, Notes
              </p>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <a href="/samples/housekeeping-list.csv" download className="text-sm font-medium text-primary hover:underline">
              Sample CSV
            </a>
            <a href="/samples/housekeeping-list.pdf" download className="text-sm font-medium text-primary hover:underline">
              Sample PDF
            </a>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <Upload className="mx-auto mb-3 h-8 w-8 text-primary" />
        <h2 className="font-semibold">{t("uploadReport")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("uploadHint")}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs font-medium">
          <span className="rounded-full border border-border bg-muted px-3 py-1">CSV</span>
          <span className="rounded-full border border-border bg-muted px-3 py-1">PDF</span>
          <span className="rounded-full border border-border bg-muted px-3 py-1">Excel</span>
        </div>
        <input
          type="file"
          accept=".csv,.pdf,.tsv,.txt,.xlsx,.xls,text/csv,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mx-auto mt-4 block text-sm"
        />
        {file && (
          <p className="mt-2 text-xs text-muted-foreground">
            Selected: <strong>{file.name}</strong> — click the button below to process
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Or paste CSV</label>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={7}
          placeholder={
            mode === "build"
              ? "Room,Room Type,Floor\n101,Standard,1\n108,Suite,1\n201,Deluxe,2"
              : "Room,Status,Housekeeper\n101,Dirty,Maria Housekeeper\n108,Clean,Maria Housekeeper"
          }
          className="w-full rounded-xl border border-border px-4 py-3 font-mono text-xs"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className={`rounded-xl px-5 py-3 text-sm font-medium text-white disabled:opacity-50 ${
          mode === "build" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-primary hover:bg-blue-800"
        }`}
      >
        {loading
          ? "Processing report..."
          : mode === "build"
            ? "Build hotel exactly from report rooms"
            : "Update room statuses from report"}
      </button>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {stats && (
        <div className="space-y-3 rounded-2xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-center gap-2 font-semibold text-green-900">
            <CheckCircle2 className="h-5 w-5" />
            {stats.mode === "build" ? "Property now matches the report exactly" : "Room statuses updated from report"}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm text-green-950">
            {stats.mode === "build" ? (
              <>
                <p>
                  <strong>{stats.created}</strong> rooms created
                </p>
                <p>
                  <strong>{stats.updated}</strong> rooms updated
                </p>
                <p>
                  <strong>{stats.removed ?? 0}</strong> extra rooms removed
                </p>
                <p>
                  <strong>{(stats.created || 0) + (stats.updated || 0)}</strong> rooms on report (kept)
                </p>
                <p>
                  <strong>{stats.skipped}</strong> skipped
                </p>
              </>
            ) : (
              <>
                <p>
                  <strong>{stats.updated}</strong> rooms updated
                </p>
                <p>
                  <strong>{stats.statusApplied ?? 0}</strong> statuses applied
                </p>
                <p>
                  <strong>{stats.markedDirty}</strong> marked dirty
                </p>
                <p>
                  <strong>{stats.markedClean}</strong> marked clean
                </p>
                <p>
                  <strong>{stats.assigned}</strong> assigned
                </p>
                <p>
                  <strong>{stats.skipped}</strong> unknown rooms skipped
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href="/map"
              className="rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-green-900"
            >
              View hotel map
            </Link>
            <Link
              href="/housekeeping"
              className="rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-green-900"
            >
              Open housekeeping
            </Link>
          </div>
          {stats.warnings && stats.warnings.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-amber-800">
              {stats.warnings.slice(0, 8).map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="overflow-auto rounded-xl border border-border">
          <p className="bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
            Parsed preview (first {preview.length} rows)
          </p>
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/60">
              <tr>
                {Object.keys(preview[0]).map((k) => (
                  <th key={k} className="px-3 py-2">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {Object.values(row).map((v, j) => (
                    <td key={j} className="px-3 py-2">
                      {String(v ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </form>
  );
}
