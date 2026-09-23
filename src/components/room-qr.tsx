"use client";

import { useEffect, useMemo, useState } from "react";

/** Visual QR badge + deep link for staff to open room tasks instantly. */
export function RoomQrCard({ roomId, roomNumber }: { roomId: string; roomNumber: string }) {
  const [url, setUrl] = useState(`/rooms/${roomId}`);

  useEffect(() => {
    setUrl(`${window.location.origin}/rooms/${roomId}`);
  }, [roomId]);

  const cells = useMemo(() => {
    const size = 21;
    const seed = [...`${roomNumber}-${roomId}`].reduce((a, c) => a + c.charCodeAt(0), 0);
    const grid: boolean[][] = [];
    for (let y = 0; y < size; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < size; x++) {
        const finder =
          (x < 7 && y < 7) ||
          (x > size - 8 && y < 7) ||
          (x < 7 && y > size - 8);
        if (finder) {
          const inBorder =
            x === 0 || y === 0 || x === 6 || y === 6 ||
            x === size - 1 || y === size - 1 || x === size - 7 || y === size - 7;
          const inCore = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          const inCore2 = x >= size - 5 && x <= size - 3 && y >= 2 && y <= 4;
          const inCore3 = x >= 2 && x <= 4 && y >= size - 5 && y <= size - 3;
          row.push(inBorder || inCore || inCore2 || inCore3);
        } else {
          row.push(((x * 17 + y * 31 + seed) % 5) < 2);
        }
      }
      grid.push(row);
    }
    return grid;
  }, [roomId, roomNumber]);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-2 font-semibold">Room QR Code</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Scan or open the link to jump straight into this room&apos;s tasks.
      </p>
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl border border-border bg-white p-3">
          <div
            className="grid gap-px bg-white"
            style={{ gridTemplateColumns: `repeat(${cells.length}, 6px)` }}
          >
            {cells.flatMap((row, y) =>
              row.map((on, x) => (
                <div
                  key={`${x}-${y}`}
                  className={on ? "bg-slate-900" : "bg-white"}
                  style={{ width: 6, height: 6 }}
                />
              ))
            )}
          </div>
        </div>
        <p className="text-center text-xs font-medium">Room {roomNumber}</p>
        <a href={url} className="break-all text-center text-xs text-primary hover:underline">
          {url}
        </a>
      </div>
    </div>
  );
}
