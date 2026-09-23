"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";

export function MobileLostFoundForm({
  defaultRoomNumber = "",
  compact = false,
}: {
  defaultRoomNumber?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [roomNumber, setRoomNumber] = useState(defaultRoomNumber);
  const [guestName, setGuestName] = useState("");
  const [description, setDescription] = useState("");
  const [storageBin, setStorageBin] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDone(null);
    const form = new FormData();
    form.append("roomNumber", roomNumber);
    form.append("guestName", guestName);
    form.append("description", description);
    form.append("storageBin", storageBin);
    if (file) form.append("file", file);

    const res = await fetch("/api/lost-found", { method: "POST", body: form });
    const data = await res.json();
    setLoading(false);
    if (!res.ok || !data.success) {
      setError(data.error || "Could not save item");
      return;
    }
    setDescription("");
    setGuestName("");
    setStorageBin("");
    setFile(null);
    setDone("Logged in Lost & Found");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h3 className="font-semibold">Report lost & found</h3>
      {!compact && (
        <input
          placeholder="Room number"
          value={roomNumber}
          onChange={(e) => setRoomNumber(e.target.value)}
          className="w-full rounded-xl border border-border px-3 py-2 text-sm"
        />
      )}
      <input
        placeholder="Guest name (optional)"
        value={guestName}
        onChange={(e) => setGuestName(e.target.value)}
        className="w-full rounded-xl border border-border px-3 py-2 text-sm"
      />
      <textarea
        required
        placeholder="What did you find or lose?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="w-full rounded-xl border border-border px-3 py-2 text-sm"
      />
      <input
        placeholder="Storage bin (optional)"
        value={storageBin}
        onChange={(e) => setStorageBin(e.target.value)}
        className="w-full rounded-xl border border-border px-3 py-2 text-sm"
      />
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-sm">
        <Camera className="h-4 w-4 text-primary" />
        {file ? file.name : "Add photo"}
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
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Saving…" : "Log item"}
      </button>
    </form>
  );
}
