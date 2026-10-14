"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export type ReadyRoom = {
  id: string;
  number: string;
  floor: number;
  housekeeperName: string | null;
  href: string;
};

export function ReadyToInspectList({ rooms }: { rooms: ReadyRoom[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(roomId: string, action: "mark_clean" | "send_back") {
    setLoading(`${roomId}:${action}`);
    setError(null);
    const res = await fetch(`/api/rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(null);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not update this room");
      return;
    }
    router.refresh();
  }

  if (rooms.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="font-medium">No rooms ready to inspect</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Rooms show up here when a housekeeper marks them ready to inspect.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rooms.map((room) => (
        <div key={room.id} className="rounded-2xl border border-amber-200 bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link href={room.href} className="text-xl font-bold hover:text-primary">
                Room {room.number}
              </Link>
              <p className="text-sm text-muted-foreground">
                Floor {room.floor}
                {room.housekeeperName ? ` · Cleaned by ${room.housekeeperName}` : " · No housekeeper named"}
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
              Ready to inspect
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => act(room.id, "mark_clean")}
              disabled={loading !== null}
              className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading === `${room.id}:mark_clean` ? "..." : "Mark clean"}
            </button>
            <button
              type="button"
              onClick={() => act(room.id, "send_back")}
              disabled={loading !== null}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
            >
              {loading === `${room.id}:send_back` ? "..." : "Send back dirty"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
