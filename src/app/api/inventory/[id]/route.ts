import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const item = await prisma.inventoryItem.findFirst({
    where: { id, hotelId: session.user.hotelId },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const quantity = typeof body.quantity === "number" ? Math.max(0, body.quantity) : item.quantity;
  const delta = typeof body.delta === "number" ? body.delta : 0;

  await prisma.inventoryItem.update({
    where: { id },
    data: {
      quantity: typeof body.quantity === "number" ? quantity : Math.max(0, item.quantity + delta),
      ...(body.reorderThreshold != null ? { reorderThreshold: body.reorderThreshold } : {}),
      ...(body.criticalThreshold != null ? { criticalThreshold: body.criticalThreshold } : {}),
    },
  });

  return NextResponse.json({ success: true });
}
