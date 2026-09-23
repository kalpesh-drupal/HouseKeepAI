import { PrismaClient, UserRole, RoomStatus, CleaningStatus, TicketStatus, TicketPriority, InspectionStatus, GuestRequestStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_CHECKLIST = [
  "Bathroom",
  "Bed",
  "Vacuum",
  "Dust",
  "Coffee",
  "Amenities",
  "Trash",
  "Mirror",
  "Windows",
  "Floor",
  "TV",
  "AC",
  "Mini Fridge",
];

const INSPECTION_CHECKLIST = [
  "Bathroom",
  "Bed",
  "Hair",
  "Dust",
  "Coffee",
  "Amenities",
  "Remote",
  "TV",
  "AC",
  "Curtains",
  "Windows",
  "Mirror",
  "Furniture",
];

async function main() {
  await prisma.message.deleteMany();
  await prisma.inspectionItem.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.checklistItem.deleteMany();
  await prisma.roomPhoto.deleteMany();
  await prisma.guestRequest.deleteMany();
  await prisma.maintenanceTicket.deleteMany();
  await prisma.lostFoundItem.deleteMany();
  await prisma.laundryBatch.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.room.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hotel.deleteMany();

  const hotel = await prisma.hotel.create({
    data: {
      name: "Grand Plaza Hotel",
      floors: 3,
    },
  });

  const passwordHash = await bcrypt.hash("password123", 10);

  const users = await Promise.all([
    prisma.user.create({
      data: { email: "owner@hotel.com", passwordHash, name: "Alex Owner", role: UserRole.OWNER, hotelId: hotel.id },
    }),
    prisma.user.create({
      data: { email: "gm@hotel.com", passwordHash, name: "Sarah Manager", role: UserRole.GENERAL_MANAGER, hotelId: hotel.id },
    }),
    prisma.user.create({
      data: { email: "frontdesk@hotel.com", passwordHash, name: "Mike Front Desk", role: UserRole.FRONT_DESK, hotelId: hotel.id },
    }),
    prisma.user.create({
      data: { email: "ehk@hotel.com", passwordHash, name: "Lisa Executive HK", role: UserRole.EXECUTIVE_HOUSEKEEPER, hotelId: hotel.id },
    }),
    prisma.user.create({
      data: { email: "housekeeper@hotel.com", passwordHash, name: "Maria Housekeeper", role: UserRole.HOUSEKEEPER, hotelId: hotel.id },
    }),
    prisma.user.create({
      data: { email: "maintenance@hotel.com", passwordHash, name: "Tom Maintenance", role: UserRole.MAINTENANCE, hotelId: hotel.id },
    }),
    prisma.user.create({
      data: { email: "inspector@hotel.com", passwordHash, name: "Jane Inspector", role: UserRole.INSPECTOR, hotelId: hotel.id },
    }),
  ]);

  const housekeeper = users.find((u) => u.role === UserRole.HOUSEKEEPER)!;
  const inspector = users.find((u) => u.role === UserRole.INSPECTOR)!;
  const maintenance = users.find((u) => u.role === UserRole.MAINTENANCE)!;

  const roomConfigs: Array<{
    number: string;
    floor: number;
    status: RoomStatus;
    cleaningStatus: CleaningStatus;
    isVip?: boolean;
    isRush?: boolean;
    guestName?: string;
    arrivalDate?: Date;
    departureDate?: Date;
    housekeeperId?: string;
    inspectorId?: string;
    priority?: number;
  }> = [
    { number: "101", floor: 1, status: RoomStatus.VACANT_DIRTY, cleaningStatus: CleaningStatus.NOT_STARTED, housekeeperId: housekeeper.id, priority: 3 },
    { number: "102", floor: 1, status: RoomStatus.CLEANING, cleaningStatus: CleaningStatus.IN_PROGRESS, housekeeperId: housekeeper.id, priority: 2 },
    { number: "103", floor: 1, status: RoomStatus.VACANT_CLEAN, cleaningStatus: CleaningStatus.COMPLETED, housekeeperId: housekeeper.id },
    { number: "104", floor: 1, status: RoomStatus.INSPECTED, cleaningStatus: CleaningStatus.COMPLETED, inspectorId: inspector.id },
    { number: "105", floor: 1, status: RoomStatus.MAINTENANCE, cleaningStatus: CleaningStatus.NOT_STARTED, priority: 5 },
    { number: "106", floor: 1, status: RoomStatus.OUT_OF_ORDER, cleaningStatus: CleaningStatus.NOT_STARTED },
    { number: "107", floor: 1, status: RoomStatus.OCCUPIED, cleaningStatus: CleaningStatus.COMPLETED, guestName: "John Smith", isVip: true, arrivalDate: new Date(), departureDate: new Date(Date.now() + 86400000) },
    { number: "108", floor: 1, status: RoomStatus.VACANT_DIRTY, cleaningStatus: CleaningStatus.NOT_STARTED, housekeeperId: housekeeper.id, isRush: true, priority: 8 },
    { number: "201", floor: 2, status: RoomStatus.VACANT_DIRTY, cleaningStatus: CleaningStatus.NOT_STARTED, housekeeperId: housekeeper.id },
    { number: "202", floor: 2, status: RoomStatus.CLEANING, cleaningStatus: CleaningStatus.IN_PROGRESS, housekeeperId: housekeeper.id },
    { number: "203", floor: 2, status: RoomStatus.VACANT_CLEAN, cleaningStatus: CleaningStatus.NEEDS_INSPECTION, housekeeperId: housekeeper.id },
    { number: "204", floor: 2, status: RoomStatus.INSPECTED, cleaningStatus: CleaningStatus.COMPLETED, inspectorId: inspector.id },
    { number: "205", floor: 2, status: RoomStatus.OCCUPIED, cleaningStatus: CleaningStatus.COMPLETED, guestName: "Emily Davis", arrivalDate: new Date(Date.now() - 86400000), departureDate: new Date() },
    { number: "206", floor: 2, status: RoomStatus.VACANT_DIRTY, cleaningStatus: CleaningStatus.NOT_STARTED, housekeeperId: housekeeper.id, priority: 4 },
    { number: "207", floor: 2, status: RoomStatus.MAINTENANCE, cleaningStatus: CleaningStatus.NOT_STARTED },
    { number: "208", floor: 2, status: RoomStatus.VACANT_CLEAN, cleaningStatus: CleaningStatus.COMPLETED },
    { number: "215", floor: 2, status: RoomStatus.OCCUPIED, cleaningStatus: CleaningStatus.COMPLETED, guestName: "John Smith", isVip: true, arrivalDate: new Date(), departureDate: new Date(Date.now() + 86400000), frontDeskNotes: "Late checkout requested" } as typeof roomConfigs[number] & { frontDeskNotes?: string },
    { number: "220", floor: 2, status: RoomStatus.VACANT_DIRTY, cleaningStatus: CleaningStatus.NOT_STARTED, housekeeperId: housekeeper.id },
    { number: "223", floor: 2, status: RoomStatus.VACANT_DIRTY, cleaningStatus: CleaningStatus.NOT_STARTED, housekeeperId: housekeeper.id, isRush: true, priority: 7 },
    { number: "301", floor: 3, status: RoomStatus.VACANT_DIRTY, cleaningStatus: CleaningStatus.NOT_STARTED },
    { number: "302", floor: 3, status: RoomStatus.VACANT_CLEAN, cleaningStatus: CleaningStatus.NEEDS_INSPECTION },
    { number: "303", floor: 3, status: RoomStatus.INSPECTED, cleaningStatus: CleaningStatus.COMPLETED },
    { number: "310", floor: 3, status: RoomStatus.MAINTENANCE, cleaningStatus: CleaningStatus.NOT_STARTED, priority: 9 },
  ];

  for (const config of roomConfigs) {
    const { frontDeskNotes, ...roomData } = config as typeof config & { frontDeskNotes?: string };
    const room = await prisma.room.create({
      data: {
        ...roomData,
        hotelId: hotel.id,
        frontDeskNotes: frontDeskNotes ?? null,
        checklistItems: {
          create: DEFAULT_CHECKLIST.map((label, i) => ({
            label,
            sortOrder: i,
            completed: roomData.cleaningStatus === CleaningStatus.COMPLETED || roomData.cleaningStatus === CleaningStatus.NEEDS_INSPECTION,
          })),
        },
      },
    });

    if (roomData.cleaningStatus === CleaningStatus.NEEDS_INSPECTION) {
      await prisma.inspection.create({
        data: {
          roomId: room.id,
          inspectorId: inspector.id,
          status: InspectionStatus.PENDING,
          items: {
            create: INSPECTION_CHECKLIST.map((label, i) => ({ label, sortOrder: i })),
          },
        },
      });
    }
  }

  const room310 = await prisma.room.findFirst({ where: { number: "310", hotelId: hotel.id } });
  const room105 = await prisma.room.findFirst({ where: { number: "105", hotelId: hotel.id } });
  const room215 = await prisma.room.findFirst({ where: { number: "215", hotelId: hotel.id } });
  const room108 = await prisma.room.findFirst({ where: { number: "108", hotelId: hotel.id } });
  const room101 = await prisma.room.findFirst({ where: { number: "101", hotelId: hotel.id } });
  const room206 = await prisma.room.findFirst({ where: { number: "206", hotelId: hotel.id } });

  // Seed rejected inspections so AI can detect repeat failures
  for (const room of [room101, room206]) {
    if (!room) continue;
    await prisma.inspection.create({
      data: {
        roomId: room.id,
        inspectorId: inspector.id,
        status: InspectionStatus.REJECTED,
        score: 62,
        notes: "Hair in bathroom / dust on furniture",
        items: {
          create: INSPECTION_CHECKLIST.map((label, i) => ({
            label,
            sortOrder: i,
            passed: !["Hair", "Dust", "Bathroom"].includes(label),
          })),
        },
      },
    });
  }
  if (room101) {
    await prisma.inspection.create({
      data: {
        roomId: room101.id,
        inspectorId: inspector.id,
        status: InspectionStatus.REJECTED,
        score: 55,
        notes: "Repeat fail — bathroom not properly cleaned",
        items: {
          create: INSPECTION_CHECKLIST.map((label, i) => ({
            label,
            sortOrder: i,
            passed: label !== "Bathroom" && label !== "Mirror",
          })),
        },
      },
    });
  }

  // Extra maintenance history for predictive trends
  if (room310) {
    await prisma.maintenanceTicket.create({
      data: {
        roomId: room310.id,
        hotelId: hotel.id,
        title: "AC filter replacement",
        description: "Previous AC service 3 weeks ago",
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.COMPLETED,
        assignedToId: maintenance.id,
      },
    });
  }

  if (room310) {
    await prisma.maintenanceTicket.create({
      data: {
        roomId: room310.id,
        hotelId: hotel.id,
        title: "Broken AC",
        description: "AC unit not cooling, guest reported warm room",
        priority: TicketPriority.HIGH,
        status: TicketStatus.ASSIGNED,
        assignedToId: maintenance.id,
      },
    });
  }

  if (room105) {
    await prisma.maintenanceTicket.create({
      data: {
        roomId: room105.id,
        hotelId: hotel.id,
        title: "Leaking faucet",
        description: "Bathroom sink faucet dripping",
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.WORKING,
        assignedToId: maintenance.id,
      },
    });
  }

  if (room215) {
    await prisma.guestRequest.create({
      data: { roomId: room215.id, hotelId: hotel.id, type: "Extra Towels", status: GuestRequestStatus.OPEN },
    });
    await prisma.guestRequest.create({
      data: { roomId: room215.id, hotelId: hotel.id, type: "Need Pillow", status: GuestRequestStatus.ASSIGNED, assignedToId: housekeeper.id },
    });
  }

  if (room108) {
    await prisma.guestRequest.create({
      data: { roomId: room108.id, hotelId: hotel.id, type: "Rush Clean", status: GuestRequestStatus.ASSIGNED, notes: "VIP arriving at 2pm", assignedToId: housekeeper.id },
    });
  }

  const room205 = await prisma.room.findFirst({ where: { number: "205", hotelId: hotel.id } });
  if (room205) {
    await prisma.guestRequest.create({
      data: { roomId: room205.id, hotelId: hotel.id, type: "Late Checkout", status: GuestRequestStatus.OPEN, notes: "Guest requested 2pm checkout" },
    });
  }

  const inventorySeed = [
    { category: "Soap", quantity: 120, reorderThreshold: 40, criticalThreshold: 15, usagePerClean: 2 },
    { category: "Shampoo", quantity: 85, reorderThreshold: 30, criticalThreshold: 10, usagePerClean: 1 },
    { category: "Conditioner", quantity: 78, reorderThreshold: 30, criticalThreshold: 10, usagePerClean: 1 },
    { category: "Coffee", quantity: 18, reorderThreshold: 25, criticalThreshold: 10, usagePerClean: 2 },
    { category: "Tea", quantity: 45, reorderThreshold: 20, criticalThreshold: 8, usagePerClean: 1 },
    { category: "Sugar", quantity: 60, reorderThreshold: 20, criticalThreshold: 8, usagePerClean: 2 },
    { category: "Creamer", quantity: 8, reorderThreshold: 20, criticalThreshold: 8, usagePerClean: 2 },
    { category: "Water", quantity: 150, reorderThreshold: 50, criticalThreshold: 20, usagePerClean: 2 },
    { category: "Toilet Paper", quantity: 200, reorderThreshold: 60, criticalThreshold: 25, usagePerClean: 2 },
    { category: "Trash Bags", quantity: 95, reorderThreshold: 40, criticalThreshold: 15, usagePerClean: 1 },
    { category: "Towels", quantity: 22, reorderThreshold: 40, criticalThreshold: 15, usagePerClean: 3 },
    { category: "Pillows", quantity: 40, reorderThreshold: 15, criticalThreshold: 5, usagePerClean: 0 },
    { category: "Sheets", quantity: 55, reorderThreshold: 30, criticalThreshold: 12, usagePerClean: 2 },
    { category: "Blankets", quantity: 35, reorderThreshold: 20, criticalThreshold: 8, usagePerClean: 1 },
  ];

  await prisma.inventoryItem.createMany({
    data: inventorySeed.map((item) => ({ ...item, hotelId: hotel.id })),
  });

  await prisma.laundryBatch.createMany({
    data: [
      { hotelId: hotel.id, itemType: "Sheets", quantity: 48, status: "DIRTY" },
      { hotelId: hotel.id, itemType: "Towels", quantity: 72, status: "WASHING" },
      { hotelId: hotel.id, itemType: "Pillow Cases", quantity: 36, status: "DRYING" },
      { hotelId: hotel.id, itemType: "Blankets", quantity: 20, status: "READY" },
      { hotelId: hotel.id, itemType: "Bath Mats", quantity: 24, status: "DIRTY" },
      { hotelId: hotel.id, itemType: "Robes", quantity: 12, status: "DELIVERED" },
    ],
  });

  await prisma.lostFoundItem.createMany({
    data: [
      {
        hotelId: hotel.id,
        roomNumber: "215",
        guestName: "John Smith",
        foundById: housekeeper.id,
        description: "Black leather wallet with credit cards",
        storageBin: "Bin A-12",
        status: "STORED",
      },
      {
        hotelId: hotel.id,
        roomNumber: "108",
        foundById: housekeeper.id,
        description: "Phone charger (USB-C)",
        storageBin: "Bin B-03",
        status: "STORED",
      },
      {
        hotelId: hotel.id,
        roomNumber: "205",
        guestName: "Emily Davis",
        foundById: housekeeper.id,
        description: "Pair of reading glasses",
        storageBin: "Bin A-07",
        status: "CLAIMED",
      },
    ],
  });

  const frontDesk = users.find((u) => u.role === UserRole.FRONT_DESK)!;

  await prisma.message.createMany({
    data: [
      {
        hotelId: hotel.id,
        senderId: frontDesk.id,
        receiverId: housekeeper.id,
        channel: "FRONT_DESK_HOUSEKEEPING",
        content: "Room 108 needs rush clean before 2pm VIP arrival",
        roomId: room108?.id,
      },
      {
        hotelId: hotel.id,
        senderId: maintenance.id,
        receiverId: users.find((u) => u.role === UserRole.GENERAL_MANAGER)!.id,
        channel: "MAINTENANCE_MANAGER",
        content: "AC parts ordered for room 310, ETA tomorrow",
        roomId: room310?.id,
      },
    ],
  });

  console.log("Seed completed!");
  console.log("\nDemo accounts (password: password123):");
  users.forEach((u) => console.log(`  ${u.role.padEnd(22)} ${u.email}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
