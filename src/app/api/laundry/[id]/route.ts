import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LaundryStatus } from "@prisma/client";

const FLOW: LaundryStatus[] = ["DIRTY", "WASHING", "DRYING", "READY", "DELIVERED"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { status, advance } = await req.json();

  const batch = await prisma.laundryBatch.findFirst({
    where: { id, hotelId: session.user.hotelId },
  });
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let nextStatus = status as LaundryStatus | undefined;
  if (advance) {
    const idx = FLOW.indexOf(batch.status);
    nextStatus = FLOW[Math.min(idx + 1, FLOW.length - 1)];
  }

  if (!nextStatus) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  await prisma.laundryBatch.update({
    where: { id },
    data: { status: nextStatus },
  });

  return NextResponse.json({ success: true });
}
