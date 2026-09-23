import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { RoomStatus, CleaningStatus, UserRole } from "@prisma/client";
import { DEFAULT_CHECKLIST_ITEMS } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const hotelName = String(body.hotelName || "").trim();
  const ownerName = String(body.ownerName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const floors = Math.min(50, Math.max(1, Number(body.floors) || 3));
  const fallbackRooms = Math.min(40, Math.max(0, Number(body.roomsPerFloor) || 8));
  const importRoomsLater = Boolean(body.importRoomsLater);

  // Prefer per-floor counts; fall back to the same count on every floor
  let roomsByFloor: number[] = Array.isArray(body.roomsByFloor)
    ? body.roomsByFloor.map((n: unknown) => Math.min(40, Math.max(0, Number(n) || 0)))
    : [];

  if (importRoomsLater) {
    roomsByFloor = [];
  } else if (roomsByFloor.length === 0) {
    roomsByFloor = Array.from({ length: floors }, () => Math.max(1, fallbackRooms));
  } else if (roomsByFloor.length < floors) {
    while (roomsByFloor.length < floors) roomsByFloor.push(fallbackRooms);
  } else if (roomsByFloor.length > floors) {
    roomsByFloor = roomsByFloor.slice(0, floors);
  }

  const totalRooms = roomsByFloor.reduce((sum, n) => sum + n, 0);

  if (!hotelName || !ownerName || !email || password.length < 8) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  if (!importRoomsLater && totalRooms < 1) {
    return NextResponse.json({ error: "Add at least one room" }, { status: 400 });
  }

  const emailTaken = await prisma.user.findUnique({ where: { email } });
  if (emailTaken) {
    return NextResponse.json({ error: "Email already in use" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const hotel = await prisma.hotel.create({
    data: {
      name: hotelName,
      floors,
      users: {
        create: {
          email,
          name: ownerName,
          passwordHash,
          role: UserRole.OWNER,
        },
      },
    },
  });

  const rooms: Array<{
    number: string;
    floor: number;
    hotelId: string;
    status: RoomStatus;
    cleaningStatus: CleaningStatus;
    type: string;
  }> = [];

  for (let floor = 1; floor <= floors; floor++) {
    const count = roomsByFloor[floor - 1] ?? 0;
    for (let i = 1; i <= count; i++) {
      const number = `${floor}${String(i).padStart(2, "0")}`;
      rooms.push({
        number,
        floor,
        hotelId: hotel.id,
        status: RoomStatus.VACANT_CLEAN,
        cleaningStatus: CleaningStatus.COMPLETED,
        type: i <= 2 ? "Suite" : "Standard",
      });
    }
  }

  for (const roomData of rooms) {
    await prisma.room.create({
      data: {
        ...roomData,
        checklistItems: {
          create: DEFAULT_CHECKLIST_ITEMS.map((label, idx) => ({
            label,
            sortOrder: idx,
            completed: false,
          })),
        },
      },
    });
  }

  await prisma.pmsConnection.createMany({
    data: [
      {
        hotelId: hotel.id,
        provider: "SKYTOUCH",
        enabled: false,
        conflictPolicy: "PMS_RESERVATIONS_ONLY",
        syncIntervalMinutes: 15,
      },
      {
        hotelId: hotel.id,
        provider: "SYNXIS",
        enabled: false,
        conflictPolicy: "PMS_RESERVATIONS_ONLY",
        syncIntervalMinutes: 15,
      },
    ],
  });

  return NextResponse.json({
    success: true,
    hotelId: hotel.id,
    rooms: rooms.length,
    roomsByFloor,
    importRoomsLater,
    nextStep: importRoomsLater ? "/upload" : "/dashboard",
  });
}
