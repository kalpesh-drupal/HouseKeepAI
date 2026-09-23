"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserRole } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/utils";
import { notifyLocal } from "@/components/notification-toggle";

type StaffUser = { id: string; name: string; role: UserRole };
type RoomLite = { id: string; number: string };

const CHANNELS = [
  { value: "GENERAL", label: "General" },
  { value: "FRONT_DESK_HOUSEKEEPING", label: "Front Desk ↔ Housekeeping" },
  { value: "MAINTENANCE_MANAGER", label: "Maintenance ↔ Manager" },
  { value: "INSPECTOR_HOUSEKEEPER", label: "Inspector ↔ Housekeeper" },
];

export function MessageComposer({
  users,
  rooms,
}: {
  users: StaffUser[];
  rooms: RoomLite[];
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [receiverId, setReceiverId] = useState("");
  const [channel, setChannel] = useState("GENERAL");
  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) {
      setError("Message cannot be empty");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        receiverId: receiverId || null,
        channel,
        roomId: roomId || null,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!data.success) {
      setError(data.error || "Failed to send");
      return;
    }
    setContent("");
    notifyLocal("Message sent", content.slice(0, 80));
    router.refresh();
  }

  return (
    <form onSubmit={send} className="space-y-3 rounded-2xl border border-border bg-card p-6">
      <h2 className="font-semibold">Send Message</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <select
          value={receiverId}
          onChange={(e) => setReceiverId(e.target.value)}
          className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
        >
          <option value="">Broadcast / team</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({ROLE_LABELS[u.role]})
            </option>
          ))}
        </select>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
        >
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
        >
          <option value="">No room link</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>Room {r.number}</option>
          ))}
        </select>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        placeholder="Type your message..."
        className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-primary"
        required
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
      >
        {loading ? "Sending..." : "Send"}
      </button>
    </form>
  );
}
