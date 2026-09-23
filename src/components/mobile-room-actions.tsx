"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CleaningStatus, RoomStatus } from "@prisma/client";
import { offlineAwareFetch } from "@/lib/offline/queue";
import { useI18n } from "@/lib/i18n/context";
import { canFinishCleaning, canStartCleaning } from "@/lib/mobile-routes";

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
  const showFinish = canFinishCleaning(status, cleaningStatus);

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

  if (!showStart && !showFinish) return null;

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
      {showFinish && (
        <button
          type="button"
          onClick={() => act("finish_cleaning")}
          disabled={!!loading}
          className="col-span-2 rounded-xl bg-green-600 px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading === "finish_cleaning" ? "..." : t("finishCleaning")}
        </button>
      )}
    </div>
  );
}
