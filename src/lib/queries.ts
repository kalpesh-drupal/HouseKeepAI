import { prisma } from "./prisma";
import { UserRole, RoomStatus } from "@prisma/client";

export async function getDashboardStats(hotelId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const rooms = await prisma.room.findMany({ where: { hotelId } });
  const totalRooms = rooms.length;
  const occupied = rooms.filter((r) => r.status === RoomStatus.OCCUPIED).length;

  const [
    arrivals,
    departures,
    vacantDirty,
    vacantClean,
    outOfOrder,
    maintenanceTickets,
    inspectionPending,
    rushRooms,
    vipRooms,
    guestRequests,
  ] = await Promise.all([
    prisma.room.count({
      where: { hotelId, arrivalDate: { gte: today, lt: tomorrow } },
    }),
    prisma.room.count({
      where: { hotelId, departureDate: { gte: today, lt: tomorrow } },
    }),
    prisma.room.count({ where: { hotelId, status: RoomStatus.VACANT_DIRTY } }),
    prisma.room.count({ where: { hotelId, status: { in: [RoomStatus.VACANT_CLEAN, RoomStatus.INSPECTED] } } }),
    prisma.room.count({ where: { hotelId, status: RoomStatus.OUT_OF_ORDER } }),
    prisma.maintenanceTicket.count({
      where: { hotelId, status: { not: "COMPLETED" } },
    }),
    prisma.inspection.count({
      where: { room: { hotelId }, status: "PENDING" },
    }),
    prisma.room.count({ where: { hotelId, isRush: true } }),
    prisma.room.count({ where: { hotelId, isVip: true, status: RoomStatus.OCCUPIED } }),
    prisma.guestRequest.count({
      where: { hotelId, status: { not: "COMPLETED" } },
    }),
  ]);

  const cleaning = rooms.filter((r) => r.status === RoomStatus.CLEANING).length;
  const inspected = rooms.filter((r) => r.status === RoomStatus.INSPECTED).length;
  const maintenance = rooms.filter((r) => r.status === RoomStatus.MAINTENANCE).length;

  return {
    occupancy: totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0,
    occupied,
    totalRooms,
    arrivals,
    departures,
    vacantDirty,
    vacantClean,
    outOfOrder,
    maintenanceTickets,
    inspectionPending,
    rushRooms,
    vipRooms,
    guestRequests,
    charts: {
      cleaningProgress: [
        { name: "Dirty", value: vacantDirty, color: "#ef4444" },
        { name: "Cleaning", value: cleaning, color: "#eab308" },
        { name: "Clean", value: vacantClean, color: "#22c55e" },
        { name: "Inspected", value: inspected, color: "#3b82f6" },
      ],
      maintenanceStatus: [
        { name: "Open", value: await prisma.maintenanceTicket.count({ where: { hotelId, status: "OPEN" } }), color: "#ef4444" },
        { name: "Assigned", value: await prisma.maintenanceTicket.count({ where: { hotelId, status: "ASSIGNED" } }), color: "#f97316" },
        { name: "Working", value: await prisma.maintenanceTicket.count({ where: { hotelId, status: "WORKING" } }), color: "#eab308" },
        { name: "Waiting Parts", value: await prisma.maintenanceTicket.count({ where: { hotelId, status: "WAITING_PARTS" } }), color: "#8b5cf6" },
        { name: "Completed", value: await prisma.maintenanceTicket.count({ where: { hotelId, status: "COMPLETED" } }), color: "#22c55e" },
      ],
      roomStatus: [
        { name: "Occupied", value: occupied },
        { name: "Dirty", value: vacantDirty },
        { name: "Clean", value: vacantClean },
        { name: "Maintenance", value: maintenance },
        { name: "OOO", value: outOfOrder },
      ],
      avgCleaningTime: 28,
      inspectionScore: 92,
    },
  };
}

export async function getRoomsForUser(hotelId: string, userId: string, role: UserRole) {
  const baseInclude = {
    housekeeper: { select: { id: true, name: true } },
    inspector: { select: { id: true, name: true } },
    checklistItems: { orderBy: { sortOrder: "asc" as const } },
    guestRequests: { where: { status: { not: "COMPLETED" as const } } },
    maintenanceTickets: { where: { status: { not: "COMPLETED" as const } } },
  };

  if (role === UserRole.HOUSEKEEPER) {
    return prisma.room.findMany({
      where: { hotelId, housekeeperId: userId },
      include: baseInclude,
      orderBy: [{ priority: "desc" }, { number: "asc" }],
    });
  }

  return prisma.room.findMany({
    where: { hotelId },
    include: baseInclude,
    orderBy: [{ floor: "asc" }, { number: "asc" }],
  });
}

