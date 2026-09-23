"use client";

import { useEffect, useState } from "react";

function formatElapsed(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/** Live clock next to a room that is being cleaned. */
export function CleaningTimer({
  startedAt,
  active,
}: {
  startedAt: Date | string | null;
  active: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active, startedAt]);

  if (!active || !startedAt) return null;

  const start = new Date(startedAt);
  const elapsed = formatElapsed(Math.floor((now - start.getTime()) / 1000));
  const clock = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <span className="text-sm font-semibold tabular-nums text-amber-700">
      {clock} · {elapsed}
    </span>
  );
}
