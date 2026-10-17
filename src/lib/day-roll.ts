import { CleaningOutcome, RoomStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { businessDate, businessDateKey, isBeforeBusinessDate } from "@/lib/business-day";

export async function rollHotelDay(hotelId: string, now = new Date()) {
  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    select: { id: true, timezone: true, businessDate: true },
  });
  if (!hotel) return { rolled: false as const };

  const current = businessDate(now, hotel.timezone);
  if (!hotel.businessDate) {
    await prisma.hotel.update({
      where: { id: hotelId },
      data: { businessDate: current },
    });
    return { rolled: false as const, opened: true, businessDate: businessDateKey(current) };
  }

  if (!isBeforeBusinessDate(hotel.businessDate, current)) {
    return { rolled: false as const, businessDate: businessDateKey(current) };
  }

  const closing = hotel.businessDate;
  const rooms = await prisma.room.findMany({
    where: { hotelId },
    include: { housekeeper: { select: { name: true } } },
  });

  for (const room of rooms) {
    await prisma.roomDaySnapshot.upsert({
      where: { roomId_businessDate: { roomId: room.id, businessDate: closing } },
      create: {
        hotelId,
        roomId: room.id,
        roomNumber: room.number,
        businessDate: closing,
        status: room.status,
        guestStatus: room.guestStatus,
        cleaningStatus: room.cleaningStatus,
        housekeeperId: room.housekeeperId,
        housekeeperName: room.housekeeper?.name ?? null,
        doNotDisturb: room.doNotDisturb,
        isRush: room.isRush,
        isVip: room.isVip,
        arrivalDate: room.arrivalDate,
        departureDate: room.departureDate,
        frontDeskNotes: room.frontDeskNotes,
      },
      update: {
        roomNumber: room.number,
        status: room.status,
        guestStatus: room.guestStatus,
        cleaningStatus: room.cleaningStatus,
        housekeeperId: room.housekeeperId,
        housekeeperName: room.housekeeper?.name ?? null,
        doNotDisturb: room.doNotDisturb,
        isRush: room.isRush,
        isVip: room.isVip,
        arrivalDate: room.arrivalDate,
        departureDate: room.departureDate,
        frontDeskNotes: room.frontDeskNotes,
      },
    });
  }

  const openSessions = await prisma.cleaningSession.findMany({
    where: { hotelId, finishedAt: null, businessDate: { lt: current } },
  });
  const stillCleaning = new Set(
    rooms.filter((room) => room.status === RoomStatus.CLEANING).map((room) => room.id)
  );

  for (const session of openSessions) {
    const durationSeconds = Math.max(0, Math.round((now.getTime() - session.startedAt.getTime()) / 1000));
    const closed = await prisma.cleaningSession.updateMany({
      where: { id: session.id, finishedAt: null },
      data: { finishedAt: now, durationSeconds, outcome: CleaningOutcome.UNFINISHED },
    });
    if (closed.count !== 1 || !stillCleaning.has(session.roomId)) continue;
    const room = rooms.find((item) => item.id === session.roomId);
    if (!room) continue;
    await prisma.cleaningSession.create({
      data: {
        hotelId,
        roomId: room.id,
        roomNumber: room.number,
        housekeeperId: room.housekeeperId,
        housekeeperName: room.housekeeper?.name ?? session.housekeeperName,
        businessDate: current,
        startedAt: now,
      },
    });
    await prisma.room.update({
      where: { id: room.id },
      data: { cleaningStartedAt: now },
    });
  }

  await prisma.hotel.update({
    where: { id: hotelId },
    data: { businessDate: current },
  });

  return {
    rolled: true as const,
    closed: businessDateKey(closing),
    businessDate: businessDateKey(current),
    rooms: rooms.length,
  };
}

export async function rollAllHotels(now = new Date()) {
  const hotels = await prisma.hotel.findMany({ select: { id: true } });
  const results = [];
  for (const hotel of hotels) {
    results.push({ hotelId: hotel.id, ...(await rollHotelDay(hotel.id, now)) });
  }
  return results;
}
