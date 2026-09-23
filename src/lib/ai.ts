import { prisma } from "./prisma";
import { RoomStatus, CleaningStatus } from "@prisma/client";
import { getStockAlert } from "./utils";

export type AiPriorityRoom = {
  id: string;
  number: string;
  floor: number;
  score: number;
  reasons: string[];
  status: RoomStatus;
  suggestedHousekeeper: string | null;
  estimatedMinutes: number;
  isVip: boolean;
  isRush: boolean;
};

export type AiInsights = {
  priorityRooms: AiPriorityRoom[];
  slowRooms: Array<{ id: string; number: string; reason: string; minutesStuck: number }>;
  staffSuggestions: Array<{ housekeeper: string; rooms: string[]; load: number }>;
  maintenancePredictions: Array<{ roomNumber: string; title: string; risk: string; reason: string }>;
  inventoryForecast: Array<{ category: string; quantity: number; daysLeft: number; orderQty: number; alert: string }>;
  repeatInspectionFails: Array<{ roomNumber: string; fails: number; roomId: string }>;
  summary: string[];
};

function hoursSince(date: Date) {
  return Math.max(0, (Date.now() - date.getTime()) / (1000 * 60 * 60));
}

export async function buildAiInsights(hotelId: string): Promise<AiInsights> {
  const [rooms, housekeepers, tickets, inspections, inventory, guestRequests] = await Promise.all([
    prisma.room.findMany({
      where: { hotelId },
      include: {
        housekeeper: { select: { id: true, name: true } },
        maintenanceTickets: true,
        inspections: true,
        guestRequests: { where: { status: { not: "COMPLETED" } } },
      },
    }),
    prisma.user.findMany({
      where: { hotelId, role: "HOUSEKEEPER", active: true },
      select: { id: true, name: true },
    }),
    prisma.maintenanceTicket.findMany({ where: { hotelId }, include: { room: true } }),
    prisma.inspection.findMany({ where: { room: { hotelId } }, include: { room: true } }),
    prisma.inventoryItem.findMany({ where: { hotelId } }),
    prisma.guestRequest.findMany({ where: { hotelId, status: { not: "COMPLETED" } }, include: { room: true } }),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dirtyLike = rooms.filter((r) =>
    ([RoomStatus.VACANT_DIRTY, RoomStatus.CLEANING] as RoomStatus[]).includes(r.status) ||
    r.cleaningStatus === CleaningStatus.INSPECTION_FAILED
  );

  const loadMap = new Map<string, number>();
  for (const hk of housekeepers) loadMap.set(hk.id, 0);
  for (const room of rooms) {
    if (room.housekeeperId && loadMap.has(room.housekeeperId)) {
      loadMap.set(room.housekeeperId, (loadMap.get(room.housekeeperId) ?? 0) + 1);
    }
  }

  const priorityRooms: AiPriorityRoom[] = dirtyLike
    .map((room) => {
      let score = room.priority * 10;
      const reasons: string[] = [];

      if (room.isRush) {
        score += 40;
        reasons.push("Rush clean requested");
      }
      if (room.isVip) {
        score += 30;
        reasons.push("VIP guest");
      }
      if (room.arrivalDate && room.arrivalDate >= today && room.arrivalDate < tomorrow) {
        score += 35;
        reasons.push("Arrival today");
      }
      if (room.departureDate && room.departureDate >= today && room.departureDate < tomorrow) {
        score += 25;
        reasons.push("Departure today");
      }
      if (room.cleaningStatus === CleaningStatus.INSPECTION_FAILED) {
        score += 28;
        reasons.push("Failed inspection — re-clean");
      }
      if (room.guestRequests.length > 0) {
        score += 15;
        reasons.push(`${room.guestRequests.length} open guest request(s)`);
      }
      const stuckHours = hoursSince(room.updatedAt);
      if (stuckHours > 2 && room.status === RoomStatus.VACANT_DIRTY) {
        score += Math.min(30, Math.round(stuckHours * 3));
        reasons.push(`Dirty for ~${Math.round(stuckHours)}h (slow turnover)`);
      }
      if (!room.housekeeperId) {
        score += 10;
        reasons.push("Unassigned");
      }
      if (reasons.length === 0) reasons.push("Standard dirty room");

      // Suggest least-loaded housekeeper
      let suggested: string | null = room.housekeeper?.name ?? null;
      if (!room.housekeeperId && housekeepers.length > 0) {
        const sorted = [...housekeepers].sort(
          (a, b) => (loadMap.get(a.id) ?? 0) - (loadMap.get(b.id) ?? 0)
        );
        suggested = sorted[0]?.name ?? null;
      }

      return {
        id: room.id,
        number: room.number,
        floor: room.floor,
        score,
        reasons,
        status: room.status,
        suggestedHousekeeper: suggested,
        estimatedMinutes: room.estimatedMinutes,
        isVip: room.isVip,
        isRush: room.isRush,
      };
    })
    .sort((a, b) => b.score - a.score);

  const slowRooms = dirtyLike
    .map((room) => {
      const minutesStuck = Math.round(hoursSince(room.updatedAt) * 60);
      const reasons: string[] = [];
      if (room.status === RoomStatus.CLEANING && minutesStuck > 45) {
        reasons.push("Cleaning taking longer than expected");
      }
      if (room.status === RoomStatus.VACANT_DIRTY && minutesStuck > 90) {
        reasons.push("Waiting too long to start cleaning");
      }
      if (room.cleaningStatus === CleaningStatus.INSPECTION_FAILED) {
        reasons.push("Returned after failed inspection");
      }
      if (room.maintenanceTickets.some((t) => t.status !== "COMPLETED")) {
        reasons.push("Blocked by open maintenance");
      }
      return {
        id: room.id,
        number: room.number,
        reason: reasons.join("; ") || "In progress longer than average",
        minutesStuck,
      };
    })
    .filter((r) => r.minutesStuck > 45 || r.reason.includes("inspection") || r.reason.includes("maintenance"))
    .sort((a, b) => b.minutesStuck - a.minutesStuck)
    .slice(0, 8);

  // Staff assignment suggestions: distribute top priority rooms
  const staffSuggestions = housekeepers.map((hk) => ({
    housekeeper: hk.name,
    rooms: [] as string[],
    load: loadMap.get(hk.id) ?? 0,
  }));

  const unassignedPriority = priorityRooms.filter((r) => {
    const room = rooms.find((x) => x.id === r.id);
    return !room?.housekeeperId;
  });

  unassignedPriority.forEach((room) => {
    if (staffSuggestions.length === 0) return;
    const target = [...staffSuggestions].sort((a, b) => a.load - b.load)[0];
    target.rooms.push(room.number);
    target.load += 1;
  });

  // Repeat ticket rooms = predictive maintenance
  const ticketCountByRoom = new Map<string, { count: number; titles: string[]; roomNumber: string }>();
  for (const t of tickets) {
    const key = t.roomId;
    const cur = ticketCountByRoom.get(key) ?? { count: 0, titles: [], roomNumber: t.room.number };
    cur.count += 1;
    cur.titles.push(t.title);
    ticketCountByRoom.set(key, cur);
  }

  const maintenancePredictions = [...ticketCountByRoom.entries()]
    .filter(([, v]) => v.count >= 1)
    .map(([, v]) => ({
      roomNumber: v.roomNumber,
      title: v.titles[0],
      risk: v.count >= 2 ? "High" : "Medium",
      reason:
        v.count >= 2
          ? `${v.count} tickets on record — likely recurring issue (${v.titles.slice(0, 2).join(", ")})`
          : `Active issue: ${v.titles[0]} — schedule preventive check`,
    }))
    .sort((a, b) => (a.risk === "High" ? -1 : 1) - (b.risk === "High" ? -1 : 1))
    .slice(0, 8);

  // Also flag rooms currently in MAINTENANCE / OOO
  for (const room of rooms.filter((r) => r.status === RoomStatus.MAINTENANCE || r.status === RoomStatus.OUT_OF_ORDER)) {
    if (!maintenancePredictions.find((m) => m.roomNumber === room.number)) {
      maintenancePredictions.push({
        roomNumber: room.number,
        title: room.status === RoomStatus.OUT_OF_ORDER ? "Out of Order" : "In maintenance",
        risk: "High",
        reason: `Room is ${room.status.replace(/_/g, " ").toLowerCase()} — prioritize repair to restore inventory`,
      });
    }
  }

  const dirtyCount = dirtyLike.length || 1;
  const inventoryForecast = inventory
    .map((item) => {
      const dailyBurn = Math.max(item.usagePerClean, 0) * Math.max(dirtyCount, 3);
      const daysLeft = dailyBurn > 0 ? Math.floor(item.quantity / dailyBurn) : 99;
      const alert = getStockAlert(item.quantity, item.reorderThreshold, item.criticalThreshold);
      const orderQty = Math.max(0, item.reorderThreshold * 3 - item.quantity);
      return {
        category: item.category,
        quantity: item.quantity,
        daysLeft,
        orderQty,
        alert: alert.label,
      };
    })
    .filter((i) => i.alert !== "OK" || i.daysLeft <= 3)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const failMap = new Map<string, { fails: number; roomNumber: string; roomId: string }>();
  for (const insp of inspections.filter((i) => i.status === "REJECTED")) {
    const cur = failMap.get(insp.roomId) ?? { fails: 0, roomNumber: insp.room.number, roomId: insp.roomId };
    cur.fails += 1;
    failMap.set(insp.roomId, cur);
  }
  const repeatInspectionFails = [...failMap.values()].sort((a, b) => b.fails - a.fails);

  const summary = [
    `Clean ${priorityRooms.slice(0, 3).map((r) => r.number).join(", ") || "no dirty rooms"} first based on rush/VIP/arrival signals.`,
    slowRooms[0]
      ? `Slowest room right now: ${slowRooms[0].number} (${slowRooms[0].minutesStuck} min — ${slowRooms[0].reason}).`
      : "No significant slow rooms detected.",
    inventoryForecast[0]
      ? `Reorder ${inventoryForecast[0].category} soon — ~${inventoryForecast[0].daysLeft} day(s) of stock at current pace.`
      : "Inventory levels look healthy.",
    maintenancePredictions[0]
      ? `Maintenance watch: Room ${maintenancePredictions[0].roomNumber} — ${maintenancePredictions[0].reason}`
      : "No high-risk maintenance patterns.",
    `${guestRequests.length} open guest request(s) need attention.`,
  ];

  return {
    priorityRooms,
    slowRooms,
    staffSuggestions: staffSuggestions.filter((s) => s.rooms.length > 0 || s.load > 0),
    maintenancePredictions: maintenancePredictions.slice(0, 8),
    inventoryForecast,
    repeatInspectionFails,
    summary,
  };
}

export async function answerAiQuestion(hotelId: string, question: string): Promise<{ answer: string; insights: AiInsights }> {
  const insights = await buildAiInsights(hotelId);
  const ruleBased = await answerWithRules(hotelId, question, insights);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return ruleBased;

  try {
    const context = [
      "You are HouseKeepAI, a hotel operations assistant.",
      "Use only the provided ops snapshot. Be concise and actionable.",
      `Priority rooms: ${insights.priorityRooms.slice(0, 8).map((r) => `${r.number}(score ${r.score}: ${r.reasons.join("; ")})`).join(" | ") || "none"}`,
      `Slow rooms: ${insights.slowRooms.slice(0, 5).map((r) => `${r.number} ${r.minutesStuck}m — ${r.reason}`).join(" | ") || "none"}`,
      `Inventory: ${insights.inventoryForecast.slice(0, 6).map((i) => `${i.category} qty=${i.quantity} days=${i.daysLeft} order=${i.orderQty}`).join(" | ") || "ok"}`,
      `Maintenance risks: ${insights.maintenancePredictions.slice(0, 5).map((m) => `${m.roomNumber}: ${m.reason}`).join(" | ") || "none"}`,
      `Summary: ${insights.summary.join(" ")}`,
      `Rule-based draft answer: ${ruleBased.answer}`,
    ].join("\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: context },
          { role: "user", content: question },
        ],
      }),
    });

    if (!res.ok) return ruleBased;
    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) return ruleBased;
    return { answer, insights };
  } catch {
    return ruleBased;
  }
}

