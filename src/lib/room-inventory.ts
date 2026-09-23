import { CleaningStatus, RoomStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CHECKLIST_ITEMS } from "@/lib/utils";
import { inferFloorFromRoomNumber } from "@/lib/hk-upload";

/** Roles that can add/remove/edit room inventory on the hotel map. */
export const ROOM_INVENTORY_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.GENERAL_MANAGER,
  UserRole.EXECUTIVE_HOUSEKEEPER,
];

export function canEditRoomInventory(role: UserRole) {
  return ROOM_INVENTORY_ROLES.includes(role);
}

export function normalizeInventoryRoomType(raw?: string) {
  const t = (raw || "").trim();
  if (!t) return "Standard";
  return t.replace(/\s+/g, " ");
}

export function looksLikeInventoryRoomNumber(value: string) {
  const v = value.trim().replace(/^#\s*/, "").replace(/^room\s+/i, "").trim();
  if (!v || v.length > 12) return false;
  return /^(?:[A-Za-z]-?)?\d{2,4}[A-Za-z]?$/.test(v);
}

/** Keep Hotel.floors in sync with the highest room floor for this property. */
export async function syncHotelFloors(hotelId: string) {
  const agg = await prisma.room.aggregate({
    where: { hotelId },
    _max: { floor: true },
  });
  const floors = Math.max(agg._max.floor ?? 1, 1);
  await prisma.hotel.update({
    where: { id: hotelId },
    data: { floors },
  });
  return floors;
}

export async function createHotelRoom(input: {
  hotelId: string;
  number: string;
  type?: string;
  floor?: number;
}) {
  const number = input.number.trim().replace(/^#\s*/, "").replace(/^room\s+/i, "").trim();
  if (!looksLikeInventoryRoomNumber(number)) {
    throw new Error("Invalid room number");
  }

  const existing = await prisma.room.findFirst({
    where: { hotelId: input.hotelId, number },
  });
  if (existing) {
    throw new Error(`Room ${number} already exists`);
  }

  const floor = inferFloorFromRoomNumber(number, input.floor);
  const type = normalizeInventoryRoomType(input.type);

  const room = await prisma.room.create({
    data: {
      hotelId: input.hotelId,
      number,
      floor,
      type,
      status: RoomStatus.VACANT_CLEAN,
      cleaningStatus: CleaningStatus.COMPLETED,
      manualLock: true,
      checklistItems: {
        create: DEFAULT_CHECKLIST_ITEMS.map((label, idx) => ({
          label,
          sortOrder: idx,
          completed: false,
        })),
      },
    },
  });

  await syncHotelFloors(input.hotelId);
  return room;
}

export async function updateHotelRoomInventory(input: {
  hotelId: string;
  roomId: string;
  number?: string;
  type?: string;
  floor?: number;
}) {
  const room = await prisma.room.findFirst({
    where: { id: input.roomId, hotelId: input.hotelId },
  });
  if (!room) throw new Error("Room not found");

  const data: { number?: string; type?: string; floor?: number } = {};

  if (input.number !== undefined) {
    const number = input.number.trim().replace(/^#\s*/, "").replace(/^room\s+/i, "").trim();
    if (!looksLikeInventoryRoomNumber(number)) throw new Error("Invalid room number");
    if (number !== room.number) {
      const clash = await prisma.room.findFirst({
        where: { hotelId: input.hotelId, number, NOT: { id: room.id } },
      });
      if (clash) throw new Error(`Room ${number} already exists`);
      data.number = number;
      if (input.floor === undefined) {
        data.floor = inferFloorFromRoomNumber(number);
      }
    }
  }

  if (input.type !== undefined) {
    data.type = normalizeInventoryRoomType(input.type);
  }

  if (input.floor !== undefined && Number.isFinite(input.floor) && input.floor > 0) {
    data.floor = Math.floor(input.floor);
  }

  const updated = await prisma.room.update({
    where: { id: room.id },
    data,
  });

  await syncHotelFloors(input.hotelId);
  return updated;
}

export async function deleteHotelRoom(hotelId: string, roomId: string) {
  const room = await prisma.room.findFirst({
    where: { id: roomId, hotelId },
    select: { id: true, number: true },
  });
  if (!room) throw new Error("Room not found");

  await prisma.room.delete({ where: { id: room.id } });
  await syncHotelFloors(hotelId);
  return room;
}

/** Clear checklist so Complete only highlights after the housekeeper taps it. */
export async function resetRoomChecklist(roomId: string) {
  await prisma.checklistItem.updateMany({
    where: { roomId },
    data: { completed: false, needsAttention: false },
  });
}
