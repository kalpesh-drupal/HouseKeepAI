import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { field } = await req.json();

  const item = await prisma.checklistItem.findFirst({
    where: { id, room: { hotelId: session.user.hotelId } },
  });

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (field === "completed") {
    await prisma.checklistItem.update({
      where: { id },
      data: { completed: !item.completed, needsAttention: false },
    });
  } else {
    await prisma.checklistItem.update({
      where: { id },
      data: { needsAttention: !item.needsAttention, completed: false },
    });
  }

  return NextResponse.json({ success: true });
}
