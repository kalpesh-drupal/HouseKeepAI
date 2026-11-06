import { NextRequest, NextResponse } from "next/server";
import { MessageChannel, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DESK_ROLES: UserRole[] = [UserRole.FRONT_DESK, UserRole.GENERAL_MANAGER, UserRole.OWNER];

function roomNumberFromInput(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .replace(/^room\s+/i, "")
    .trim();
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!DESK_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const roomNumber = roomNumberFromInput(body.roomNumber);
  const message = String(body.message ?? "").trim();
  if (!roomNumber) return NextResponse.json({ error: "Enter a room number" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Enter a message" }, { status: 400 });
  if (message.length > 1000) {
    return NextResponse.json({ error: "Message is too long" }, { status: 400 });
  }

  const matches = await prisma.room.findMany({
    where: {
      hotelId: session.user.hotelId,
      number: { equals: roomNumber, mode: "insensitive" },
    },
    select: { id: true, number: true, housekeeperId: true },
  });
  const room = matches.find((item) => item.number === roomNumber) ?? matches[0];
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const existing = await prisma.message.findFirst({
    where: {
      hotelId: session.user.hotelId,
      roomId: room.id,
      channel: MessageChannel.FRONT_DESK_HOUSEKEEPING,
      content: message,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, roomId: true, content: true, createdAt: true },
  });
  if (existing) {
    return NextResponse.json({
      success: true,
      alreadySaved: true,
      note: {
        id: existing.id,
        roomId: existing.roomId,
        roomNumber: room.number,
        message: existing.content,
        createdAt: existing.createdAt,
      },
    });
  }

  const created = await prisma.message.create({
    data: {
      hotelId: session.user.hotelId,
      senderId: session.user.id,
      receiverId: room.housekeeperId,
      channel: MessageChannel.FRONT_DESK_HOUSEKEEPING,
      content: message,
      roomId: room.id,
    },
    select: { id: true, roomId: true, content: true, createdAt: true },
  });

  return NextResponse.json({
    success: true,
    note: {
      id: created.id,
      roomId: created.roomId,
      roomNumber: room.number,
      message: created.content,
      createdAt: created.createdAt,
    },
  });
}
