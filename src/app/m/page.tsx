import { requireAuth } from "@/lib/session";
import { getRoomsForUser } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/utils";
import Link from "next/link";
import { ClipboardCheck, KeyRound, MessageSquare, Search, Sparkles, Wrench } from "lucide-react";

export default async function MobileDashboardPage() {
  const session = await requireAuth(undefined, "/login?mobile=1&callbackUrl=/m");
  const role = session.user.role;
  const hotelId = session.user.hotelId;

  const [rooms, openTickets, pendingInspections, messages] = await Promise.all([
    getRoomsForUser(hotelId, session.user.id, role),
    prisma.maintenanceTicket.count({ where: { hotelId, status: { not: "COMPLETED" } } }),
    prisma.inspection.count({ where: { room: { hotelId }, status: "PENDING" } }),
    prisma.message.count({
      where: {
        hotelId,
        read: false,
        OR: [{ receiverId: session.user.id }, { receiverId: null }],
        NOT: { senderId: session.user.id },
      },
    }),
  ]);

  const dirty = rooms.filter((r) => r.status === "VACANT_DIRTY" || r.status === "CLEANING").length;

  const cards = [
    {
      href: "/m/housekeeping",
      title: "Housekeeping",
      detail: role === "HOUSEKEEPER" ? `${rooms.length} assigned · ${dirty} to clean` : `${rooms.length} rooms · ${dirty} dirty`,
      icon: Sparkles,
      show: ["HOUSEKEEPER", "EXECUTIVE_HOUSEKEEPER", "OWNER", "GENERAL_MANAGER"].includes(role),
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
      title: "Inspection",
      detail: `${pendingInspections} pending`,
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
