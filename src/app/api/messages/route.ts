import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { content, receiverId, channel, roomId } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });

  const message = await prisma.message.create({
    data: {
      hotelId: session.user.hotelId,
      senderId: session.user.id,
      receiverId: receiverId || null,
      channel: channel || "GENERAL",
      content: content.trim(),
      roomId: roomId || null,
    },
  });

  return NextResponse.json({ success: true, message });
}
