"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GuestStayStatus, RoomStatus } from "@prisma/client";
import { guestStayLabel, ROOM_STATUS_CONFIG, cn } from "@/lib/utils";
import { pmsRoomLabel, type PortalPms } from "@/lib/pms/pms-labels";
import { ApplyAiAssignmentsButton } from "@/components/apply-ai-assignments";
import { type HousekeeperOption } from "@/components/assign-housekeeper-select";
import { RoomStayCue } from "@/components/room-stay-cue";

type AssignableRoom = {
  id: string;
  number: string;
  floor: number;
  status: RoomStatus;
  guestStatus: GuestStayStatus;
  housekeeperId: string | null;
  housekeeperName: string | null;
  isVip: boolean;
  isRush: boolean;
  arrivalDate?: Date | string | null;
  departureDate?: Date | string | null;
  notes?: string | null;
  doNotDisturb?: boolean;
};

const FILTERS = [
  { key: "needs", label: "Needs cleaning" },
  { key: "unassigned", label: "Unassigned" },
  { key: "all", label: "All rooms" },
] as const;

function needsCleaning(status: RoomStatus) {
  return status === RoomStatus.VACANT_DIRTY || status === RoomStatus.CLEANING;
}

function isCleaned(status: RoomStatus) {
  return status === RoomStatus.VACANT_CLEAN || status === RoomStatus.INSPECTED;
}

