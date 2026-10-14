import { requireAuth } from "@/lib/session";
import { getRoomsReadyToInspect } from "@/lib/queries";
import { ReadyToInspectList } from "@/components/ready-to-inspect-list";

export default async function InspectionPage() {
  const session = await requireAuth();
  const rooms = await getRoomsReadyToInspect(session.user.hotelId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Ready to inspect</h1>
        <p className="text-muted-foreground">
          Rooms housekeepers marked ready to inspect. Mark a room clean after you check it, or send it back dirty.
        </p>
      </div>
      <ReadyToInspectList
        rooms={rooms.map((room) => ({
          id: room.id,
          number: room.number,
          floor: room.floor,
          housekeeperName: room.housekeeper?.name ?? null,
          href: `/rooms/${room.id}`,
        }))}
      />
    </div>
  );
}
