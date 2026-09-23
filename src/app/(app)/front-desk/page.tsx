import { requireAuth } from "@/lib/session";
import { getFrontDeskData } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ROOM_STATUS_CONFIG } from "@/lib/utils";
import { FrontDeskActions } from "@/components/front-desk-actions";

export default async function FrontDeskPage() {
  const session = await requireAuth();
  const [data, allRooms] = await Promise.all([
    getFrontDeskData(session.user.hotelId),
    prisma.room.findMany({
      where: { hotelId: session.user.hotelId },
      select: { id: true, number: true },
      orderBy: { number: "asc" },
    }),
  ]);

  const sections = [
    { title: "Clean Rooms", rooms: data.cleanRooms },
    { title: "Dirty Rooms", rooms: data.dirtyRooms },
    { title: "Expected Arrivals", rooms: data.arrivals },
    { title: "Expected Departures", rooms: data.departures },
    { title: "Rush Rooms", rooms: data.rushRooms },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Front Desk</h1>
        <p className="text-muted-foreground">
          Mark VIP, rush clean, move, block, or set out of order — without leaving this screen
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {sections.map((section) => (
          <div key={section.title} className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 font-semibold">{section.title} ({section.rooms.length})</h2>
            {section.rooms.length === 0 ? (
              <p className="text-sm text-muted-foreground">None</p>
            ) : (
              <div className="space-y-3">
                {section.rooms.map((room) => (
                  <div key={room.id} className={`rounded-xl p-3 ${ROOM_STATUS_CONFIG[room.status].bg}`}>
                    <div className="flex items-center justify-between">
                      <Link href={`/rooms/${room.id}`} className="font-semibold hover:underline">
                        Room {room.number}
                        {room.isVip ? " ★" : ""}
                        {room.isRush ? " ⚡" : ""}
                      </Link>
                      <span className="text-xs">{ROOM_STATUS_CONFIG[room.status].label}</span>
                    </div>
                    <FrontDeskActions
                      room={{ id: room.id, number: room.number, isVip: room.isVip, isRush: room.isRush }}
                      allRooms={allRooms}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Guest Requests ({data.guestRequests.length})</h2>
          <div className="space-y-2">
            {data.guestRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 text-sm">
                <span>Room {req.room.number}: {req.type}</span>
                <span className="rounded-full bg-white px-2 py-1 text-xs">{req.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Maintenance Issues ({data.maintenanceIssues.length})</h2>
          <div className="space-y-2">
            {data.maintenanceIssues.map((ticket) => (
              <div key={ticket.id} className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 text-sm">
                <span>Room {ticket.room.number}: {ticket.title}</span>
                <span className="rounded-full bg-white px-2 py-1 text-xs">{ticket.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
