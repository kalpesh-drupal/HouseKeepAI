import { requireAuth } from "@/lib/session";
import { getRoomsReadyToInspect } from "@/lib/queries";
import { ReadyToInspectList } from "@/components/ready-to-inspect-list";

export default async function MobileInspectionPage() {
  const session = await requireAuth();
  const rooms = await getRoomsReadyToInspect(session.user.hotelId);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Ready to inspect</h2>
        <p className="text-sm text-muted-foreground">{rooms.length} rooms waiting</p>
      </div>
      <ReadyToInspectList
        rooms={rooms.map((room) => ({
          id: room.id,
          number: room.number,
          floor: room.floor,
          housekeeperName: room.housekeeper?.name ?? null,
          href: `/m/rooms/${room.id}`,
        }))}
      />
    </div>
  );
}
