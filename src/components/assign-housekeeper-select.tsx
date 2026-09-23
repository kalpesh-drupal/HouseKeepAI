"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type HousekeeperOption = { id: string; name: string };

export function AssignHousekeeperSelect({
  roomId,
  housekeeperId,
  housekeepers,
  onAssigned,
  className,
}: {
  roomId: string;
  housekeeperId: string | null;
  housekeepers: HousekeeperOption[];
  onAssigned?: (housekeeperId: string | null, name: string | null) => void;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(housekeeperId ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(housekeeperId ?? "");
  }, [housekeeperId]);

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setSaving(true);
    const res = await fetch(`/api/rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "assign_housekeeper",
        housekeeperId: next || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok || !data.success) {
      setValue(previous);
      return;
    }
    onAssigned?.(data.room.housekeeperId, data.room.housekeeperName);
    router.refresh();
  }

  return (
    <select
      value={value}
      disabled={saving || housekeepers.length === 0}
      onChange={(e) => change(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "rounded-lg border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-60",
        className
      )}
      aria-label="Assign housekeeper"
    >
      <option value="">Unassigned</option>
      {housekeepers.map((hk) => (
        <option key={hk.id} value={hk.id}>
          {hk.name}
        </option>
      ))}
    </select>
  );
}
