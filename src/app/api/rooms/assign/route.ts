import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAssignHousekeepers } from "@/lib/utils";

/** Bulk assign (or unassign) rooms to a housekeeper. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAssignHousekeepers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const roomIds = Array.isArray(body.roomIds) ? body.roomIds.map(String) : [];
  const housekeeperId =
    body.housekeeperId == null || body.housekeeperId === "" ? null : String(body.housekeeperId);

  if (roomIds.length === 0) {
    return NextResponse.json({ error: "Select at least one room" }, { status: 400 });
  }

  if (housekeeperId) {
    const hk = await prisma.user.findFirst({
      where: {
        id: housekeeperId,
        hotelId: session.user.hotelId,
        role: "HOUSEKEEPER",
        active: true,
      },
      select: { id: true },
    });
    if (!hk) {
      return NextResponse.json({ error: "Housekeeper not found" }, { status: 400 });
    }
  }

  const result = await prisma.room.updateMany({
    where: { id: { in: roomIds }, hotelId: session.user.hotelId },
    data: { housekeeperId },
  });

  return NextResponse.json({ success: true, assigned: result.count });
}
