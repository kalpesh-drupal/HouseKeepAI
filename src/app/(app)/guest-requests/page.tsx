import { requireAuth } from "@/lib/session";
import { getGuestRequests } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { GuestRequestActions } from "@/components/guest-request-actions";
import { GuestRequestCreateForm } from "@/components/guest-request-create-form";
import Link from "next/link";

const STATUS_COLORS = {
  OPEN: "bg-red-100 text-red-800",
  ASSIGNED: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-green-100 text-green-800",
};

export default async function GuestRequestsPage() {
  const session = await requireAuth();
  const [requests, rooms] = await Promise.all([
    getGuestRequests(session.user.hotelId),
    prisma.room.findMany({
      where: { hotelId: session.user.hotelId },
      select: { id: true, number: true },
      orderBy: { number: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Guest Requests</h1>
        <p className="text-muted-foreground">Housekeeping receives requests instantly · Open → Assigned → Completed</p>
      </div>

      <GuestRequestCreateForm rooms={rooms} />

      <div className="space-y-3">
        {requests.map((req) => (
          <div key={req.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5">
            <div>
              <div className="flex items-center gap-3">
                <Link href={`/rooms/${req.room.id}`} className="font-semibold hover:text-primary">
                  Room {req.room.number}
                </Link>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[req.status]}`}>
                  {req.status}
                </span>
              </div>
              <p className="mt-1 text-sm">{req.type}</p>
              {req.notes && <p className="text-xs text-muted-foreground">{req.notes}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                Assigned: {req.assignedTo?.name || "—"} · {new Date(req.createdAt).toLocaleString()}
              </p>
            </div>
            <GuestRequestActions requestId={req.id} status={req.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
