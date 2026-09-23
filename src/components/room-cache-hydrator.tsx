"use client";

import { useEffect } from "react";
import { cacheRooms } from "@/lib/offline/room-cache";

type RoomInput = {
  id: string;
  number: string;
  floor: number;
  status: string;
  cleaningStatus: string;
  priority: number;
  estimatedMinutes: number;
  isVip: boolean;
  isRush: boolean;
  checklistItems: Array<{ id: string; label: string; completed: boolean }>;
};

/** Persist assigned rooms to IndexedDB so mobile can fall back when offline. */
export function RoomCacheHydrator({ rooms }: { rooms: RoomInput[] }) {
  useEffect(() => {
    cacheRooms(rooms).catch(() => {});
    // Cache whenever the assigned room set changes
  }, [rooms.map((r) => `${r.id}:${r.status}:${r.cleaningStatus}`).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