async function answerWithRules(
  hotelId: string,
  question: string,
  insights: AiInsights
): Promise<{ answer: string; insights: AiInsights }> {
  const q = question.toLowerCase().trim();

  const roomMatch = q.match(/room\s*(\d{3,4})/i);
  if (roomMatch) {
    const number = roomMatch[1];
    const room = await prisma.room.findFirst({
      where: { hotelId, number },
      include: {
        housekeeper: true,
        inspector: true,
        maintenanceTickets: { orderBy: { createdAt: "desc" } },
        inspections: { orderBy: { createdAt: "desc" }, take: 5 },
        guestRequests: { where: { status: { not: "COMPLETED" } } },
      },
    });

    if (!room) {
      return { answer: `I couldn't find room ${number} in this hotel.`, insights };
    }

    if (q.includes("delay") || q.includes("slow") || q.includes("why")) {
      const parts = [
        `Room ${room.number} is currently ${room.status.replace(/_/g, " ").toLowerCase()} (cleaning: ${room.cleaningStatus.replace(/_/g, " ").toLowerCase()}).`,
      ];
      if (room.isRush) parts.push("It is marked as a rush room.");
      if (room.isVip) parts.push("It is a VIP room.");
      if (!room.housekeeperId) parts.push("No housekeeper is assigned yet — that is likely delaying turnover.");
      else parts.push(`Assigned housekeeper: ${room.housekeeper?.name}.`);
      const openTickets = room.maintenanceTickets.filter((t) => t.status !== "COMPLETED");
      if (openTickets.length) parts.push(`Open maintenance: ${openTickets.map((t) => t.title).join(", ")}.`);
      if (room.cleaningStatus === CleaningStatus.INSPECTION_FAILED) {
        parts.push("It failed inspection and was returned for re-cleaning.");
      }
      if (room.guestRequests.length) {
        parts.push(`Open guest requests: ${room.guestRequests.map((r) => r.type).join(", ")}.`);
      }
      const stuck = Math.round(hoursSince(room.updatedAt) * 60);
      parts.push(`Last status change was about ${stuck} minutes ago.`);
      return { answer: parts.join(" "), insights };
    }

    return {
      answer: `Room ${room.number}: status ${room.status.replace(/_/g, " ")}, guest ${room.guestName || "none"}, housekeeper ${room.housekeeper?.name || "unassigned"}, VIP=${room.isVip ? "yes" : "no"}, rush=${room.isRush ? "yes" : "no"}.`,
      insights,
    };
  }

  if (q.includes("clean first") || q.includes("priorit") || q.includes("which rooms should")) {
    const top = insights.priorityRooms.slice(0, 5);
    if (!top.length) return { answer: "No rooms currently need cleaning prioritization.", insights };
    const lines = top.map(
      (r, i) => `${i + 1}. Room ${r.number} (score ${r.score}) — ${r.reasons.join("; ")}${r.suggestedHousekeeper ? ` → assign ${r.suggestedHousekeeper}` : ""}`
    );
    return { answer: `Recommended cleaning order:\n${lines.join("\n")}`, insights };
  }

  if (q.includes("slowest") || q.includes("slow room")) {
    if (!insights.slowRooms.length) return { answer: "No rooms are currently flagged as slow.", insights };
    const lines = insights.slowRooms
      .slice(0, 5)
      .map((r) => `• Room ${r.number}: ${r.minutesStuck} min — ${r.reason}`);
    return { answer: `Today's slowest rooms:\n${lines.join("\n")}`, insights };
  }

  if (q.includes("towel") || q.includes("order") || q.includes("inventory") || q.includes("stock") || q.includes("reorder")) {
    const towels = insights.inventoryForecast.find((i) => i.category.toLowerCase().includes("towel"));
    if (q.includes("towel") && towels) {
      return {
        answer: `Order about ${towels.orderQty || towels.quantity < 40 ? Math.max(towels.orderQty, 40) : 24} towels. Current stock: ${towels.quantity}. Estimated days left at today's pace: ${towels.daysLeft}. Alert: ${towels.alert}.`,
        insights,
      };
    }
    if (!insights.inventoryForecast.length) {
      return { answer: "Inventory looks healthy — no urgent reorders suggested.", insights };
    }
    const lines = insights.inventoryForecast
      .slice(0, 6)
      .map((i) => `• ${i.category}: stock ${i.quantity}, ~${i.daysLeft} days left, order ~${i.orderQty} (${i.alert})`);
    return { answer: `Inventory reorder suggestions:\n${lines.join("\n")}`, insights };
  }

  if (q.includes("failed inspection") || q.includes("fail") || q.includes("inspection")) {
    if (!insights.repeatInspectionFails.length) {
      return {
        answer: `Inspection overview — no repeated failures on record. Pending/approved stats are reflected in Reports. Current priority re-cleans: ${
          insights.priorityRooms.filter((r) => r.reasons.some((x) => x.includes("inspection"))).map((r) => r.number).join(", ") || "none"
        }.`,
        insights,
      };
    }
    const lines = insights.repeatInspectionFails.map((r) => `• Room ${r.roomNumber}: ${r.fails} failed inspection(s)`);
    return { answer: `Rooms with repeated inspection failures:\n${lines.join("\n")}`, insights };
  }

  if (q.includes("maintenance") || q.includes("trend") || q.includes("predict")) {
    if (!insights.maintenancePredictions.length) {
      return { answer: "No predictive maintenance risks detected right now.", insights };
    }
    const lines = insights.maintenancePredictions
      .slice(0, 6)
      .map((m) => `• Room ${m.roomNumber} [${m.risk}]: ${m.reason}`);
    return { answer: `Maintenance trends & predictions:\n${lines.join("\n")}`, insights };
  }

  if (q.includes("assign") || q.includes("staff") || q.includes("employee") || q.includes("housekeeper")) {
    const lines = insights.staffSuggestions.map(
      (s) => `• ${s.housekeeper}: current load ${s.load}${s.rooms.length ? `, suggest adding rooms ${s.rooms.join(", ")}` : ""}`
    );
    return {
      answer: lines.length
        ? `Staff assignment suggestions:\n${lines.join("\n")}`
        : "All priority rooms already have housekeepers assigned.",
      insights,
    };
  }

  return {
    answer: `Here's what I recommend right now:\n${insights.summary.map((s) => `• ${s}`).join("\n")}\n\nTry asking: "Which rooms should be cleaned first?", "Show today's slowest rooms", "Why is room 108 delayed?", "How many towels should I order?", or "Show maintenance trends."`,
    insights,
  };
}
