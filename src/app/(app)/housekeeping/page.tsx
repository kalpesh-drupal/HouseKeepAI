import { requireAuth } from "@/lib/session";
import { getRoomsForUser } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ChecklistToggle } from "@/components/checklist-toggle";
import { Crown, Zap, Clock } from "lucide-react";
import { canAssignHousekeepers, ROOM_STATUS_CONFIG } from "@/lib/utils";
import { RoomAssignmentBoard } from "@/components/room-assignment-board";
import { MobileRoomActions } from "@/components/mobile-room-actions";
import { CleaningTimer } from "@/components/cleaning-timer";

export default async function HousekeepingPage() {
  const session = await requireAuth();
  const canAssign = canAssignHousekeepers(session.user.role);
  const [rooms, housekeepers] = await Promise.all([
    getRoomsForUser(session.user.hotelId, session.user.id, session.user.role),
    canAssign
      ? prisma.user.findMany({
          where: { hotelId: session.user.hotelId, role: "HOUSEKEEPER", active: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Housekeeping</h1>
        <p className="text-muted-foreground">
          {session.user.role === "HOUSEKEEPER"
            ? "Your assigned rooms for today"
            : "Assign rooms to housekeepers manually or with AI, then track cleaning."}
        </p>
      </div>

      {canAssign && (
        <RoomAssignmentBoard
          rooms={rooms.map((room) => ({
            id: room.id,
            number: room.number,
            floor: room.floor,
            status: room.status,
            housekeeperId: room.housekeeperId,
            housekeeperName: room.housekeeper?.name ?? null,
            isVip: room.isVip,
            isRush: room.isRush,
          }))}
          housekeepers={housekeepers}
        />
      )}

      {session.user.role === "HOUSEKEEPER" && (
        rooms.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <p className="text-muted-foreground">No rooms assigned.</p>
          </div>
        ) : (
        <div className="space-y-6">
          {rooms.map((room) => {
            const config = ROOM_STATUS_CONFIG[room.status];
            return (
              <div key={room.id} className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <Link href={`/rooms/${room.id}`} className="flex items-baseline gap-2 text-2xl font-bold hover:text-primary">
                        Room {room.number}
                        <CleaningTimer
                          startedAt={room.cleaningStartedAt}
                          active={room.status === "CLEANING"}
                        />
                      </Link>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${config.bg} ${config.text}`}>
                        {config.emoji} {config.label}
                      </span>
                      {room.isVip && <Crown className="h-5 w-5 text-amber-500" />}
                      {room.isRush && <Zap className="h-5 w-5 text-red-500" />}
                    </div>
                    <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                      <span>Priority: {room.priority}</span>
                      <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> Est. {room.estimatedMinutes} min</span>
                      {room.housekeeper?.name && <span>HK: {room.housekeeper.name}</span>}
                      {room.arrivalDate && <span>Arrival: {new Date(room.arrivalDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-medium">Checklist</h3>
                  {room.checklistItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
                      <span className="text-sm">{item.label}</span>
                      <ChecklistToggle itemId={item.id} completed={item.completed} needsAttention={item.needsAttention} />
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-3">
                  <MobileRoomActions
                    roomId={room.id}
                    status={room.status}
                    cleaningStatus={room.cleaningStatus}
                  />
                  <div className="flex flex-wrap gap-2">
                  <Link href={`/rooms/${room.id}`} className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
                    Room details / photos
                  </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )
      )}
    </div>
  );
}
