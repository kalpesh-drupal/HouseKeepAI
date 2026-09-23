import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildAiInsights } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { canAssignHousekeepers } from "@/lib/utils";

/** Apply AI staff assignment suggestions to unassigned priority rooms. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAssignHousekeepers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const insights = await buildAiInsights(session.user.hotelId);
  const housekeepers = await prisma.user.findMany({
    where: { hotelId: session.user.hotelId, role: "HOUSEKEEPER", active: true },
  });

  let assigned = 0;
  for (const suggestion of insights.staffSuggestions) {
    const hk = housekeepers.find((h) => h.name === suggestion.housekeeper);
    if (!hk) continue;
    for (const roomNumber of suggestion.rooms) {
      const room = await prisma.room.findFirst({
        where: { hotelId: session.user.hotelId, number: roomNumber, housekeeperId: null },
      });
      if (room) {
        await prisma.room.update({
          where: { id: room.id },
          data: { housekeeperId: hk.id },
        });
        assigned += 1;
      }
    }
  }

  return NextResponse.json({ success: true, assigned });
}
