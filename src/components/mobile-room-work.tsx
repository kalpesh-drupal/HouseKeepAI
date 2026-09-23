"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CleaningStatus, RoomStatus } from "@prisma/client";
import { Clock, Package, Search, Shirt, Wrench } from "lucide-react";
import { offlineAwareFetch } from "@/lib/offline/queue";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { canFinishCleaning, canStartCleaning } from "@/lib/mobile-routes";
import { MobileLostFoundForm } from "@/components/mobile-lost-found-form";
import { MobileIssueForm } from "@/components/mobile-issue-form";

const LINEN_TYPES = ["Sheets", "Towels", "Pillow Cases", "Bath Mats", "Blankets", "Robes"];
const DELAY_REASONS = [
  "Extra dirty",
  "Extra linen / amenities",
  "Guest still in room",
  "Waiting on maintenance",
  "Suite / large room",
  "Other",
];

type Amenity = { id: string; category: string; unit: string; quantity: number };
type Panel = "issue" | "lost-found" | "linen" | "amenities" | "delay" | null;

export function MobileRoomWork({
  roomId,
  roomNumber,
  status,
  cleaningStatus,
  estimatedMinutes,
  amenities,
  initialPanel = null,
}: {
  roomId: string;
  roomNumber: string;
  status: RoomStatus;
  cleaningStatus: CleaningStatus;
  estimatedMinutes: number;
  amenities: Amenity[];
  initialPanel?: Panel;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [panel, setPanel] = useState<Panel>(initialPanel);
  const [loading, setLoading] = useState<string | null>(null);
  const [linenQty, setLinenQty] = useState<Record<string, number>>({});
  const [amenityQty, setAmenityQty] = useState<Record<string, number>>({});
  const [extraMinutes, setExtraMinutes] = useState(15);
  const [delayReason, setDelayReason] = useState(DELAY_REASONS[0]);
  const [delayNotes, setDelayNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amenityList = amenities.length > 0
    ? amenities
    : [
        { id: "Soap", category: "Soap", unit: "units", quantity: 0 },
        { id: "Shampoo", category: "Shampoo", unit: "units", quantity: 0 },
        { id: "Coffee", category: "Coffee", unit: "units", quantity: 0 },
        { id: "Toilet Paper", category: "Toilet Paper", unit: "units", quantity: 0 },
        { id: "Water", category: "Water", unit: "units", quantity: 0 },
      ];

  function toggle(next: Panel) {
    setMessage(null);
    setError(null);
    setPanel((cur) => (cur === next ? null : next));
  }

  async function act(action: string) {
    setLoading(action);
    setError(null);
    await offlineAwareFetch(`/api/rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoading(null);
    router.refresh();
  }

  async function submitPickup(kind: "linen" | "amenities") {
    const items =
      kind === "linen"
        ? LINEN_TYPES.filter((type) => (linenQty[type] || 0) > 0).map((itemType) => ({
            itemType,
            quantity: linenQty[itemType],
          }))
        : amenityList
            .filter((item) => (amenityQty[item.id] || 0) > 0)
            .map((item) => ({
              itemId: amenities.length > 0 ? item.id : undefined,
              category: item.category,
              quantity: amenityQty[item.id],
            }));

    setLoading(kind);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/rooms/${roomId}/pickup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, items }),
    });
    const data = await res.json();
    setLoading(null);
    if (!res.ok || !data.success) {
      setError(data.error || "Could not save pickup");
      return;
    }
    if (kind === "linen") setLinenQty({});
    else setAmenityQty({});
    setMessage(data.note || "Saved");
    router.refresh();
  }

  async function submitDelay(e: FormEvent) {
    e.preventDefault();
    setLoading("delay");
    setError(null);
    setMessage(null);
    const reason = delayReason === "Other" && delayNotes.trim()
      ? delayNotes.trim()
      : [delayReason, delayNotes.trim()].filter(Boolean).join(" — ");
    const res = await offlineAwareFetch(`/api/rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "report_delay",
        extraMinutes,
        reason,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(null);
    if (!res.ok) {
      setError("Could not report delay");
      return;
    }
    setMessage(`Reported +${data.extraMinutes || extraMinutes} min extra time`);
    setDelayNotes("");
    router.refresh();
  }

  const actions = useMemo(
    () => [
      {
        key: "issue" as const,
        label: t("reportIssue"),
        icon: Wrench,
        show: true,
      },
      {
        key: "lost-found" as const,
        label: t("lostFound"),
        icon: Search,
        show: true,
      },
      {
        key: "linen" as const,
        label: t("pickupLinen"),
        icon: Shirt,
        show: true,
      },
      {
        key: "amenities" as const,
        label: t("pickupAmenities"),
        icon: Package,
        show: true,
      },
      {
        key: "delay" as const,
        label: t("takingLonger"),
        icon: Clock,
        show: true,
      },
    ],
    [t]
  );

  const showStart = canStartCleaning(status, cleaningStatus);
  const showFinish = canFinishCleaning(status, cleaningStatus);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
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
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => toggle(action.key)}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium",
              panel === action.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card"
            )}
          >
            <action.icon className="h-4 w-4" />
            {action.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      {panel === "issue" && <MobileIssueForm roomId={roomId} />}
      {panel === "lost-found" && <MobileLostFoundForm defaultRoomNumber={roomNumber} compact />}

      {panel === "linen" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitPickup("linen");
          }}
          className="space-y-3 rounded-2xl border border-border bg-card p-4"
        >
          <h3 className="font-semibold">Pickup dirty linen</h3>
          <p className="text-xs text-muted-foreground">Count what you pulled from this room. It goes to laundry as dirty.</p>
          <div className="space-y-2">
            {LINEN_TYPES.map((type) => (
              <label key={type} className="flex items-center justify-between gap-3 text-sm">
                <span>{type}</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={linenQty[type] ?? 0}
                  onChange={(e) =>
                    setLinenQty((prev) => ({ ...prev, [type]: Math.max(0, Number(e.target.value) || 0) }))
                  }
                  className="w-20 rounded-lg border border-border px-2 py-1.5 text-right"
                />
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={!!loading}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading === "linen" ? "Saving…" : "Log linen pickup"}
          </button>
        </form>
      )}

      {panel === "amenities" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitPickup("amenities");
          }}
          className="space-y-3 rounded-2xl border border-border bg-card p-4"
        >
          <h3 className="font-semibold">Amenities used</h3>
          <p className="text-xs text-muted-foreground">
            Log extras you restocked while cleaning (soap, coffee, paper, and so on).
          </p>
          <div className="space-y-2">
            {amenityList.map((item) => (
              <label key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {item.category}
                  {amenities.length > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">({item.quantity} left)</span>
                  )}
                </span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={amenityQty[item.id] ?? 0}
                  onChange={(e) =>
                    setAmenityQty((prev) => ({
                      ...prev,
                      [item.id]: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="w-20 rounded-lg border border-border px-2 py-1.5 text-right"
                />
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={!!loading}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading === "amenities" ? "Saving…" : "Log amenities"}
          </button>
        </form>
      )}

      {panel === "delay" && (
        <form onSubmit={submitDelay} className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h3 className="font-semibold">Taking longer than normal</h3>
          <p className="text-xs text-muted-foreground">
            Estimated {estimatedMinutes} min. Tell the desk if this room will run over.
          </p>
          <label className="block text-sm">
            <span className="text-muted-foreground">Extra minutes</span>
            <select
              value={extraMinutes}
              onChange={(e) => setExtraMinutes(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-border px-3 py-2"
            >
              {[10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  +{m} minutes
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Why</span>
            <select
              value={delayReason}
              onChange={(e) => setDelayReason(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border px-3 py-2"
            >
              {DELAY_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <textarea
            placeholder="Optional details"
            value={delayNotes}
            onChange={(e) => setDelayNotes(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!!loading}
            className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading === "delay" ? "Sending…" : "Report extra time"}
          </button>
        </form>
      )}
    </div>
  );
}
