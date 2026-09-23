"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { offlineAwareFetch } from "@/lib/offline/queue";

export function MobileIssueForm({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDone(null);

    const res = await offlineAwareFetch(`/api/rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "report_issue", notes: notes.trim() || "Maintenance issue" }),
    });
    if (!res.ok) {
      setLoading(false);
      setError("Could not report issue");
      return;
    }

    if (file) {
      const form = new FormData();
      form.append("file", file);
      form.append("type", "maintenance");
      form.append("caption", notes.trim() || "Maintenance issue");
      await fetch(`/api/rooms/${roomId}/photos`, { method: "POST", body: form });
    }

    setNotes("");
    setFile(null);
    setDone("Issue reported");
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h3 className="font-semibold">Report maintenance issue</h3>
      <textarea
        required
        placeholder="What's broken or needs repair?"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        className="w-full rounded-xl border border-border px-3 py-2 text-sm"
      />
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-sm">
        <Camera className="h-4 w-4 text-primary" />
        {file ? file.name : "Add photo of the issue"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-emerald-700">{done}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Sending…" : "Send to maintenance"}
      </button>
    </form>
  );
}
