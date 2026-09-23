import { requireAuth } from "@/lib/session";
import { getMaintenanceTickets } from "@/lib/queries";
import { MaintenanceStatusButton } from "@/components/maintenance-status-button";
import Link from "next/link";

const PRIORITY_COLORS = {
  LOW: "bg-slate-100 text-slate-700",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

export default async function MaintenancePage() {
  const session = await requireAuth();
  const tickets = await getMaintenanceTickets(session.user.hotelId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Maintenance</h1>
        <p className="text-muted-foreground">Track and manage all maintenance tickets</p>
      </div>

      <div className="space-y-4">
        {tickets.map((ticket) => (
          <div key={ticket.id} className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <Link href={`/rooms/${ticket.roomId}`} className="text-xl font-bold hover:text-primary">
                    Room {ticket.room.number}
                  </Link>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${PRIORITY_COLORS[ticket.priority]}`}>
                    {ticket.priority}
                  </span>
                </div>
                <h3 className="mt-1 font-semibold">{ticket.title}</h3>
                {ticket.description && <p className="mt-1 text-sm text-muted-foreground">{ticket.description}</p>}
                <p className="mt-2 text-sm text-muted-foreground">
                  Assigned: {ticket.assignedTo?.name ?? "Unassigned"} · Status: {ticket.status.replace(/_/g, " ")}
                </p>
              </div>
              <MaintenanceStatusButton ticketId={ticket.id} currentStatus={ticket.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
