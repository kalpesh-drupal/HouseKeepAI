"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function RoomDeskNoteForm() {
  const router = useRouter();
  const [roomNumber, setRoomNumber] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/room-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomNumber, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || "Could not save the message");
        return;
      }
      setSaved(
        data.alreadySaved
          ? `Room ${data.note.roomNumber} already has that message.`
          : `Saved for room ${data.note.roomNumber}.`
      );
      setRoomNumber("");
      setMessage("");
      router.refresh();
    } catch {
      setError("Could not save the message");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Room number</span>
        <input
          value={roomNumber}
          onChange={(e) => setRoomNumber(e.target.value)}
          placeholder="101"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Extra towels for this room"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          required
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-muted-foreground">{saved}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
      >
        {busy ? "Saving..." : "Send to room"}
      </button>
    </form>
  );
}
