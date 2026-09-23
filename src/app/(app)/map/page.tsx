import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { HotelMap } from "@/components/hotel-map";
import { canEditRoomInventory } from "@/lib/room-inventory";
import Link from "next/link";

export default async function MapPage() {
  const session = await requireAuth();
  const canEdit = canEditRoomInventory(session.user.role);
  const hotel = await prisma.hotel.findUnique({ where: { id: session.user.hotelId } });
  const rooms = await prisma.room.findMany({
    where: { hotelId: session.user.hotelId },
    include: { housekeeper: { select: { name: true } } },
    orderBy: [{ floor: "asc" }, { number: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Interactive Hotel Map</h1>
          <p className="text-muted-foreground">
            {canEdit
              ? "Click a room for details, or Edit rooms to add, change type, or remove rooms for this property."
              : "Click any room to view details and take action"}
          </p>
        </div>
        {canEdit && (
          <Link
            href="/upload?mode=build"
            className="text-sm font-medium text-primary hover:underline"
          >
            Or build all rooms from HK report →
          </Link>
        )}
      </div>
      <HotelMap
        rooms={rooms.map((r) => ({
          ...r,
          housekeeperName: r.housekeeper?.name ?? null,
        }))}
        floors={hotel?.floors ?? 3}
        canEdit={canEdit}
      />
    </div>
  );
}
