import { requireAuth } from "@/lib/session";
import { getRoomById } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { GUEST_STAY_CONFIG, ROOM_STATUS_CONFIG } from "@/lib/utils";
import { MobilePhotoUpload } from "@/components/mobile-photo-upload";
import { MobileRoomWork } from "@/components/mobile-room-work";
import { RoomNotesEditor } from "@/components/room-notes-editor";
import { ChecklistToggle } from "@/components/checklist-toggle";
import { CleaningTimer } from "@/components/cleaning-timer";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const LINEN_CATEGORIES = ["Towels", "Pillows", "Sheets", "Blankets"];

const PANELS = ["issue", "lost-found", "linen", "amenities", "delay"] as const;

export default async function MobileRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ do?: string }>;
}) {
  const session = await requireAuth(undefined, "/login?callbackUrl=/m");
  const { id } = await params;
  const query = await searchParams;
  const room = await getRoomById(id, session.user.hotelId);
  if (!room) notFound();
  const cfg = ROOM_STATUS_CONFIG[room.status];
  const amenities = await prisma.inventoryItem.findMany({
    where: {
      hotelId: session.user.hotelId,
      category: { notIn: LINEN_CATEGORIES },
    },
    select: { id: true, category: true, unit: true, quantity: true },
    orderBy: { category: "asc" },
  });
  const initialPanel = PANELS.includes(query.do as (typeof PANELS)[number])
    ? (query.do as (typeof PANELS)[number])
    : null;

  return (
    <div className="space-y-4">
      <Link href="/m/housekeeping" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div className="flex items-center justify-between">
        <h2 className="flex items-baseline gap-2 text-2xl font-bold">
          Room {room.number}
          <CleaningTimer startedAt={room.cleaningStartedAt} active={room.status === "CLEANING"} />
        </h2>
        <span className={`rounded-full px-2 py-1 text-xs ${cfg.bg}`}>{cfg.label}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Guest: {room.guestName || "—"} · {GUEST_STAY_CONFIG[room.guestStatus].label} · HK: {room.housekeeper?.name || "Unassigned"} · Est. {room.estimatedMinutes} min
      </p>

      <MobileRoomWork
        roomId={room.id}
        roomNumber={room.number}
        status={room.status}
        cleaningStatus={room.cleaningStatus}
        estimatedMinutes={room.estimatedMinutes}
        amenities={amenities}
        initialPanel={initialPanel}
      />

      <MobilePhotoUpload roomId={room.id} />

      {room.photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {room.photos.slice(0, 6).map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.type} className="h-20 w-full rounded-lg object-cover" />
            </a>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {room.checklistItems.map((item) => (
          <div key={item.id} className="rounded-xl border border-border bg-card p-3">
            <p className="mb-2 text-sm font-medium">{item.label}</p>
            <ChecklistToggle itemId={item.id} completed={item.completed} needsAttention={item.needsAttention} />
          </div>
        ))}
      </div>

      <RoomNotesEditor
        roomId={room.id}
        guestNotes={room.guestNotes}
        frontDeskNotes={room.frontDeskNotes}
      />
    </div>
  );
}
