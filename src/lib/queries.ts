import { prisma } from "./prisma";
import { UserRole, RoomStatus, CleaningStatus, CleaningOutcome } from "@prisma/client";
import {
  businessDate,
  businessDateFromKey,
  businessDateKey,
  formatBusinessDate,
  periodBusinessRange,
  periodInstantRange,
  type ReportPeriod,
} from "@/lib/business-day";

export async function getDashboardStats(hotelId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const rooms = await prisma.room.findMany({ where: { hotelId } });
  const totalRooms = rooms.length;
  const occupied = rooms.filter(
    (r) =>
      r.guestStatus === "OCCUPIED" ||
      r.guestStatus === "STAYOVER" ||
      r.guestStatus === "DEPARTING" ||
      r.status === RoomStatus.OCCUPIED
  ).length;

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
    prisma.room.count({
      where: {
        hotelId,
        OR: [
          { status: RoomStatus.READY_TO_INSPECT },
          { cleaningStatus: CleaningStatus.NEEDS_INSPECTION },
        ],
      },
    }),
    prisma.room.count({ where: { hotelId, isRush: true } }),
    prisma.room.count({ where: { hotelId, isVip: true, OR: [{ status: RoomStatus.OCCUPIED }, { guestStatus: { in: ["OCCUPIED", "STAYOVER", "ARRIVING"] } }] } }),
    prisma.guestRequest.count({
      where: { hotelId, status: { not: "COMPLETED" } },
    }),
  ]);

  const cleaning = rooms.filter((r) => r.status === RoomStatus.CLEANING).length;
  const readyToInspect = rooms.filter(
    (r) => r.status === RoomStatus.READY_TO_INSPECT || r.cleaningStatus === CleaningStatus.NEEDS_INSPECTION
  ).length;
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
        { name: "Ready to inspect", value: readyToInspect, color: "#f59e0b" },
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
        { name: "Ready to inspect", value: readyToInspect },
        { name: "Clean", value: vacantClean },
        { name: "Maintenance", value: maintenance },
        { name: "OOO", value: outOfOrder },
        { name: "Out of inventory", value: rooms.filter((r) => r.status === RoomStatus.OUT_OF_INVENTORY).length },
      ],
      avgCleaningTime: await averageCleaningMinutes(hotelId),
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

