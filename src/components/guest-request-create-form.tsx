"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const REQUEST_TYPES = [
  "Extra Towels",
  "Need Pillow",
  "No Coffee",
  "Toilet Clogged",
  "Extra Blanket",
  "Need Soap",
  "Late Checkout",
];

export function GuestRequestCreateForm({ rooms }: { rooms: { id: string; number: string }[] }) {
  const router = useRouter();
  const [roomId, setRoomId] = useState(rooms[0]?.id || "");
  const [type, setType] = useState(REQUEST_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/guest-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, type, notes }),
    });
    setNotes("");
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Room</label>
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="rounded-xl border border-border px-3 py-2 text-sm">
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.number}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Request</label>
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border border-border px-3 py-2 text-sm">
          {REQUEST_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="min-w-[200px] flex-1">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
      </div>
      <button type="submit" disabled={loading || !roomId} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50">
        {loading ? "Creating..." : "Create Request"}
      </button>
    </form>
  );
}
