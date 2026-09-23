import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const LINEN_TYPES = ["Sheets", "Towels", "Pillow Cases", "Bath Mats", "Blankets", "Robes"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const room = await prisma.room.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: { id: true, number: true, frontDeskNotes: true },
  });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "amenities" ? "amenities" : "linen";
  const items = Array.isArray(body.items) ? body.items : [];

  const picked: string[] = [];

  if (kind === "linen") {
    for (const row of items) {
      const itemType = String(row.itemType || "").trim();
      const quantity = Math.max(0, Math.floor(Number(row.quantity) || 0));
      if (!itemType || quantity < 1) continue;
      if (!LINEN_TYPES.includes(itemType) && itemType.length > 40) continue;
      await prisma.laundryBatch.create({
        data: {
          hotelId: session.user.hotelId,
          itemType,
          quantity,
          status: "DIRTY",
          notes: `Picked up from room ${room.number} by ${session.user.name}`,
        },
      });
      picked.push(`${quantity} ${itemType}`);
    }
  } else {
    for (const row of items) {
      const quantity = Math.max(0, Math.floor(Number(row.quantity) || 0));
      if (quantity < 1) continue;
      const category = String(row.category || "").trim();
      const item = row.itemId
        ? await prisma.inventoryItem.findFirst({
            where: { id: String(row.itemId), hotelId: session.user.hotelId },
          })
        : category
          ? await prisma.inventoryItem.findFirst({
              where: { hotelId: session.user.hotelId, category },
            })
          : null;
      if (!item) {
        if (!category && !row.itemId) continue;
        picked.push(`${quantity} ${category || "item"}`);
        continue;
      }
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: Math.max(0, item.quantity - quantity) },
      });
      picked.push(`${quantity} ${item.category}`);
    }
  }

  if (picked.length === 0) {
    return NextResponse.json({ error: "Add at least one item with a quantity" }, { status: 400 });
  }

  const label = kind === "linen" ? "Linen pickup" : "Amenities used";
  const note = `${label}: ${picked.join(", ")}`;
  await prisma.room.update({
    where: { id: room.id },
    data: {
      frontDeskNotes: [room.frontDeskNotes, note].filter(Boolean).join("\n"),
      manualLock: true,
    },
  });

  return NextResponse.json({ success: true, picked, note });
}
