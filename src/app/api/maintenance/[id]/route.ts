import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetRoomChecklist } from "@/lib/room-inventory";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { status } = await req.json();

  const ticket = await prisma.maintenanceTicket.findFirst({
    where: { id, hotelId: session.user.hotelId },
  });

  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.maintenanceTicket.update({
    where: { id },
    data: {
      status,
      assignedToId: status === "ASSIGNED" && session.user.role === "MAINTENANCE" ? session.user.id : ticket.assignedToId,
    },
  });

  if (status === "COMPLETED") {
    await prisma.room.update({
      where: { id: ticket.roomId },
      data: { status: "VACANT_DIRTY" },
    });
    await resetRoomChecklist(ticket.roomId);
  }

  return NextResponse.json({ success: true });
}
