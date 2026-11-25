import { requireAuth } from "@/lib/session";
import { getLatestRoomDeskNotes, getRoomsForUser } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/utils";
import Link from "next/link";
import { ClipboardCheck, KeyRound, MessageSquare, Search, Sparkles, Wrench } from "lucide-react";
import { RoomDeskNoteFeed } from "@/components/room-desk-note-feed";
import { isDirtyForHousekeeping, isOnInspectionList } from "@/lib/mobile-routes";

export default async function MobileDashboardPage() {
  const session = await requireAuth(undefined, "/login?mobile=1&callbackUrl=/m");
  const role = session.user.role;
  const hotelId = session.user.hotelId;

  const [rooms, openTickets, pendingInspections, messages, deskNotes] = await Promise.all([
    getRoomsForUser(hotelId, session.user.id, role),
    prisma.maintenanceTicket.count({ where: { hotelId, status: { not: "COMPLETED" } } }),
    prisma.room.count({
      where: {
        hotelId,
        OR: [{ status: "READY_TO_INSPECT" }, { cleaningStatus: "NEEDS_INSPECTION" }],
      },
    }),
    prisma.message.count({
      where: {
        hotelId,
        read: false,
        OR: [{ receiverId: session.user.id }, { receiverId: null }],
        NOT: { senderId: session.user.id },
      },
    }),
    getLatestRoomDeskNotes(hotelId),
  ]);

  const housekeepingRooms =
    role === "HOUSEKEEPER" || role === "INSPECTOR"
      ? rooms.filter(
          (room) => room.housekeeperId === session.user.id && !isOnInspectionList(room.status, room.cleaningStatus)
        )
      : role === "EXECUTIVE_HOUSEKEEPER"
        ? rooms.filter((room) => isDirtyForHousekeeping(room.status, room.cleaningStatus))
        : rooms;
  const dirty = housekeepingRooms.filter((room) => room.status === "VACANT_DIRTY" || room.status === "CLEANING").length;
  const housekeepingDetail =
    role === "HOUSEKEEPER" || role === "INSPECTOR"
      ? `${housekeepingRooms.length} assigned · ${dirty} to clean`
      : role === "EXECUTIVE_HOUSEKEEPER"
        ? `${housekeepingRooms.length} dirty`
        : `${rooms.length} rooms · ${dirty} dirty`;

  const cards = [
    {
      href: "/m/housekeeping",
      title: "Housekeeping",
      detail: housekeepingDetail,
      icon: Sparkles,
      show: ["HOUSEKEEPER", "EXECUTIVE_HOUSEKEEPER", "INSPECTOR", "OWNER", "GENERAL_MANAGER"].includes(role),
    },
    {
      href: "/m/maintenance",
      title: "Maintenance",
      detail: `${openTickets} open ticket${openTickets === 1 ? "" : "s"}`,
      icon: Wrench,
      show: ["MAINTENANCE", "OWNER", "GENERAL_MANAGER", "FRONT_DESK"].includes(role),
    },
    {
      href: "/m/inspection",
      title: "Ready to inspect",
      detail: `${pendingInspections} room${pendingInspections === 1 ? "" : "s"}`,
      icon: ClipboardCheck,
      show: ["INSPECTOR", "EXECUTIVE_HOUSEKEEPER", "OWNER", "GENERAL_MANAGER"].includes(role),
    },
    {
      href: "/m/lost-found",
      title: "Lost & Found",
      detail: "Log items with photos",
      icon: Search,
      show: true,
    },
    {
      href: "/m/messages",
      title: "Team chat",
      detail: messages > 0 ? `${messages} unread` : "Message your team",
      icon: MessageSquare,
      show: true,
    },
    {
      href: "/m/account",
      title: "Change password",
      detail: "Update your login password",
      icon: KeyRound,
      show: true,
    },
  ].filter((c) => c.show);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">{ROLE_LABELS[role]}</p>
        <h2 className="text-2xl font-bold">Hi, {session.user.name?.split(" ")[0] || "there"}</h2>
        <p className="text-sm text-muted-foreground">{session.user.hotelName}</p>
      </div>

      <RoomDeskNoteFeed notes={deskNotes} poll />

      <div className="grid gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold">{card.title}</p>
                <p className="text-sm text-muted-foreground">{card.detail}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