export async function getRoomsReadyToInspect(hotelId: string) {
  return prisma.room.findMany({
    where: {
      hotelId,
      OR: [
        { status: RoomStatus.READY_TO_INSPECT },
        { cleaningStatus: CleaningStatus.NEEDS_INSPECTION },
      ],
    },
    include: { housekeeper: { select: { name: true } } },
    orderBy: [{ floor: "asc" }, { number: "asc" }],
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

const FINISHED_OUTCOMES = [CleaningOutcome.CLEAN, CleaningOutcome.READY_TO_INSPECT] as const;

async function averageCleaningMinutes(hotelId: string) {
  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    select: { timezone: true },
  });
  const sessions = await prisma.cleaningSession.findMany({
    where: {
      hotelId,
      businessDate: businessDate(new Date(), hotel?.timezone),
      outcome: { in: [...FINISHED_OUTCOMES] },
      durationSeconds: { not: null },
    },
    select: { durationSeconds: true },
  });
  if (!sessions.length) return 0;
  const total = sessions.reduce((sum, session) => sum + (session.durationSeconds ?? 0), 0);
  return Math.round(total / sessions.length / 60);
}

function reportPeriod(value?: string): ReportPeriod {
  if (value === "month" || value === "monthly") return "month";
  if (value === "year" || value === "yearly") return "year";
  return "day";
}

export async function getReportData(
  hotelId: string,
  options: { period?: string; date?: string; employeeId?: string } = {}
) {
  const period = reportPeriod(options.period);
  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    select: { timezone: true },
  });
  const openDate = businessDate(new Date(), hotel?.timezone);
  const anchor = (options.date ? businessDateFromKey(options.date) : null) ?? openDate;
  const { from, to } = periodBusinessRange(anchor, period);
  const { start, end } = periodInstantRange(anchor, period, hotel?.timezone);
  const employeeId = options.employeeId || "";
  const openKey = businessDateKey(openDate);
  const openInPeriod = businessDateKey(from) <= openKey && openKey < businessDateKey(to);

  const [employees, snapshots, sessions, inspections, tickets, guestRequests, inventory, lostFound, laundry, liveRooms] =
    await Promise.all([
      prisma.user.findMany({
        where: {
          hotelId,
          active: true,
          role: { in: [UserRole.HOUSEKEEPER, UserRole.EXECUTIVE_HOUSEKEEPER] },
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.roomDaySnapshot.findMany({
        where: {
          hotelId,
          businessDate: { gte: from, lt: to },
          ...(employeeId ? { housekeeperId: employeeId } : {}),
        },
        orderBy: [{ businessDate: "asc" }, { roomNumber: "asc" }],
      }),
      prisma.cleaningSession.findMany({
        where: {
          hotelId,
          businessDate: { gte: from, lt: to },
          ...(employeeId ? { housekeeperId: employeeId } : {}),
        },
      }),
      prisma.inspection.findMany({
        where: {
          room: { hotelId },
          createdAt: { gte: start, lt: end },
          ...(employeeId ? { inspectorId: employeeId } : {}),
        },
      }),
      prisma.maintenanceTicket.findMany({
        where: {
          hotelId,
          createdAt: { gte: start, lt: end },
          ...(employeeId ? { createdById: employeeId } : {}),
        },
      }),
      prisma.guestRequest.findMany({
        where: {
          hotelId,
          createdAt: { gte: start, lt: end },
          ...(employeeId ? { assignedToId: employeeId } : {}),
        },
      }),
      prisma.inventoryItem.findMany({ where: { hotelId } }),
      prisma.lostFoundItem.findMany({
        where: {
          hotelId,
          createdAt: { gte: start, lt: end },
          ...(employeeId ? { foundById: employeeId } : {}),
        },
      }),
      prisma.laundryBatch.findMany({
        where: { hotelId, updatedAt: { gte: start, lt: end } },
      }),
      prisma.room.findMany({
        where: { hotelId, ...(employeeId ? { housekeeperId: employeeId } : {}) },
        include: { housekeeper: { select: { name: true } } },
        orderBy: { number: "asc" },
      }),
    ]);

  const savedOpen = snapshots.some((row) => businessDateKey(row.businessDate) === openKey);
  const roomRecords = snapshots.map((row) => ({
    date: businessDateKey(row.businessDate),
    roomNumber: row.roomNumber,
    status: row.status,
    guestStatus: row.guestStatus,
    housekeeperName: row.housekeeperName,
    doNotDisturb: row.doNotDisturb,
    notes: row.frontDeskNotes,
    saved: true,
  }));
  if (openInPeriod && !savedOpen) {
    for (const room of liveRooms) {
      roomRecords.push({
        date: openKey,
        roomNumber: room.number,
        status: room.status,
        guestStatus: room.guestStatus,
        housekeeperName: room.housekeeper?.name ?? null,
        doNotDisturb: room.doNotDisturb,
        notes: room.frontDeskNotes,
        saved: false,
      });
    }
  }

  const statusCounts = new Map<string, number>();
  for (const room of roomRecords) {
    statusCounts.set(room.status, (statusCounts.get(room.status) ?? 0) + 1);
  }

  const employeeStats = new Map<
    string,
    { id: string; name: string; rooms: number; totalSeconds: number; unfinished: number }
  >();
  const ensureEmployee = (id: string, name: string) => {
    const existing = employeeStats.get(id);
    if (existing) {
      if (existing.name === "Unassigned" && name) existing.name = name;
      return existing;
    }
    const created = { id, name: name || "Unassigned", rooms: 0, totalSeconds: 0, unfinished: 0 };
    employeeStats.set(id, created);
    return created;
  };
  for (const employee of employees) {
    if (employeeId && employee.id !== employeeId) continue;
    ensureEmployee(employee.id, employee.name);
  }
  for (const session of sessions) {
    const row = ensureEmployee(session.housekeeperId || "unassigned", session.housekeeperName || "Unassigned");
    if (session.outcome === CleaningOutcome.UNFINISHED) row.unfinished += 1;
    if (
      session.outcome &&
      FINISHED_OUTCOMES.includes(session.outcome as (typeof FINISHED_OUTCOMES)[number]) &&
      session.durationSeconds != null
    ) {
      row.rooms += 1;
      row.totalSeconds += session.durationSeconds;
    }
  }

  const finished = sessions.filter(
    (session) =>
      session.outcome &&
      FINISHED_OUTCOMES.includes(session.outcome as (typeof FINISHED_OUTCOMES)[number]) &&
      session.durationSeconds != null
  );
  const totalSeconds = finished.reduce((sum, session) => sum + (session.durationSeconds ?? 0), 0);
  const scored = inspections.filter((inspection) => inspection.score != null);

  return {
    period,
    date: businessDateKey(anchor),
    label: formatBusinessDate(anchor, period),
    openDate: openKey,
    dayIsOpen: period === "day" && businessDateKey(anchor) === openKey && !savedOpen,
    employees,
    employeeId,
    statusCounts: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
    roomCount: roomRecords.length,
    roomRows: period === "day" ? roomRecords : [],
    employeeRows: [...employeeStats.values()]
      .map((row) => ({
        ...row,
        avgMinutes: row.rooms ? Math.round(row.totalSeconds / row.rooms / 60) : 0,
        totalMinutes: Math.round(row.totalSeconds / 60),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    avgCleaningTime: finished.length ? Math.round(totalSeconds / finished.length / 60) : 0,
    cleansFinished: finished.length,
    inspectionScores: {
      approved: inspections.filter((inspection) => inspection.status === "APPROVED").length,
      rejected: inspections.filter((inspection) => inspection.status === "REJECTED").length,
      pending: inspections.filter((inspection) => inspection.status === "PENDING").length,
      avgScore: scored.length
        ? Math.round(scored.reduce((sum, inspection) => sum + (inspection.score ?? 0), 0) / scored.length)
        : 0,
    },
    maintenance: {
      open: tickets.filter((ticket) => ticket.status !== "COMPLETED").length,
      completed: tickets.filter((ticket) => ticket.status === "COMPLETED").length,
    },
    inventoryUsage: inventory.map((item) => ({
      category: item.category,
      quantity: item.quantity,
    })),
    guestRequests: {
      open: guestRequests.filter((request) => request.status === "OPEN").length,
      assigned: guestRequests.filter((request) => request.status === "ASSIGNED").length,
      completed: guestRequests.filter((request) => request.status === "COMPLETED").length,
    },
    lostFound: {
      stored: lostFound.filter((item) => item.status === "STORED").length,
      claimed: lostFound.filter((item) => item.status === "CLAIMED").length,
      disposed: lostFound.filter((item) => item.status === "DISPOSED").length,
    },
    laundry: laundry.map((batch) => ({
      itemType: batch.itemType,
      status: batch.status,
      quantity: batch.quantity,
    })),
    roomTurnaround: roomRecords.filter((room) => room.status === RoomStatus.VACANT_DIRTY || room.status === RoomStatus.CLEANING)
      .length,
  };
}

export async function getHotelUsers(hotelId: string) {
  return prisma.user.findMany({
    where: { hotelId },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}
