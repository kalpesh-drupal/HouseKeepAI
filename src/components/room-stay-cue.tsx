"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { changeBeddingDue, isStayoverRoom, stayNights, type StayDate } from "@/lib/stay";

export function RoomStayCue({
  roomId,
  guestStatus,
  arrivalDate,
  departureDate,
  notes,
  doNotDisturb,
  showDnd = true,
}: {
  roomId?: string;
  guestStatus: string | null;
  arrivalDate: StayDate;
  departureDate: StayDate;
  notes?: string | null;
  doNotDisturb?: boolean;
  showDnd?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const dnd = optimistic ?? !!doNotDisturb;

  useEffect(() => {
    setOptimistic(null);
  }, [doNotDisturb]);
  const nights = stayNights(arrivalDate, departureDate);
  const stayover = isStayoverRoom(guestStatus, arrivalDate, departureDate);
  const bedding = changeBeddingDue(guestStatus, arrivalDate, departureDate);
  const note = notes?.trim();

  async function toggleDnd() {
    if (!roomId) return;
    setBusy(true);
    const res = await fetch(`/api/rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_dnd" }),
    });
    setBusy(false);
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    setOptimistic(!!data.doNotDisturb);
    router.refresh();
  }

  if (!bedding && !stayover && !note && !dnd) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
      {nights != null && stayover && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
          {nights}-day stay
        </span>
      )}
      {bedding && (
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-900">
          {t("changeBedding")}
        </span>
      )}
      {dnd && (
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-white">DND</span>
      )}
      {showDnd && stayover && roomId && (
        <button
          type="button"
          onClick={toggleDnd}
          disabled={busy}
          className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-800 disabled:opacity-50"
        >
          {busy ? "..." : dnd ? t("clearDnd") : t("markDnd")}
        </button>
      )}
      {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
    </span>
  );
}
