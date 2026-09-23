import { requireAuth } from "@/lib/session";
import { getRoomById } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { canAssignHousekeepers, ROOM_STATUS_CONFIG } from "@/lib/utils";
import { RoomActions } from "@/components/room-actions";
import { RoomQrCard } from "@/components/room-qr";
import { RoomPhotoPanel } from "@/components/room-photo-panel";
import { RoomNotesEditor } from "@/components/room-notes-editor";
import { AssignHousekeeperSelect } from "@/components/assign-housekeeper-select";
import Link from "next/link";
import { ArrowLeft, Crown, Zap } from "lucide-react";

export default async function RoomDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const canAssign = canAssignHousekeepers(session.user.role);
  const [room, housekeepers] = await Promise.all([
    getRoomById(id, session.user.hotelId),
    canAssign
      ? prisma.user.findMany({
          where: { hotelId: session.user.hotelId, role: "HOUSEKEEPER", active: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  if (!room) notFound();

  const statusConfig = ROOM_STATUS_CONFIG[room.status];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/map" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to map
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Room {room.number}</h1>
            {room.isVip && <span className="flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800"><Crown className="h-4 w-4" /> VIP</span>}
            {room.isRush && <span className="flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800"><Zap className="h-4 w-4" /> Rush</span>}
          </div>
          <p className="text-muted-foreground">Floor {room.floor} · {room.type}</p>
        </div>
        <div className={`rounded-2xl px-4 py-2 text-center ${statusConfig.bg}`}>
          <span className="text-2xl">{statusConfig.emoji}</span>
          <p className={`font-semibold ${statusConfig.text}`}>{statusConfig.label}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Guest Information</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Guest</dt><dd className="font-medium">{room.guestName ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Arrival</dt><dd>{room.arrivalDate ? new Date(room.arrivalDate).toLocaleDateString() : "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Departure</dt><dd>{room.departureDate ? new Date(room.departureDate).toLocaleDateString() : "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Cleaning Status</dt><dd className="font-medium">{room.cleaningStatus.replace(/_/g, " ")}</dd></div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Housekeeper</dt>
              <dd>
                {canAssign ? (
                  <AssignHousekeeperSelect
                    roomId={room.id}
                    housekeeperId={room.housekeeperId}
                    housekeepers={housekeepers}
                  />
                ) : (
                  room.housekeeper?.name ?? "Unassigned"
                )}
              </dd>
            </div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Inspector</dt><dd>{room.inspector?.name ?? "—"}</dd></div>
          </dl>
        </div>

        <div className="space-y-4">
          <RoomQrCard roomId={room.id} roomNumber={room.number} />
          <RoomNotesEditor
            roomId={room.id}
            guestNotes={room.guestNotes}
            frontDeskNotes={room.frontDeskNotes}
          />
        </div>
      </div>

      {room.checklistItems.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Cleaning Checklist</h2>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {room.checklistItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                {item.completed ? "✓" : item.needsAttention ? "⚠" : "○"} {item.label}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Digital Maintenance History</h2>
          {room.maintenanceTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No maintenance history for this room.</p>
          ) : (
            <div className="space-y-2">
              {room.maintenanceTickets.map((ticket) => (
                <div key={ticket.id} className="rounded-lg bg-muted px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{ticket.title}</span>
                    <span className="rounded-full bg-white px-2 py-1 text-xs">{ticket.status}</span>
                  </div>
                  {ticket.description && <p className="mt-1 text-xs text-muted-foreground">{ticket.description}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ticket.priority} · {new Date(ticket.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Inspection History</h2>
          {room.inspections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inspections yet.</p>
          ) : (
            <div className="space-y-2">
              {room.inspections.map((insp) => (
                <div key={insp.id} className="rounded-lg bg-muted px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{insp.status}</span>
                    <span className="text-xs text-muted-foreground">{insp.score != null ? `Score ${insp.score}` : "—"}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {insp.inspector.name} · {new Date(insp.createdAt).toLocaleString()}
                  </p>
                  {insp.notes && <p className="mt-1 text-xs">{insp.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <RoomPhotoPanel
        roomId={room.id}
        photos={room.photos.map((p) => ({
          id: p.id,
          url: p.url,
          type: p.type,
          caption: p.caption,
          createdAt: p.createdAt,
        }))}
      />

      <RoomActions
        roomId={room.id}
        status={room.status}
        cleaningStatus={room.cleaningStatus}
        userRole={session.user.role}
        isVip={room.isVip}
        isRush={room.isRush}
      />
    </div>
  );
}
