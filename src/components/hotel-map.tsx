"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RoomStatus } from "@prisma/client";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { RoomCell } from "./room-cell";
import { ROOM_STATUS_CONFIG, cn } from "@/lib/utils";

type Room = {
  id: string;
  number: string;
  floor: number;
  type: string;
  status: RoomStatus;
  isVip: boolean;
  isRush: boolean;
  arrivalDate: Date | null;
  departureDate: Date | null;
  housekeeperName?: string | null;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "dirty", label: "Dirty", status: RoomStatus.VACANT_DIRTY },
  { key: "clean", label: "Clean", status: RoomStatus.VACANT_CLEAN },
  { key: "vip", label: "VIP" },
  { key: "arrival", label: "Arrival" },
  { key: "departure", label: "Departure" },
  { key: "maintenance", label: "Maintenance", status: RoomStatus.MAINTENANCE },
] as const;

type Draft = {
  id?: string;
  number: string;
  type: string;
  floor: number;
};

export function HotelMap({
  rooms: initialRooms,
  floors: initialFloors,
  canEdit = false,
}: {
  rooms: Room[];
  floors: number;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [rooms, setRooms] = useState(initialRooms);
  const [floors, setFloors] = useState(initialFloors);
  const [filter, setFilter] = useState<string>("all");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setRooms(initialRooms);
    setFloors(initialFloors);
  }, [initialRooms, initialFloors]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const tomorrow = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }, [today]);

  const filtered = rooms.filter((room) => {
    switch (filter) {
      case "dirty":
        return room.status === RoomStatus.VACANT_DIRTY;
      case "clean":
        return room.status === RoomStatus.VACANT_CLEAN || room.status === RoomStatus.INSPECTED;
      case "vip":
        return room.isVip;
      case "arrival":
        return room.arrivalDate && room.arrivalDate >= today && room.arrivalDate < tomorrow;
      case "departure":
        return room.departureDate && room.departureDate >= today && room.departureDate < tomorrow;
      case "maintenance":
        return room.status === RoomStatus.MAINTENANCE || room.status === RoomStatus.OUT_OF_ORDER || room.status === RoomStatus.OUT_OF_INVENTORY;
      default:
        return true;
    }
  });

  const displayFloors = Math.max(floors, ...rooms.map((r) => r.floor), 1);
  const roomsByFloor = Array.from({ length: displayFloors }, (_, i) => {
    const floor = displayFloors - i;
    return { floor, rooms: filtered.filter((r) => r.floor === floor) };
  });

  function openAdd(floor?: number) {
    setError(null);
    setMessage(null);
    setDraft({
      number: "",
      type: "Standard",
      floor: floor ?? displayFloors,
    });
  }

  function openEdit(room: Room) {
    setError(null);
    setMessage(null);
    setDraft({
      id: room.id,
      number: room.number,
      type: room.type || "Standard",
      floor: room.floor,
    });
  }

  async function saveDraft(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (draft.id) {
        const res = await fetch(`/api/rooms/${draft.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_inventory",
            number: draft.number,
            type: draft.type,
            floor: draft.floor,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Update failed");
        setRooms((prev) =>
          prev
            .map((r) =>
              r.id === draft.id
                ? { ...r, number: data.room.number, type: data.room.type, floor: data.room.floor }
                : r
            )
            .sort((a, b) => a.floor - b.floor || a.number.localeCompare(b.number, undefined, { numeric: true }))
        );
        setFloors((f) => Math.max(f, data.room.floor));
        setMessage(`Updated room ${data.room.number}`);
      } else {
        const res = await fetch("/api/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            number: draft.number,
            type: draft.type,
            floor: draft.floor,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Create failed");
        setRooms((prev) =>
          [
            ...prev,
            {
              id: data.room.id,
              number: data.room.number,
              floor: data.room.floor,
              type: data.room.type,
              status: data.room.status as RoomStatus,
              isVip: false,
              isRush: false,
              arrivalDate: null,
              departureDate: null,
            },
          ].sort((a, b) => a.floor - b.floor || a.number.localeCompare(b.number, undefined, { numeric: true }))
        );
        setFloors((f) => Math.max(f, data.room.floor));
        setMessage(`Added room ${data.room.number}`);
      }
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function removeRoom(room: Room) {
    const ok = window.confirm(
      `Remove room ${room.number} from this hotel?\n\nThis deletes it from housekeeping, inspection, front desk, and the rest of the app for this property only. Related tickets and checklists for this room are removed.`
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/rooms/${room.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setRooms((prev) => prev.filter((r) => r.id !== room.id));
      setMessage(`Removed room ${room.number}`);
      if (draft?.id === room.id) setDraft(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            disabled={editing}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition",
              filter === f.key ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-accent",
              editing && "opacity-50"
            )}
          >
            {f.label}
          </button>
        ))}

        {canEdit && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing((v) => !v);
                setDraft(null);
                setError(null);
                setMessage(null);
                if (!editing) setFilter("all");
              }}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition",
                editing ? "bg-amber-600 text-white" : "border border-border bg-card hover:bg-muted"
              )}
            >
              {editing ? "Done editing" : "Edit rooms"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => openAdd()}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Add room
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Hotel map is the room list for this property. Add, edit, or remove rooms here — housekeeping,
          inspection, front desk, and reports all use these room numbers and types.
        </div>
      )}

      {(error || message) && (
        <div
          className={cn(
            "rounded-xl px-4 py-3 text-sm",
            error ? "border border-red-200 bg-red-50 text-red-800" : "border border-emerald-200 bg-emerald-50 text-emerald-900"
          )}
        >
          {error || message}
        </div>
      )}

      {draft && (
        <form
          onSubmit={saveDraft}
          className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{draft.id ? `Edit room ${draft.number}` : "Add room"}</h3>
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-muted-foreground">Room number</span>
              <input
                required
                value={draft.number}
                onChange={(e) => setDraft({ ...draft, number: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                placeholder="101"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Room type</span>
              <input
                required
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                placeholder="King Non-Smoking"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Floor</span>
              <input
                required
                type="number"
                min={1}
                max={99}
                value={draft.floor}
                onChange={(e) => setDraft({ ...draft, floor: Number(e.target.value) || 1 })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {draft.id ? "Save changes" : "Add to hotel map"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {!editing && (
        <div className="flex flex-wrap gap-4 rounded-xl bg-muted p-4 text-sm">
          {Object.entries(ROOM_STATUS_CONFIG).map(([key, config]) => (
            <div key={key} className="flex items-center gap-2">
              <span>{config.emoji}</span>
              <span>{config.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-8">
        {roomsByFloor.map(({ floor, rooms: floorRooms }) => (
          <div key={floor}>
            <div className="mb-4 flex items-center gap-3">
              <h3 className="text-lg font-semibold">Floor {floor}</h3>
              {editing && (
                <button
                  type="button"
                  onClick={() => openAdd(floor)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add on floor {floor}
                </button>
              )}
            </div>
            {floorRooms.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {editing ? "No rooms on this floor yet." : "No rooms match this filter."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {floorRooms.map((room) =>
                  editing ? (
                    <div
                      key={room.id}
                      className={cn(
                        "relative flex w-28 flex-col items-center rounded-xl border-2 border-border p-2",
                        ROOM_STATUS_CONFIG[room.status].bg
                      )}
                    >
                      <span className={cn("text-lg font-bold", ROOM_STATUS_CONFIG[room.status].text)}>
                        {room.number}
                      </span>
                      <span className="line-clamp-2 px-1 text-center text-[10px] leading-tight text-muted-foreground">
                        {room.type || "Standard"}
                      </span>
                      <div className="mt-2 flex gap-1">
                        <button
                          type="button"
                          title="Edit"
                          disabled={busy}
                          onClick={() => openEdit(room)}
                          className="rounded-md bg-white/80 p-1.5 hover:bg-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Remove"
                          disabled={busy}
                          onClick={() => removeRoom(room)}
                          className="rounded-md bg-white/80 p-1.5 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <RoomCell
                      key={room.id}
                      id={room.id}
                      number={room.number}
                      status={room.status}
                      isVip={room.isVip}
                      isRush={room.isRush}
                      type={room.type}
                      assignee={room.housekeeperName}
                    />
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
