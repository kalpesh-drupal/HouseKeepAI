import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const endpoint = String(body.endpoint || "");
  const p256dh = String(body.keys?.p256dh || body.p256dh || "");
  const auth = String(body.keys?.auth || body.auth || "");

  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: session.user.id,
      endpoint,
      p256dh: p256dh || "n/a",
      auth: auth || "n/a",
    },
    update: {
      userId: session.user.id,
      p256dh: p256dh || "n/a",
      auth: auth || "n/a",
    },
  });

  return NextResponse.json({ success: true });
}