export function RoomAssignmentBoard({
  rooms: initialRooms,
  housekeepers,
  pmsProvider = null,
}: {
  rooms: AssignableRoom[];
  housekeepers: HousekeeperOption[];
  pmsProvider?: PortalPms;
}) {
  const router = useRouter();
  const [rooms, setRooms] = useState(initialRooms);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("needs");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingHk, setPendingHk] = useState<string | null>(null);
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

  const progress = useMemo(() => {
    let dirtyGiven = 0;
    let cleaning = 0;
    let cleaned = 0;
    for (const room of rooms) {
      if (room.status === RoomStatus.VACANT_DIRTY && room.housekeeperId) dirtyGiven += 1;
      else if (room.status === RoomStatus.CLEANING) cleaning += 1;
      else if (isCleaned(room.status)) cleaned += 1;
    }
    const total = dirtyGiven + cleaning + cleaned;
    const share = (count: number) => (total === 0 ? 0 : (count / total) * 100);
    return { dirtyGiven, cleaning, cleaned, total, share };
  }, [rooms]);

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
      setMessage("Check one or more rooms first.");
      return false;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/rooms/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomIds, housekeeperId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setMessage(data.error || "Could not assign rooms");
        return false;
      }
      const name = housekeeperId ? housekeepers.find((h) => h.id === housekeeperId)?.name ?? null : null;
      const chosen = new Set(roomIds);
      setRooms((prev) =>
        prev.map((r) => (chosen.has(r.id) ? { ...r, housekeeperId, housekeeperName: name } : r))
      );
      setSelected(new Set());
      setMessage(
        housekeeperId
          ? `Assigned ${data.assigned} room(s) to ${name ?? "the housekeeper"}.`
          : `Unassigned ${data.assigned} room(s).`
      );
      router.refresh();
      return true;
    } catch {
      setMessage("Could not assign rooms");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function chooseHousekeeper(id: string) {
    if (busy) return;
    if (selected.size === 0) {
      setMessage("Check the rooms first, then check the housekeeper.");
      return;
    }
    setPendingHk(id);
    try {
      await applyBulk(id);
    } finally {
      setPendingHk(null);
    }
  }

  const allVisibleChecked = filtered.length > 0 && filtered.every((room) => selected.has(room.id));

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Assign rooms</h2>
          <p className="text-sm text-muted-foreground">
            Check the rooms, then check one housekeeper. Those rooms are assigned together.
          </p>
        </div>
        <ApplyAiAssignmentsButton />
      </div>

      {housekeepers.length === 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No active housekeepers yet. Add them in Settings → Users & Roles, then assign rooms here.
        </p>
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

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <section className="flex min-h-[24rem] flex-col rounded-xl border border-border bg-background p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">Rooms</h3>
              <p className="text-xs text-muted-foreground">
                {filtered.length} shown · {selected.size} checked · Unassigned dirty {loads.unassigned}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={allVisibleChecked}
                onChange={toggleAllVisible}
                aria-label="Select visible rooms"
              />
              All
            </label>
          </div>
          <div className="max-h-[32rem] flex-1 space-y-2 overflow-y-auto pr-1">
            {filtered.map((room) => {
              const config = ROOM_STATUS_CONFIG[room.status];
              const stay = guestStayLabel(room.guestStatus, room.status);
              return (
                <div
                  key={room.id}
                  className={cn(
                    "flex gap-3 rounded-xl border border-border px-3 py-2",
                    selected.has(room.id) ? "bg-accent" : "hover:bg-muted/50"
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(room.id)}
                    onChange={() => toggle(room.id)}
                    aria-label={`Select room ${room.number}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/rooms/${room.id}`} className="font-semibold hover:text-primary">
                        {room.number}
                      </Link>
                      {(room.isVip || room.isRush) && (
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {room.isVip ? "VIP" : ""}
                          {room.isVip && room.isRush ? " · " : ""}
                          {room.isRush ? "RUSH" : ""}
                        </span>
                      )}
                      <RoomStayCue
                        roomId={room.id}
                        guestStatus={room.guestStatus}
                        arrivalDate={room.arrivalDate}
                        departureDate={room.departureDate}
                        notes={room.notes}
                        doNotDisturb={room.doNotDisturb}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", config.bg, config.text)}>
                        {pmsRoomLabel(room.status, room.guestStatus, pmsProvider)}
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", stay.className)}>
                        {stay.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Floor {room.floor} · {room.housekeeperName ?? "Unassigned"}
                    </p>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-1 py-8 text-center text-sm text-muted-foreground">No rooms match this filter.</p>
            )}
          </div>
        </section>

        <section className="flex min-h-[24rem] flex-col rounded-xl border border-border bg-background p-4">
          <div className="mb-3">
            <h3 className="font-semibold">Housekeepers</h3>
            <p className="text-xs text-muted-foreground">
              Check one name to assign every checked room.
            </p>
          </div>
          <div className="max-h-[32rem] flex-1 space-y-2 overflow-y-auto pr-1">
            {housekeepers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No housekeepers to assign.</p>
            ) : (
              housekeepers.map((hk) => {
                const checked = pendingHk === hk.id;
                return (
                  <label
                    key={hk.id}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-xl border border-border px-3 py-3",
                      checked ? "bg-accent" : "hover:bg-muted/50"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      disabled={busy}
                      onChange={() => chooseHousekeeper(hk.id)}
                      aria-label={`Assign checked rooms to ${hk.name}`}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{hk.label ?? hk.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {loads.map.get(hk.id) ?? 0} room{(loads.map.get(hk.id) ?? 0) === 1 ? "" : "s"}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => applyBulk(null)}
            className="mt-3 rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            Unassign checked rooms
          </button>
        </section>

        <section className="flex min-h-[24rem] flex-col rounded-xl border border-border bg-background p-4">
          <div className="mb-4">
            <h3 className="font-semibold">Progress</h3>
            <p className="text-xs text-muted-foreground">
              {progress.total === 0
                ? "No dirty, cleaning, or clean rooms yet."
                : `${progress.cleaned} of ${progress.total} cleaned`}
            </p>
          </div>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span>Dirty rooms assigned</span>
              <span className="text-lg font-semibold tabular-nums">{progress.dirtyGiven}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Being cleaned</span>
              <span className="text-lg font-semibold tabular-nums">{progress.cleaning}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Cleaned</span>
              <span className="text-lg font-semibold tabular-nums">{progress.cleaned}</span>
            </li>
          </ul>
          <div
            className="mt-5 h-3 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${progress.dirtyGiven} dirty rooms assigned, ${progress.cleaning} being cleaned, ${progress.cleaned} cleaned`}
          >
            {progress.total > 0 && (
              <div className="flex h-full w-full">
                <div className="h-full bg-red-500" style={{ width: `${progress.share(progress.dirtyGiven)}%` }} />
                <div className="h-full bg-yellow-500" style={{ width: `${progress.share(progress.cleaning)}%` }} />
                <div className="h-full bg-green-500" style={{ width: `${progress.share(progress.cleaned)}%` }} />
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Assigned dirty
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-yellow-500" /> Cleaning
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" /> Cleaned
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
