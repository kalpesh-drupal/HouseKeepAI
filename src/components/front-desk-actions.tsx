"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RoomStatus } from "@prisma/client";
import { offlineAwareFetch } from "@/lib/offline/queue";

type RoomLite = {
  id: string;
  number: string;
  status: RoomStatus;
  isVip: boolean;
  isRush: boolean;
};

export function FrontDeskActions({
  room,
  allRooms,
}: {
  room: RoomLite;
  allRooms: { id: string; number: string }[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const showMarkClean = room.status !== RoomStatus.OUT_OF_INVENTORY;
  const showMarkDirty =
    room.status !== RoomStatus.VACANT_DIRTY && room.status !== RoomStatus.OUT_OF_INVENTORY;

  async function act(action: string, extra?: Record<string, string>) {
    setLoading(action);
    setError(null);
    const res = await offlineAwareFetch(`/api/rooms/${room.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "Action failed");
    }
    setLoading(null);
    router.refresh();
  }

  return (
    <div className="mt-2 space-y-1">
      <div className="flex flex-wrap gap-1">
        {showMarkClean && (
          <button
            onClick={() => act("mark_clean")}
            disabled={!!loading}
            className="rounded-lg bg-green-100 px-2 py-1 text-[10px] font-medium text-green-900 hover:bg-green-200"
          >
            {loading === "mark_clean" ? "…" : "Mark clean"}
          </button>
        )}
        {showMarkDirty && (
          <button
            onClick={() => act("mark_dirty")}
            disabled={!!loading}
            className="rounded-lg bg-red-100 px-2 py-1 text-[10px] font-medium text-red-900 hover:bg-red-200"
          >
            {loading === "mark_dirty" ? "…" : "Mark dirty"}
          </button>
        )}
        <button
          onClick={() => act("mark_vip")}
          disabled={!!loading}
          className="rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-medium text-amber-900 hover:bg-amber-200"
        >
          {room.isVip ? "Un-VIP" : "Mark VIP"}
        </button>
        <button
          onClick={() => act(room.isRush ? "clear_rush" : "mark_rush")}
          disabled={!!loading}
          className="rounded-lg bg-orange-100 px-2 py-1 text-[10px] font-medium text-orange-900 hover:bg-orange-200"
        >
          {room.isRush ? "Clear Rush" : "Rush Clean"}
        </button>
        <button
          onClick={() => act("block_room", { notes: "Blocked by front desk" })}
          disabled={!!loading}
          className="rounded-lg bg-slate-200 px-2 py-1 text-[10px] font-medium hover:bg-slate-300"
        >
          Block
        </button>
        <button
          onClick={() => act("block_ooo")}
          disabled={!!loading}
          className="rounded-lg bg-gray-800 px-2 py-1 text-[10px] font-medium text-white"
        >
          OOO
        </button>
        <div className="flex items-center gap-1">
          <select
            value={moveTo}
            onChange={(e) => setMoveTo(e.target.value)}
            className="rounded-lg border border-border px-1 py-0.5 text-[10px]"
          >
            <option value="">Move to…</option>
            {allRooms
              .filter((r) => r.id !== room.id)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.number}
                </option>
              ))}
          </select>
          <button
            onClick={() => moveTo && act("move_room", { targetRoomId: moveTo })}
            disabled={!moveTo || !!loading}
            className="rounded-lg bg-blue-100 px-2 py-1 text-[10px] font-medium text-blue-900 disabled:opacity-40"
          >
            Move
          </button>
        </div>
      </div>
      {error && <p className="text-[10px] text-red-700">{error}</p>}
    </div>
  );
}
