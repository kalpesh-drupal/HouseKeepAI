import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";

const MANAGER_ROLES = ["OWNER", "GENERAL_MANAGER"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const user = await prisma.user.findFirst({
    where: { id, hotelId: session.user.hotelId },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: {
    name?: string;
    role?: UserRole;
    active?: boolean;
    passwordHash?: string;
  } = {};

  if (body.name) data.name = String(body.name).trim();
  if (body.role && Object.values(UserRole).includes(body.role)) data.role = body.role;
  if (typeof body.active === "boolean") data.active = body.active;
  if (body.password) {
    const password = String(body.password);
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  return NextResponse.json({ success: true, user: updated });
}
