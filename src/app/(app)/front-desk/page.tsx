import { requireAuth } from "@/lib/session";
import { getFrontDeskData, getRoomDeskNotes, getRoomsForUser } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CLEANING_STAFF_ROLES, cleaningStaffLabel, guestStayLabel, ROOM_STATUS_CONFIG } from "@/lib/utils";
import { activePortalProvider } from "@/lib/pms/active-provider";
import { pmsRoomLabel } from "@/lib/pms/pms-labels";
import { RoomDeskNoteForm } from "@/components/room-desk-note-form";

export default async function FrontDeskPage() {
  const session = await requireAuth();
  const hotelId = session.user.hotelId;
  const [data, rooms, housekeepers, notes, pmsProvider] = await Promise.all([
    getFrontDeskData(hotelId),
    getRoomsForUser(hotelId, session.user.id, session.user.role),
    prisma.user.findMany({
      where: { hotelId, role: { in: CLEANING_STAFF_ROLES }, active: true },
      select: { id: true, name: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    getRoomDeskNotes(hotelId),
    activePortalProvider(hotelId),
  ]);

  const latestNote = new Map<string, (typeof notes)[number]>();
  for (const note of notes) {
    if (!latestNote.has(note.roomId)) latestNote.set(note.roomId, note);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Front Desk</h1>
        <p className="text-muted-foreground">
          Dirty rooms, the housekeeping team, and a message the housekeeper can read on the room.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Dirty rooms ({data.dirtyRooms.length})</h2>
          {data.dirtyRooms.length === 0 ? (
            <p className="text-sm text-muted-foreground">None</p>
          ) : (
            <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {data.dirtyRooms.map((room) => {
                const config = ROOM_STATUS_CONFIG[room.status];
                const stay = guestStayLabel(room.guestStatus, room.status);
                const note = latestNote.get(room.id);
                return (
                  <div key={room.id} className={`rounded-xl p-3 ${config.bg}`}>
                    <Link href={`/rooms/${room.id}`} className="font-semibold hover:underline">
                      Room {room.number}
                    </Link>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className={`rounded-full bg-white px-2 py-0.5 text-xs font-medium ${config.text}`}>
                        {pmsRoomLabel(room.status, room.guestStatus, pmsProvider)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${stay.className}`}>
                        {stay.label}
                      </span>
                    </div>
                    {note && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {note.message}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Housekeepers ({housekeepers.length})</h2>
          {housekeepers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active housekeepers.</p>
          ) : (
            <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {housekeepers.map((hk) => (
                <li key={hk.id} className="rounded-xl bg-muted px-4 py-3 text-sm font-medium">
                  {cleaningStaffLabel(hk.name, hk.role)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-1 font-semibold">Message a room</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Enter the room number and the message. It stays on that room for the housekeeper.
          </p>
          <RoomDeskNoteForm />
        </section>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Who has which room</h2>
          <p className="text-sm text-muted-foreground">Rooms currently assigned to each housekeeper.</p>
        </div>
        {housekeepers.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            No active housekeepers.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {housekeepers.map((hk) => {
              const assigned = rooms.filter((room) => room.housekeeperId === hk.id);
              return (
                <div key={hk.id} className="rounded-2xl border border-border bg-card p-6">
                  <h3 className="font-semibold">{cleaningStaffLabel(hk.name, hk.role)}</h3>
                  <p className="mb-3 text-xs text-muted-foreground">{assigned.length} room{assigned.length === 1 ? "" : "s"}</p>
                  {assigned.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No rooms assigned.</p>
                  ) : (
                    <ul className="space-y-2">
                      {assigned.map((room) => {
                        const config = ROOM_STATUS_CONFIG[room.status];
                        const stay = guestStayLabel(room.guestStatus, room.status);
                        return (
                          <li key={room.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                            <Link href={`/rooms/${room.id}`} className="font-medium hover:underline">
                              {room.number}
                            </Link>
                            <span className="flex flex-wrap gap-1">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}>
                                {pmsRoomLabel(room.status, room.guestStatus, pmsProvider)}
                              </span>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${stay.className}`}>
                                {stay.label}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