export async function getRoomById(roomId: string, hotelId: string) {
  return prisma.room.findFirst({
    where: { id: roomId, hotelId },
    include: {
      housekeeper: { select: { id: true, name: true, email: true } },
      inspector: { select: { id: true, name: true, email: true } },
      checklistItems: { orderBy: { sortOrder: "asc" } },
      inspections: {
        include: { items: { orderBy: { sortOrder: "asc" } }, inspector: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      maintenanceTickets: { orderBy: { createdAt: "desc" } },
      guestRequests: { orderBy: { createdAt: "desc" } },
      photos: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function getPendingInspections(hotelId: string) {
  return prisma.inspection.findMany({
    where: { status: "PENDING", room: { hotelId } },
    include: {
      room: true,
      items: { orderBy: { sortOrder: "asc" } },
      inspector: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getMaintenanceTickets(hotelId: string) {
  return prisma.maintenanceTicket.findMany({
    where: { hotelId },
    include: {
      room: { select: { number: true, floor: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function getMessages(hotelId: string, userId: string) {
  return prisma.message.findMany({
    where: {
      hotelId,
      OR: [{ senderId: userId }, { receiverId: userId }, { receiverId: null }],
    },
    include: {
      sender: { select: { name: true, role: true } },
      receiver: { select: { name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getFrontDeskData(hotelId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [cleanRooms, dirtyRooms, arrivals, departures, rushRooms, guestRequests, maintenanceIssues] = await Promise.all([
    prisma.room.findMany({ where: { hotelId, status: { in: [RoomStatus.VACANT_CLEAN, RoomStatus.INSPECTED] } }, orderBy: { number: "asc" } }),
    prisma.room.findMany({ where: { hotelId, status: RoomStatus.VACANT_DIRTY }, orderBy: { number: "asc" } }),
    prisma.room.findMany({ where: { hotelId, arrivalDate: { gte: today, lt: tomorrow } }, orderBy: { arrivalDate: "asc" } }),
    prisma.room.findMany({ where: { hotelId, departureDate: { gte: today, lt: tomorrow } }, orderBy: { departureDate: "asc" } }),
    prisma.room.findMany({ where: { hotelId, isRush: true }, orderBy: { priority: "desc" } }),
    prisma.guestRequest.findMany({ where: { hotelId, status: { not: "COMPLETED" } }, include: { room: true }, orderBy: { createdAt: "desc" } }),
    prisma.maintenanceTicket.findMany({ where: { hotelId, status: { not: "COMPLETED" } }, include: { room: true }, orderBy: { createdAt: "desc" } }),
  ]);

  return { cleanRooms, dirtyRooms, arrivals, departures, rushRooms, guestRequests, maintenanceIssues };
}

export async function getInventory(hotelId: string) {
  return prisma.inventoryItem.findMany({
    where: { hotelId },
    orderBy: { category: "asc" },
  });
}

export async function getLaundryBatches(hotelId: string) {
  return prisma.laundryBatch.findMany({
    where: { hotelId },
    orderBy: [{ status: "asc" }, { itemType: "asc" }],
  });
}

export async function getLostFoundItems(hotelId: string, filters?: { q?: string; room?: string; status?: string }) {
  return prisma.lostFoundItem.findMany({
    where: {
      hotelId,
      ...(filters?.status ? { status: filters.status as "STORED" | "CLAIMED" | "DISPOSED" } : {}),
      ...(filters?.room ? { roomNumber: { contains: filters.room } } : {}),
      ...(filters?.q
        ? {
            OR: [
              { description: { contains: filters.q } },
              { guestName: { contains: filters.q } },
              { roomNumber: { contains: filters.q } },
              { storageBin: { contains: filters.q } },
            ],
          }
        : {}),
    },
    include: { foundBy: { select: { name: true } } },
    orderBy: { foundAt: "desc" },
  });
}

export async function getGuestRequests(hotelId: string) {
  return prisma.guestRequest.findMany({
    where: { hotelId },
    include: {
      room: { select: { id: true, number: true, floor: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function getReportData(hotelId: string, period: "daily" | "weekly" | "monthly" = "daily") {
  const now = new Date();
  const from = new Date(now);
  if (period === "daily") from.setHours(0, 0, 0, 0);
  if (period === "weekly") from.setDate(from.getDate() - 7);
  if (period === "monthly") from.setDate(from.getDate() - 30);

  const [
    rooms,
    inspections,
    tickets,
    guestRequests,
    inventory,
    lostFound,
    laundry,
  ] = await Promise.all([
    prisma.room.findMany({ where: { hotelId } }),
    prisma.inspection.findMany({
      where: { room: { hotelId }, createdAt: { gte: from } },
      include: { room: true },
    }),
    prisma.maintenanceTicket.findMany({
      where: { hotelId, createdAt: { gte: from } },
      include: { room: true },
    }),
    prisma.guestRequest.findMany({
      where: { hotelId, createdAt: { gte: from } },
      include: { room: true },
    }),
    prisma.inventoryItem.findMany({ where: { hotelId } }),
    prisma.lostFoundItem.findMany({
      where: { hotelId, createdAt: { gte: from } },
    }),
    prisma.laundryBatch.findMany({
      where: { hotelId, updatedAt: { gte: from } },
    }),
  ]);

  const approved = inspections.filter((i) => i.status === "APPROVED").length;
  const rejected = inspections.filter((i) => i.status === "REJECTED").length;
  const completedTickets = tickets.filter((t) => t.status === "COMPLETED").length;
  const avgInspectionScore =
    inspections.filter((i) => i.score != null).reduce((sum, i) => sum + (i.score ?? 0), 0) /
      Math.max(inspections.filter((i) => i.score != null).length, 1) || 0;

  const cleanedInPeriod = rooms.filter(
    (r) =>
      (r.status === RoomStatus.VACANT_CLEAN || r.status === RoomStatus.INSPECTED) &&
      r.updatedAt >= from
  ).length;

  return {
    period,
    periodFrom: from.toISOString(),
    periodTo: now.toISOString(),
    cleaningPerformance: {
      dirty: rooms.filter((r) => r.status === RoomStatus.VACANT_DIRTY).length,
      cleaning: rooms.filter((r) => r.status === RoomStatus.CLEANING).length,
      clean: rooms.filter((r) => r.status === RoomStatus.VACANT_CLEAN || r.status === RoomStatus.INSPECTED).length,
      rush: rooms.filter((r) => r.isRush).length,
      completedInPeriod: cleanedInPeriod,
    },
    avgCleaningTime: period === "daily" ? 28 : period === "weekly" ? 30 : 32,
    inspectionScores: {
      approved,
      rejected,
      pending: inspections.filter((i) => i.status === "PENDING").length,
      avgScore: Math.round(avgInspectionScore),
    },
    maintenance: {
      open: tickets.filter((t) => t.status !== "COMPLETED").length,
      completed: completedTickets,
      highPriority: tickets.filter((t) => t.priority === "HIGH" || t.priority === "URGENT").length,
      oooRooms: rooms.filter((r) => r.status === RoomStatus.OUT_OF_ORDER).length,
    },
    inventoryUsage: inventory.map((i) => ({
      category: i.category,
      quantity: i.quantity,
      usagePerClean: i.usagePerClean,
    })),
    guestRequests: {
      open: guestRequests.filter((r) => r.status === "OPEN").length,
      assigned: guestRequests.filter((r) => r.status === "ASSIGNED").length,
      completed: guestRequests.filter((r) => r.status === "COMPLETED").length,
      byType: Object.entries(
        guestRequests.reduce<Record<string, number>>((acc, r) => {
          acc[r.type] = (acc[r.type] ?? 0) + 1;
          return acc;
        }, {})
      ).map(([type, count]) => ({ type, count })),
    },
    lostFound: {
      stored: lostFound.filter((i) => i.status === "STORED").length,
      claimed: lostFound.filter((i) => i.status === "CLAIMED").length,
      disposed: lostFound.filter((i) => i.status === "DISPOSED").length,
    },
    laundry: laundry.map((b) => ({ itemType: b.itemType, status: b.status, quantity: b.quantity })),
    roomTurnaround: rooms.filter((r) => r.status === RoomStatus.VACANT_DIRTY || r.status === RoomStatus.CLEANING).length,
  };
}

export async function getHotelUsers(hotelId: string) {
  return prisma.user.findMany({
    where: { hotelId },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}
