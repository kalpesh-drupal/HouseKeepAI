import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetRoomChecklist } from "@/lib/room-inventory";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { action, itemId, notes } = await req.json();

  const inspection = await prisma.inspection.findFirst({
    where: { id, room: { hotelId: session.user.hotelId } },
    include: { room: true },
  });

  if (!inspection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "toggle_item" && itemId) {
    const item = await prisma.inspectionItem.findUnique({ where: { id: itemId } });
    if (item) {
      await prisma.inspectionItem.update({
        where: { id: itemId },
        data: { passed: !item.passed },
      });
    }
    return NextResponse.json({ success: true });
  }

  if (action === "approve") {
    await prisma.inspection.update({
      where: { id },
      data: { status: "APPROVED", score: 100, notes },
    });
    await prisma.room.update({
      where: { id: inspection.roomId },
      data: { status: "INSPECTED", cleaningStatus: "COMPLETED" },
    });
  }

  if (action === "reject") {
    await prisma.inspection.update({
      where: { id },
      data: { status: "REJECTED", notes },
    });
    await prisma.room.update({
      where: { id: inspection.roomId },
      data: { status: "VACANT_DIRTY", cleaningStatus: "INSPECTION_FAILED" },
    });
    await resetRoomChecklist(inspection.roomId);
  }

  return NextResponse.json({ success: true });
}
