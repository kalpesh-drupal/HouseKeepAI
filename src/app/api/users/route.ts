import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";

const MANAGER_ROLES = ["OWNER", "GENERAL_MANAGER"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { hotelId: session.user.hotelId },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const role = body.role as UserRole;
  const password = String(body.password || "password123");

  if (!name || !email || !role) {
    return NextResponse.json({ error: "Name, email, and role required" }, { status: 400 });
  }

  if (!Object.values(UserRole).includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "Email already in use" }, { status: 400 });

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role,
      hotelId: session.user.hotelId,
      passwordHash: await bcrypt.hash(password, 10),
      active: true,
    },
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  return NextResponse.json({ success: true, user });
}
