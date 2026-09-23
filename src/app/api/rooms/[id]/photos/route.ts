import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const room = await prisma.room.findFirst({
    where: { id, hotelId: session.user.hotelId },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const photos = await prisma.roomPhoto.findMany({
    where: { roomId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ photos });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const room = await prisma.room.findFirst({
    where: { id, hotelId: session.user.hotelId },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const type = String(form.get("type") || "general");
  const caption = String(form.get("caption") || "");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "File required" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 400 });
  }

  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Max file size is 8MB" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
  const filename = `${room.number}-${type}-${Date.now()}-${randomUUID().slice(0, 8)}.${safeExt}`;
  const dir = path.join(process.cwd(), "public", "uploads", "rooms", room.id);
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  const url = `/uploads/rooms/${room.id}/${filename}`;
  const photo = await prisma.roomPhoto.create({
    data: {
      roomId: id,
      url,
      type,
      caption: caption || `${type} photo by ${session.user.name}`,
    },
  });

  return NextResponse.json({ success: true, photo });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { photoId } = await req.json();

  const photo = await prisma.roomPhoto.findFirst({
    where: { id: photoId, roomId: id, room: { hotelId: session.user.hotelId } },
  });
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.roomPhoto.delete({ where: { id: photoId } });
  return NextResponse.json({ success: true });
}
