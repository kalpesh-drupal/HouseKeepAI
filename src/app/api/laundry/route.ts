import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemType, quantity, notes } = await req.json();
  if (!itemType || !quantity) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const batch = await prisma.laundryBatch.create({
    data: {
      hotelId: session.user.hotelId,
      itemType,
      quantity: Number(quantity),
      notes: notes || null,
      status: "DIRTY",
    },
  });

  return NextResponse.json({ success: true, batch });
}
