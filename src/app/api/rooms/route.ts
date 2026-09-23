import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canEditRoomInventory, createHotelRoom } from "@/lib/room-inventory";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditRoomInventory(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const number = String(body.number || "").trim();
  const type = body.type != null ? String(body.type) : undefined;
  const floor = body.floor != null ? Number(body.floor) : undefined;

  if (!number) {
    return NextResponse.json({ error: "Room number is required" }, { status: 400 });
  }

  try {
    const room = await createHotelRoom({
      hotelId: session.user.hotelId,
      number,
      type,
      floor: Number.isFinite(floor) ? floor : undefined,
    });
    return NextResponse.json({
      success: true,
      room: {
        id: room.id,
        number: room.number,
        floor: room.floor,
        type: room.type,
        status: room.status,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create room";
    const status = message.includes("already exists") || message.includes("Invalid") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
