import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PmsProvider } from "@prisma/client";
import { runPmsSync } from "@/lib/pms/sync";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [connections, logs] = await Promise.all([
    prisma.pmsConnection.findMany({ where: { hotelId: session.user.hotelId } }),
    prisma.pmsSyncLog.findMany({
      where: { hotelId: session.user.hotelId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({ connections, logs });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["OWNER", "GENERAL_MANAGER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const provider = body.provider as PmsProvider;
  const validProviders: PmsProvider[] = [
    "SKYTOUCH",
    "SYNXIS",
    "OPERA",
    "CLOUDBEDS",
    "MEWS",
    "STAYNTOUCH",
    "AUTOCLERK",
    "LITTLE_HOTELIER",
  ];
  if (!validProviders.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  if (body.action === "save") {
    const connection = await prisma.pmsConnection.upsert({
      where: { hotelId_provider: { hotelId: session.user.hotelId, provider } },
      create: {
        hotelId: session.user.hotelId,
        provider,
        propertyId: body.propertyId || null,
        apiKey: body.apiKey || null,
        apiSecret: body.apiSecret || null,
        baseUrl: body.baseUrl || null,
        enabled: Boolean(body.enabled),
        syncIntervalMinutes: Number(body.syncIntervalMinutes) || 15,
        conflictPolicy: body.conflictPolicy || "PMS_RESERVATIONS_ONLY",
      },
      update: {
        propertyId: body.propertyId || null,
        apiKey: body.apiKey || null,
        apiSecret: body.apiSecret || null,
        baseUrl: body.baseUrl || null,
        enabled: Boolean(body.enabled),
        syncIntervalMinutes: Number(body.syncIntervalMinutes) || 15,
        conflictPolicy: body.conflictPolicy || "PMS_RESERVATIONS_ONLY",
      },
    });
    return NextResponse.json({ success: true, connection });
  }

  if (body.action === "sync") {
    const connection = await prisma.pmsConnection.findUnique({
      where: { hotelId_provider: { hotelId: session.user.hotelId, provider } },
    });
    if (!connection) {
      // auto-create enabled demo connection
      await prisma.pmsConnection.create({
        data: {
          hotelId: session.user.hotelId,
          provider,
          enabled: true,
          propertyId: "DEMO-PROPERTY",
        },
      });
    } else if (!connection.enabled) {
      await prisma.pmsConnection.update({
        where: { id: connection.id },
        data: { enabled: true },
      });
    }

    try {
      const result = await runPmsSync(session.user.hotelId, provider);
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      await prisma.pmsSyncLog.create({
        data: {
          hotelId: session.user.hotelId,
          provider,
          action: "FULL_SYNC",
          status: "FAILED",
          message: err instanceof Error ? err.message : "Sync failed",
        },
      });
      return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
