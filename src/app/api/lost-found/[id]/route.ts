import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const item = await prisma.lostFoundItem.findFirst({
    where: { id, hotelId: session.user.hotelId },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.lostFoundItem.update({
    where: { id },
    data: {
      ...(body.status ? { status: body.status } : {}),
      ...(body.storageBin != null ? { storageBin: body.storageBin } : {}),
      ...(body.guestName != null ? { guestName: body.guestName } : {}),
    },
  });

  return NextResponse.json({ success: true });
}
