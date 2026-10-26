import { CleaningStatus, RoomStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INSPECTION_CHECKLIST_ITEMS } from "@/lib/utils";
import { resetRoomChecklist } from "@/lib/room-inventory";
import { finishCleaningSession } from "@/lib/cleaning-log";
import { enqueueSkyTouchBoardWrite, schedulePortalWriteProcessing } from "@/lib/pms/portal-write";

type RoomWork = {
  id: string;
  hotelId: string;
  number: string;
  status: RoomStatus;
  cleaningStatus: CleaningStatus;
  housekeeperId: string | null;
  inspectorId: string | null;
  cleaningStartedAt: Date | null;
};

function finishedCleaning(room: RoomWork) {
  return (
    room.status === RoomStatus.CLEANING ||
    room.status === RoomStatus.VACANT_DIRTY ||
    room.cleaningStatus === CleaningStatus.IN_PROGRESS ||
    room.cleaningStatus === CleaningStatus.NOT_STARTED ||
    room.cleaningStatus === CleaningStatus.INSPECTION_FAILED
  );
}

export function isAwaitingInspection(room: { status: RoomStatus; cleaningStatus: CleaningStatus }) {
  return room.status === RoomStatus.READY_TO_INSPECT || room.cleaningStatus === CleaningStatus.NEEDS_INSPECTION;
}

async function consumeSupplies(hotelId: string) {
  const items = await prisma.inventoryItem.findMany({
    where: { hotelId, usagePerClean: { gt: 0 } },
  });
  for (const item of items) {
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { quantity: Math.max(0, item.quantity - item.usagePerClean) },
    });
  }
}

async function closePendingInspections(roomId: string, status: "APPROVED" | "REJECTED") {
  await prisma.inspection.updateMany({
    where: { roomId, status: "PENDING" },
    data: status === "APPROVED" ? { status, score: 100 } : { status },
  });
}

async function inspectorFor(room: RoomWork, actorId: string) {
  if (room.inspectorId) return room.inspectorId;
  const head = await prisma.user.findFirst({
    where: { hotelId: room.hotelId, role: UserRole.EXECUTIVE_HOUSEKEEPER, active: true },
    select: { id: true },
  });
  return head?.id ?? actorId;
}

function claimHousekeeper(room: RoomWork, actorId: string, actorIsStaff: boolean) {
  if (!actorIsStaff) return room.housekeeperId;
  if (!room.housekeeperId || room.housekeeperId === actorId) return actorId;
  return room.housekeeperId;
}

export async function markRoomClean(room: RoomWork, actorId: string, actorIsStaff: boolean) {
  const claimingFinish = actorIsStaff && !isAwaitingInspection(room);
  if (claimingFinish) {
    await consumeSupplies(room.hotelId);
  }
  await finishCleaningSession({
    hotelId: room.hotelId,
    roomId: room.id,
    roomNumber: room.number,
    housekeeperId: claimHousekeeper(room, actorId, actorIsStaff),
    cleaningStartedAt: room.cleaningStartedAt,
    outcome: "CLEAN",
  });
  await closePendingInspections(room.id, "APPROVED");
  await prisma.room.update({
    where: { id: room.id },
    data: {
      status: RoomStatus.VACANT_CLEAN,
      cleaningStatus: CleaningStatus.COMPLETED,
      manualLock: true,
      cleaningStartedAt: null,
      housekeeperId: claimingFinish ? claimHousekeeper(room, actorId, actorIsStaff) : room.housekeeperId,
    },
  });
  // Only Mark Clean writes to SkyTouch (Ready). Ready-to-inspect stays in HouseKeepAI for the head HK.
  await enqueueSkyTouchBoardWrite({
    hotelId: room.hotelId,
    roomId: room.id,
    roomNumber: room.number,
    kind: "clean",
  });
  schedulePortalWriteProcessing(room.hotelId);
}

export async function markRoomReadyToInspect(room: RoomWork, actorId: string, actorIsStaff: boolean) {
  if (finishedCleaning(room)) {
    await consumeSupplies(room.hotelId);
  }
  await finishCleaningSession({
    hotelId: room.hotelId,
    roomId: room.id,
    roomNumber: room.number,
    housekeeperId: claimHousekeeper(room, actorId, actorIsStaff),
    cleaningStartedAt: room.cleaningStartedAt,
    outcome: "READY_TO_INSPECT",
  });
  const inspectorId = await inspectorFor(room, actorId);
  const pending = await prisma.inspection.findFirst({
    where: { roomId: room.id, status: "PENDING" },
    select: { id: true },
  });
  if (!pending) {
    await prisma.inspection.create({
      data: {
        roomId: room.id,
        inspectorId,
        status: "PENDING",
        items: {
          create: INSPECTION_CHECKLIST_ITEMS.map((label, i) => ({ label, sortOrder: i })),
        },
      },
    });
  }
  await prisma.room.update({
    where: { id: room.id },
    data: {
      status: RoomStatus.READY_TO_INSPECT,
      cleaningStatus: CleaningStatus.NEEDS_INSPECTION,
      manualLock: true,
      cleaningStartedAt: null,
      inspectorId,
      housekeeperId: claimHousekeeper(room, actorId, actorIsStaff),
    },
  });
  // Ready to inspect is HouseKeepAI-only (for head housekeeper inspection). No SkyTouch write.
}

export async function sendRoomBackDirty(room: RoomWork) {
  await closePendingInspections(room.id, "REJECTED");
  await prisma.room.update({
    where: { id: room.id },
    data: {
      status: RoomStatus.VACANT_DIRTY,
      cleaningStatus: CleaningStatus.INSPECTION_FAILED,
      manualLock: true,
      cleaningStartedAt: null,
    },
  });
  await resetRoomChecklist(room.id);
  // Send-back stays in HouseKeepAI only — SkyTouch updates only on Mark Clean.
}

/** Front desk / managers: set room dirty for housekeeping (HouseKeepAI only — no SkyTouch write). */
export async function markRoomDirty(room: RoomWork) {
  await closePendingInspections(room.id, "REJECTED");
  await prisma.room.update({
    where: { id: room.id },
    data: {
      status: RoomStatus.VACANT_DIRTY,
      cleaningStatus: CleaningStatus.NOT_STARTED,
      manualLock: true,
      cleaningStartedAt: null,
    },
  });
  await resetRoomChecklist(room.id);
}
