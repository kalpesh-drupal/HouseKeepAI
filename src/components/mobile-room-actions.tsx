"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CleaningStatus, RoomStatus } from "@prisma/client";
import { offlineAwareFetch } from "@/lib/offline/queue";
import { useI18n } from "@/lib/i18n/context";
import { canChooseCleanOutcome, canStartCleaning } from "@/lib/mobile-routes";

export function MobileRoomActions({
  roomId,
  status,
  cleaningStatus,
}: {
  roomId: string;
  status: RoomStatus;
  cleaningStatus: CleaningStatus;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showStart = canStartCleaning(status, cleaningStatus);
  const showOutcome = canChooseCleanOutcome(status, cleaningStatus);

  async function act(action: string) {
    setLoading(action);
    setError(null);
    try {
      const res = await offlineAwareFetch(`/api/rooms/${roomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not update this room");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(null);
    }
  }

  if (!showStart && !showOutcome) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
      {showStart && (
        <button
          type="button"
          onClick={() => act("start_cleaning")}
          disabled={!!loading}
          className="col-span-2 rounded-xl bg-primary px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading === "start_cleaning" ? "..." : t("startCleaning")}
        </button>
      )}
      {showOutcome && (
        <>
          <button
            type="button"
            onClick={() => act("mark_clean")}
            disabled={!!loading}
            className="rounded-xl bg-green-600 px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading === "mark_clean" ? "..." : t("markClean")}
          </button>
          <button
            type="button"
            onClick={() => act("ready_to_inspect")}
            disabled={!!loading}
            className="rounded-xl bg-amber-500 px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading === "ready_to_inspect" ? "..." : t("readyToInspect")}
          </button>
          <p className="col-span-2 text-xs text-muted-foreground">
            Mark clean when this hotel skips inspection. Choose ready to inspect when the head housekeeper must check the room first.
          </p>
        </>
      )}
    </div>
  );
}
