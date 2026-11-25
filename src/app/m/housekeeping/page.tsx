import { requireAuth } from "@/lib/session";
import { getLatestRoomDeskNotes, getRoomsForUser } from "@/lib/queries";
import Link from "next/link";
import { guestStayLabel, ROOM_STATUS_CONFIG } from "@/lib/utils";
import { MobileRoomActions } from "@/components/mobile-room-actions";
import { CleaningTimer } from "@/components/cleaning-timer";
import { RoomCacheHydrator } from "@/components/room-cache-hydrator";
import { RoomStayCue } from "@/components/room-stay-cue";
import { activePortalProvider } from "@/lib/pms/active-provider";
import { pmsRoomLabel } from "@/lib/pms/pms-labels";
import { RoomDeskNotes } from "@/components/room-desk-notes";
import { RoomDeskNoteFeed } from "@/components/room-desk-note-feed";
import { isDirtyForHousekeeping, isOnInspectionList } from "@/lib/mobile-routes";

export default async function MobileHousekeepingPage() {
  const session = await requireAuth();
  const role = session.user.role;
  const [loadedRooms, pmsProvider, deskNotes] = await Promise.all([
    getRoomsForUser(session.user.hotelId, session.user.id, role),
    activePortalProvider(session.user.hotelId),
    getLatestRoomDeskNotes(session.user.hotelId),
  ]);
  const rooms = loadedRooms.filter((room) => {
    if (isOnInspectionList(room.status, room.cleaningStatus)) return false;
    if (role === "HOUSEKEEPER" || role === "INSPECTOR") return room.housekeeperId === session.user.id;
    if (role === "EXECUTIVE_HOUSEKEEPER") return isDirtyForHousekeeping(room.status, room.cleaningStatus);
    return true;
  });
  const visibleNotes =
    role === "HOUSEKEEPER" || role === "INSPECTOR" || role === "EXECUTIVE_HOUSEKEEPER"
      ? deskNotes.filter((note) => rooms.some((room) => room.id === note.roomId))
      : deskNotes;
  const heading =
    role === "EXECUTIVE_HOUSEKEEPER" ? "Dirty rooms" : role === "HOUSEKEEPER" || role === "INSPECTOR" ? "Your rooms" : "Today's Rooms";
  const summary =
    role === "EXECUTIVE_HOUSEKEEPER"
      ? `${rooms.length} dirty`
      : role === "HOUSEKEEPER" || role === "INSPECTOR"
        ? `${rooms.length} assigned to you`
        : `${rooms.length} rooms`;

  return (
    <div className="space-y-4">
      <RoomCacheHydrator
        rooms={rooms.map((r) => ({
          id: r.id,
          number: r.number,
          floor: r.floor,
          status: r.status,
          cleaningStatus: r.cleaningStatus,
          priority: r.priority,
          estimatedMinutes: r.estimatedMinutes,
          isVip: r.isVip,
          isRush: r.isRush,
          checklistItems: r.checklistItems.map((c) => ({
            id: c.id,
            label: c.label,
            completed: c.completed,
          })),
        }))}
      />
      <div>
        <h2 className="text-xl font-bold">{heading}</h2>
        <p className="text-sm text-muted-foreground">{summary}</p>
      </div>

      <RoomDeskNoteFeed notes={visibleNotes} poll />

      {rooms.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {role === "EXECUTIVE_HOUSEKEEPER" ? "No dirty rooms" : "No rooms assigned"}
        </div>
      ) : (
        rooms.map((room) => {
          const cfg = ROOM_STATUS_CONFIG[room.status];
          return (
            <div key={room.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link href={`/m/rooms/${room.id}`} className="flex items-baseline gap-2 text-2xl font-bold">
                    {room.number}
                    <CleaningTimer
                      startedAt={room.cleaningStartedAt}
                      active={room.status === "CLEANING"}
                    />
                  </Link>
                  <RoomStayCue
                    roomId={room.id}
                    guestStatus={room.guestStatus}
                    arrivalDate={room.arrivalDate}
                    departureDate={room.departureDate}
                    notes={room.frontDeskNotes}
                    doNotDisturb={room.doNotDisturb}
                  />
                </div>
                <span className={`rounded-full px-2 py-1 text-xs ${cfg.bg} ${cfg.text}`}>
                  HK: {pmsRoomLabel(room.status, room.guestStatus, pmsProvider)}
                </span>
              </div>
              <RoomDeskNotes notes={visibleNotes.filter((note) => note.roomId === room.id)} />
              <p className={`mb-2 inline-block rounded-full px-2 py-1 text-xs font-medium ${guestStayLabel(room.guestStatus, room.status).className}`}>
                {guestStayLabel(room.guestStatus, room.status).label}
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                Priority {room.priority} · Est. {room.estimatedMinutes} min
                {room.isVip ? " · VIP" : ""}
                {room.isRush ? " · RUSH" : ""}
              </p>
              <div className="mb-3 grid grid-cols-2 gap-1">
                {room.checklistItems.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-lg bg-muted px-2 py-1 text-xs">
                    {item.completed ? "✓" : "○"} {item.label}
                  </div>
                ))}
              </div>
              <MobileRoomActions roomId={room.id} status={room.status} cleaningStatus={room.cleaningStatus} />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link
                  href={`/m/rooms/${room.id}?do=issue`}
                  className="rounded-xl border border-border px-3 py-2 text-center text-xs font-medium"
                >
                  Report issue
                </Link>
                <Link
                  href={`/m/rooms/${room.id}?do=lost-found`}
                  className="rounded-xl border border-border px-3 py-2 text-center text-xs font-medium"
                >
                  Lost &amp; found
                </Link>
                <Link
                  href={`/m/rooms/${room.id}?do=linen`}
                  className="rounded-xl border border-border px-3 py-2 text-center text-xs font-medium"
                >
                  Pickup linen
                </Link>
                <Link
                  href={`/m/rooms/${room.id}?do=amenities`}
                  className="rounded-xl border border-border px-3 py-2 text-center text-xs font-medium"
                >
                  Amenities
                </Link>
                <Link
                  href={`/m/rooms/${room.id}?do=delay`}
                  className="col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-900"
                >
                  Taking longer than normal
                </Link>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
