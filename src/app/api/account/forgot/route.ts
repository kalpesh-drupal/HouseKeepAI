import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const message =
    "If that email is a staff login, your owner or general manager can set a new password from Add Staff.";

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.active) {
    const pending = await prisma.passwordResetRequest.findFirst({
      where: { userId: user.id, resolvedAt: null },
    });
    if (!pending) {
      await prisma.passwordResetRequest.create({
        data: { userId: user.id, hotelId: user.hotelId },
      });
    }
  }

  return NextResponse.json({ success: true, message });
}
