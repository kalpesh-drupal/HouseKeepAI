import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roomId, type, notes } = await req.json();
  if (!roomId || !type) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const room = await prisma.room.findFirst({
    where: { id: roomId, hotelId: session.user.hotelId },
  });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const request = await prisma.guestRequest.create({
    data: {
      roomId,
      hotelId: session.user.hotelId,
      type,
      notes: notes || null,
      status: "OPEN",
    },
  });

  return NextResponse.json({ success: true, request });
}
