import { CleaningOutcome } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { businessDate } from "@/lib/business-day";

async function hotelZone(hotelId: string) {
  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    select: { timezone: true },
  });
  return hotel?.timezone;
}

async function housekeeperName(housekeeperId: string | null | undefined) {
  if (!housekeeperId) return null;
  const user = await prisma.user.findUnique({
    where: { id: housekeeperId },
    select: { name: true },
  });
  return user?.name ?? null;
}

export async function beginCleaningSession(input: {
  hotelId: string;
  roomId: string;
  roomNumber: string;
  housekeeperId: string | null;
  startedAt?: Date;
}) {
  const startedAt = input.startedAt ?? new Date();
  const zone = await hotelZone(input.hotelId);
  const open = await prisma.cleaningSession.findMany({
    where: { roomId: input.roomId, finishedAt: null },
  });
  for (const session of open) {
    const durationSeconds = Math.max(0, Math.round((startedAt.getTime() - session.startedAt.getTime()) / 1000));
    await prisma.cleaningSession.updateMany({
      where: { id: session.id, finishedAt: null },
      data: { finishedAt: startedAt, durationSeconds, outcome: CleaningOutcome.RESTARTED },
    });
  }

  await prisma.cleaningSession.create({
    data: {
      hotelId: input.hotelId,
      roomId: input.roomId,
      roomNumber: input.roomNumber,
      housekeeperId: input.housekeeperId,
      housekeeperName: await housekeeperName(input.housekeeperId),
      businessDate: businessDate(startedAt, zone),
      startedAt,
    },
  });
}

export async function finishCleaningSession(input: {
  hotelId: string;
  roomId: string;
  roomNumber: string;
  housekeeperId: string | null;
  cleaningStartedAt: Date | null;
  outcome: "CLEAN" | "READY_TO_INSPECT";
}) {
  const finishedAt = new Date();
  const outcome = input.outcome === "CLEAN" ? CleaningOutcome.CLEAN : CleaningOutcome.READY_TO_INSPECT;
  const open = await prisma.cleaningSession.findFirst({
    where: { roomId: input.roomId, finishedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (open) {
    const durationSeconds = Math.max(0, Math.round((finishedAt.getTime() - open.startedAt.getTime()) / 1000));
    const housekeeperId = open.housekeeperId ?? input.housekeeperId;
    await prisma.cleaningSession.updateMany({
      where: { id: open.id, finishedAt: null },
      data: {
        finishedAt,
        durationSeconds,
        outcome,
        housekeeperId,
        housekeeperName: open.housekeeperName ?? (await housekeeperName(housekeeperId)),
      },
    });
    return;
  }

  if (!input.cleaningStartedAt) return;
  const startedAt = input.cleaningStartedAt;
  const zone = await hotelZone(input.hotelId);
  const durationSeconds = Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000));
  await prisma.cleaningSession.create({
    data: {
      hotelId: input.hotelId,
      roomId: input.roomId,
      roomNumber: input.roomNumber,
      housekeeperId: input.housekeeperId,
      housekeeperName: await housekeeperName(input.housekeeperId),
      businessDate: businessDate(startedAt, zone),
      startedAt,
      finishedAt,
      durationSeconds,
      outcome,
    },
  });
}
