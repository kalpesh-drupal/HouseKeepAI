"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type DeskNote = {
  id: string;
  roomId: string;
  roomNumber?: string;
  message: string;
  createdAt: Date | string;
};

function timeLabel(value: Date | string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Latest front-desk room messages for the housekeeper, refreshed while the phone stays open. */
export function RoomDeskNoteFeed({
  notes,
  roomId,
  poll = false,
}: {
  notes: DeskNote[];
  roomId?: string;
  poll?: boolean;
}) {
  const [items, setItems] = useState(notes);

  useEffect(() => {
    setItems(notes);
  }, [notes]);

  useEffect(() => {
    if (!poll) return;
    let cancel = false;

    async function load() {
      try {
        const query = roomId ? `?roomId=${encodeURIComponent(roomId)}` : "";
        const res = await fetch(`/api/room-notes${query}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancel && Array.isArray(data.notes)) setItems(data.notes);
      } catch {
        // Keep the message already on screen.
      }
    }

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 10000);
    const onShow = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      cancel = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [poll, roomId]);

  const visible = roomId ? items.filter((note) => note.roomId === roomId).slice(0, 1) : items;
  if (visible.length === 0) return null;

  if (roomId) {
    const note = visible[0];
    return (
      <div className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Desk message</p>
        <p className="text-sm text-amber-950">{note.message}</p>
        <p className="text-xs text-amber-800/80">{timeLabel(note.createdAt)}</p>
      </div>
    );
  }

  return (
    <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">Front desk</h3>
      <ul className="space-y-3">
        {visible.map((note) => (
          <li key={note.id}>
            <Link href={`/m/rooms/${note.roomId}`} className="block">
              <p className="text-sm font-semibold text-amber-950">Room {note.roomNumber}</p>
              <p className="text-sm text-amber-950">{note.message}</p>
              <p className="text-xs text-amber-800/80">{timeLabel(note.createdAt)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
