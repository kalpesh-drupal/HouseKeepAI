import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CleaningStatus, RoomStatus } from "@prisma/client";
import {
  canEditRoomInventory,
  deleteHotelRoom,
  resetRoomChecklist,
  updateHotelRoomInventory,
} from "@/lib/room-inventory";
import { canAssignHousekeepers } from "@/lib/utils";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditRoomInventory(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const room = await deleteHotelRoom(session.user.hotelId, id);
    return NextResponse.json({ success: true, removed: room.number });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not delete room";
    const status = message === "Room not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { action, targetRoomId, notes, guestNotes, frontDeskNotes, number, type, floor, housekeeperId, extraMinutes, reason } = body;

  // Inventory edit: room number / type / floor (hotel map source of truth)
  if (action === "update_inventory") {
    if (!canEditRoomInventory(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    try {
      const room = await updateHotelRoomInventory({
        hotelId: session.user.hotelId,
        roomId: id,
        number: number != null ? String(number) : undefined,
        type: type != null ? String(type) : undefined,
        floor: floor != null ? Number(floor) : undefined,
      });
      return NextResponse.json({
        success: true,
        room: { id: room.id, number: room.number, floor: room.floor, type: room.type },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not update room";
      const status =
        message === "Room not found"
          ? 404
          : message.includes("already exists") || message.includes("Invalid")
            ? 400
            : 500;
      return NextResponse.json({ error: message }, { status });
    }
  }

  const room = await prisma.room.findFirst({
    where: { id, hotelId: session.user.hotelId },
  });

  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  switch (action) {
    case "start_cleaning":
      await prisma.room.update({
        where: { id },
        data: {
          status: RoomStatus.CLEANING,
          cleaningStatus: CleaningStatus.IN_PROGRESS,
          manualLock: true,
          cleaningStartedAt: new Date(),
          housekeeperId: session.user.role === "HOUSEKEEPER" ? session.user.id : room.housekeeperId,
        },
      });
      await resetRoomChecklist(id);
      break;

    case "finish_cleaning":
      await prisma.room.update({
        where: { id },
        data: {
          status: RoomStatus.VACANT_CLEAN,
          cleaningStatus: CleaningStatus.NEEDS_INSPECTION,
          manualLock: true,
          cleaningStartedAt: null,
        },
      });
      await prisma.inspection.create({
        data: {
          roomId: id,
          inspectorId: room.inspectorId ?? session.user.id,
          status: "PENDING",
          items: {
            create: [
              "Bathroom", "Bed", "Hair", "Dust", "Coffee", "Amenities",
              "Remote", "TV", "AC", "Curtains", "Windows", "Mirror", "Furniture",
            ].map((label, i) => ({ label, sortOrder: i })),
          },
        },
      });
      {
        const items = await prisma.inventoryItem.findMany({
          where: { hotelId: session.user.hotelId, usagePerClean: { gt: 0 } },
        });
        for (const item of items) {
          await prisma.inventoryItem.update({
            where: { id: item.id },
            data: { quantity: Math.max(0, item.quantity - item.usagePerClean) },
          });
        }
      }
      break;

    case "request_inspection":
      await prisma.room.update({
        where: { id },
        data: { cleaningStatus: CleaningStatus.NEEDS_INSPECTION },
      });
      break;

    case "report_issue":
      await prisma.maintenanceTicket.create({
        data: {
          roomId: id,
          hotelId: session.user.hotelId,
          title: notes || "Issue reported",
          description: `Reported by ${session.user.name}${notes ? `: ${notes}` : ""}`,
          priority: "MEDIUM",
          status: "OPEN",
        },
      });
      await prisma.room.update({
        where: { id },
        data: { status: RoomStatus.MAINTENANCE },
      });
      break;

    case "block_ooo":
      await prisma.room.update({
        where: { id },
        data: { status: RoomStatus.OUT_OF_ORDER, manualLock: true },
      });
      break;

    case "block_room":
      await prisma.room.update({
        where: { id },
        data: {
          status: RoomStatus.OUT_OF_ORDER,
          manualLock: true,
          frontDeskNotes: notes || room.frontDeskNotes || "Blocked by front desk",
        },
      });
      break;

    case "mark_rush":
      await prisma.room.update({
        where: { id },
        data: { isRush: true, priority: Math.max(room.priority, 10) },
      });
      break;

    case "mark_vip":
      await prisma.room.update({
        where: { id },
        data: { isVip: !room.isVip },
      });
      break;

    case "clear_rush":
      await prisma.room.update({
        where: { id },
        data: { isRush: false },
      });
      break;

    case "move_room": {
      if (!targetRoomId) return NextResponse.json({ error: "targetRoomId required" }, { status: 400 });
      const target = await prisma.room.findFirst({
        where: { id: targetRoomId, hotelId: session.user.hotelId },
      });
      if (!target) return NextResponse.json({ error: "Target room not found" }, { status: 404 });

      await prisma.room.update({
        where: { id: target.id },
        data: {
          guestName: room.guestName,
          arrivalDate: room.arrivalDate,
          departureDate: room.departureDate,
          isVip: room.isVip,
          guestNotes: room.guestNotes,
          frontDeskNotes: `Moved from room ${room.number}. ${room.frontDeskNotes || ""}`.trim(),
          status: RoomStatus.OCCUPIED,
          manualLock: true,
        },
      });
      await prisma.room.update({
        where: { id },
        data: {
          guestName: null,
          arrivalDate: null,
          departureDate: null,
          isVip: false,
          isRush: false,
          guestNotes: null,
          frontDeskNotes: `Guest moved to room ${target.number}`,
          status: RoomStatus.VACANT_DIRTY,
          cleaningStatus: CleaningStatus.NOT_STARTED,
          manualLock: true,
        },
      });
      await resetRoomChecklist(id);
      break;
    }

    case "update_notes":
      await prisma.room.update({
        where: { id },
        data: {
          ...(guestNotes !== undefined ? { guestNotes } : {}),
          ...(frontDeskNotes !== undefined ? { frontDeskNotes } : {}),
          manualLock: true,
        },
      });
      break;

    case "report_delay": {
      const extra = Math.max(5, Math.min(180, Number(extraMinutes) || 15));
      const why = String(reason || notes || "Taking longer than normal").trim();
      const delayNote = `Taking longer (+${extra} min): ${why}`;
      await prisma.room.update({
        where: { id },
        data: {
          estimatedMinutes: room.estimatedMinutes + extra,
          priority: Math.max(room.priority, 8),
          frontDeskNotes: [room.frontDeskNotes, delayNote].filter(Boolean).join("\n"),
          manualLock: true,
        },
      });
      await prisma.guestRequest.create({
        data: {
          roomId: id,
          hotelId: session.user.hotelId,
          type: "Cleaning delay",
          notes: `${delayNote} — reported by ${session.user.name}`,
          status: "OPEN",
        },
      });
      return NextResponse.json({ success: true, extraMinutes: extra });
    }

    case "assign_housekeeper": {
      if (!canAssignHousekeepers(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const nextId =
        housekeeperId == null || housekeeperId === "" ? null : String(housekeeperId);
      if (nextId) {
        const hk = await prisma.user.findFirst({
          where: {
            id: nextId,
            hotelId: session.user.hotelId,
            role: "HOUSEKEEPER",
            active: true,
          },
          select: { id: true, name: true },
        });
        if (!hk) {
          return NextResponse.json({ error: "Housekeeper not found" }, { status: 400 });
        }
      }
      const updated = await prisma.room.update({
        where: { id },
        data: { housekeeperId: nextId },
        include: { housekeeper: { select: { id: true, name: true } } },
      });
      return NextResponse.json({
        success: true,
        room: {
          id: updated.id,
          housekeeperId: updated.housekeeperId,
          housekeeperName: updated.housekeeper?.name ?? null,
        },
      });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
