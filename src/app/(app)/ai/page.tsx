import { requireAuth } from "@/lib/session";
import { buildAiInsights } from "@/lib/ai";
import { AiChat } from "@/components/ai-chat";
import { ApplyAiAssignmentsButton } from "@/components/apply-ai-assignments";
import Link from "next/link";
import { UserRole } from "@prisma/client";
import { Crown, Zap } from "lucide-react";

export default async function AiPage() {
  const session = await requireAuth([
    UserRole.OWNER,
    UserRole.GENERAL_MANAGER,
    UserRole.EXECUTIVE_HOUSEKEEPER,
    UserRole.FRONT_DESK,
  ]);
  const insights = await buildAiInsights(session.user.hotelId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">AI Assistant</h1>
        <p className="text-muted-foreground">
          Prioritization, forecasting, and natural-language ops insights for {session.user.hotelName}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {insights.summary.map((s, i) => (
          <div key={i} className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            {s}
          </div>
        ))}
      </div>

      <AiChat />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">AI Cleaning Priority</h2>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/housekeeping" className="text-sm font-medium text-primary hover:underline">
                Assign rooms manually
              </Link>
              <ApplyAiAssignmentsButton />
            </div>
          </div>
          <div className="space-y-3">
            {insights.priorityRooms.slice(0, 8).map((room, idx) => (
              <Link
                key={room.id}
                href={`/rooms/${room.id}`}
                className="block rounded-xl bg-muted p-4 transition hover:bg-accent"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                      {idx + 1}
                    </span>
                    <span className="font-semibold">Room {room.number}</span>
                    {room.isVip && <Crown className="h-4 w-4 text-amber-500" />}
                    {room.isRush && <Zap className="h-4 w-4 text-red-500" />}
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Score {room.score}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{room.reasons.join(" · ")}</p>
                {room.suggestedHousekeeper && (
                  <p className="mt-1 text-xs text-primary">Suggested: {room.suggestedHousekeeper}</p>
                )}
              </Link>
            ))}
            {insights.priorityRooms.length === 0 && (
              <p className="text-sm text-muted-foreground">No rooms need cleaning right now.</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 font-semibold">Predictive Maintenance</h2>
            <div className="space-y-2">
              {insights.maintenancePredictions.map((m) => (
                <div key={`${m.roomNumber}-${m.title}`} className="rounded-xl bg-muted px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Room {m.roomNumber}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${m.risk === "High" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>
                      {m.risk} risk
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{m.reason}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 font-semibold">Inventory Forecast</h2>
            <div className="space-y-2">
              {insights.inventoryForecast.slice(0, 6).map((i) => (
                <div key={i.category} className="flex items-center justify-between rounded-xl bg-muted px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{i.category}</p>
                    <p className="text-xs text-muted-foreground">~{i.daysLeft} days left · order ~{i.orderQty}</p>
                  </div>
                  <span className="text-xs font-medium">{i.alert}</span>
                </div>
              ))}
              {insights.inventoryForecast.length === 0 && (
                <p className="text-sm text-muted-foreground">No urgent reorders.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Slow Room Turnover</h2>
          {insights.slowRooms.length === 0 ? (
            <p className="text-sm text-muted-foreground">No slow rooms detected.</p>
          ) : (
            <div className="space-y-2">
              {insights.slowRooms.map((r) => (
                <Link key={r.id} href={`/rooms/${r.id}`} className="block rounded-xl bg-muted px-4 py-3 text-sm hover:bg-accent">
                  <span className="font-medium">Room {r.number}</span>
                  <span className="ml-2 text-muted-foreground">{r.minutesStuck} min — {r.reason}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Repeat Inspection Failures</h2>
          {insights.repeatInspectionFails.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rooms with repeated inspection failures.</p>
          ) : (
            <div className="space-y-2">
              {insights.repeatInspectionFails.map((r) => (
                <Link key={r.roomId} href={`/rooms/${r.roomId}`} className="flex justify-between rounded-xl bg-muted px-4 py-3 text-sm hover:bg-accent">
                  <span className="font-medium">Room {r.roomNumber}</span>
                  <span className="text-red-700">{r.fails} fails</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
