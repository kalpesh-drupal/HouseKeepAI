import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const hotelCount = await prisma.hotel.count();
    return NextResponse.json({
      ok: true,
      status: "healthy",
      database: "up",
      hotels: hotelCount,
      uptimeHintMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        status: "unhealthy",
        database: "down",
        error: err instanceof Error ? err.message : "db error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
