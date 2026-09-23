"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RoomStatus } from "@prisma/client";
import { ROOM_STATUS_CONFIG, cn } from "@/lib/utils";
import { ApplyAiAssignmentsButton } from "@/components/apply-ai-assignments";
import { AssignHousekeeperSelect, type HousekeeperOption } from "@/components/assign-housekeeper-select";

type AssignableRoom = {
  id: string;
  number: string;
  floor: number;
  status: RoomStatus;
  housekeeperId: string | null;
  housekeeperName: string | null;
  isVip: boolean;
  isRush: boolean;
};

const FILTERS = [
  { key: "needs", label: "Needs cleaning" },
  { key: "unassigned", label: "Unassigned" },
  { key: "all", label: "All rooms" },
] as const;

function needsCleaning(status: RoomStatus) {
  return status === RoomStatus.VACANT_DIRTY || status === RoomStatus.CLEANING;
}

export function RoomAssignmentBoard({
  rooms: initialRooms,
  housekeepers,
}: {
  rooms: AssignableRoom[];
  housekeepers: HousekeeperOption[];
}) {
  const router = useRouter();
  const [rooms, setRooms] = useState(initialRooms);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("needs");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkHk, setBulkHk] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setRooms(initialRooms);
  }, [initialRooms]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((room) => {
      if (filter === "needs" && !needsCleaning(room.status) && !room.isRush) return false;
      if (filter === "unassigned" && room.housekeeperId) return false;
      if (q && !room.number.toLowerCase().includes(q) && !(room.housekeeperName || "").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [rooms, filter, search]);

  const loads = useMemo(() => {
    const map = new Map<string, number>();
    for (const hk of housekeepers) map.set(hk.id, 0);
    let unassigned = 0;
    for (const room of rooms) {
      if (room.housekeeperId && map.has(room.housekeeperId)) {
        map.set(room.housekeeperId, (map.get(room.housekeeperId) ?? 0) + 1);
      } else if (!room.housekeeperId && needsCleaning(room.status)) {
        unassigned += 1;
      }
    }
    return { map, unassigned };
  }, [rooms, housekeepers]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const ids = filtered.map((r) => r.id);
      const allOn = ids.length > 0 && ids.every((id) => prev.has(id));
      if (allOn) {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...ids]);
    });
  }

  async function applyBulk(housekeeperId: string | null) {
    const roomIds = [...selected];
    if (roomIds.length === 0) {
      setMessage("Select one or more rooms first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/rooms/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomIds, housekeeperId }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok || !data.success) {
      setMessage(data.error || "Could not assign rooms");
      return;
    }
    const name = housekeeperId ? housekeepers.find((h) => h.id === housekeeperId)?.name ?? null : null;
    setRooms((prev) =>
      prev.map((r) =>
        selected.has(r.id) ? { ...r, housekeeperId, housekeeperName: name } : r
      )
    );
    setSelected(new Set());
    setMessage(`Updated ${data.assigned} room(s).`);
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Assign rooms</h2>
          <p className="text-sm text-muted-foreground">
            Pick a housekeeper for each room, or select several and assign them at once. AI can fill unassigned rooms.
          </p>
        </div>
        <ApplyAiAssignmentsButton />
      </div>

      {housekeepers.length === 0 ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No active housekeepers yet. Add them in Settings → Users & Roles, then assign rooms here.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {housekeepers.map((hk) => (
            <span key={hk.id} className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
              {hk.name}: {loads.map.get(hk.id) ?? 0}
            </span>
          ))}
          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-800">
            Unassigned dirty: {loads.unassigned}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium",
              filter === f.key ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {f.label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search room or name"
          className="ml-auto w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm sm:w-56"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted p-3">
        <span className="text-sm text-muted-foreground">{selected.size} selected</span>
        <select
          value={bulkHk}
          onChange={(e) => setBulkHk(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Choose housekeeper</option>
          {housekeepers.map((hk) => (
            <option key={hk.id} value={hk.id}>
              {hk.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || selected.size === 0 || !bulkHk}
          onClick={() => applyBulk(bulkHk || null)}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Assign selected
        </button>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => applyBulk(null)}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
        >
          Unassign selected
        </button>
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                  onChange={toggleAllVisible}
                  aria-label="Select visible rooms"
                />
              </th>
              <th className="px-3 py-2">Room</th>
              <th className="px-3 py-2">Floor</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Housekeeper</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((room) => {
              const config = ROOM_STATUS_CONFIG[room.status];
              return (
                <tr key={room.id} className="hover:bg-muted/50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(room.id)}
                      onChange={() => toggle(room.id)}
                      aria-label={`Select room ${room.number}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/rooms/${room.id}`} className="font-semibold hover:text-primary">
                      {room.number}
                    </Link>
                    {(room.isVip || room.isRush) && (
                      <span className="ml-2 text-[10px] font-bold text-muted-foreground">
                        {room.isVip ? "VIP" : ""}
                        {room.isVip && room.isRush ? " · " : ""}
                        {room.isRush ? "RUSH" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{room.floor}</td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", config.bg, config.text)}>
                      {config.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <AssignHousekeeperSelect
                      roomId={room.id}
                      housekeeperId={room.housekeeperId}
                      housekeepers={housekeepers}
                      onAssigned={(id, name) =>
                        setRooms((prev) =>
                          prev.map((r) =>
                            r.id === room.id ? { ...r, housekeeperId: id, housekeeperName: name } : r
                          )
                        )
                      }
                    />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No rooms match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
