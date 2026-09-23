import { requireAuth } from "@/lib/session";
import { getMaintenanceTickets } from "@/lib/queries";
import { MaintenanceStatusButton } from "@/components/maintenance-status-button";
import Link from "next/link";

export default async function MobileMaintenancePage() {
  const session = await requireAuth();
  const tickets = await getMaintenanceTickets(session.user.hotelId);
  const open = tickets.filter((t) => t.status !== "COMPLETED");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Work Orders</h2>
        <p className="text-sm text-muted-foreground">{open.length} open tickets</p>
      </div>
      {open.map((ticket) => (
        <div key={ticket.id} className="rounded-2xl border border-border bg-card p-4">
          <Link href={`/m/rooms/${ticket.roomId}`} className="text-lg font-bold">
            Room {ticket.room.number}
          </Link>
          <p className="mt-1 font-medium">{ticket.title}</p>
          {ticket.description && <p className="text-sm text-muted-foreground">{ticket.description}</p>}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs">{ticket.priority} · {ticket.status}</span>
            <MaintenanceStatusButton ticketId={ticket.id} currentStatus={ticket.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
