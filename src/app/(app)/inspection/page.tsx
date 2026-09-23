import { requireAuth } from "@/lib/session";
import { getPendingInspections } from "@/lib/queries";
import { InspectionActions } from "@/components/inspection-actions";
import Link from "next/link";

export default async function InspectionPage() {
  const session = await requireAuth();
  const inspections = await getPendingInspections(session.user.hotelId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Inspection Module</h1>
        <p className="text-muted-foreground">Review rooms and approve or reject cleaning quality</p>
      </div>

      {inspections.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <p className="text-lg font-medium">No pending inspections</p>
          <p className="text-muted-foreground">All rooms have been inspected.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {inspections.map((inspection) => (
            <div key={inspection.id} className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <Link href={`/rooms/${inspection.room.id}`} className="text-2xl font-bold hover:text-primary">
                    Room {inspection.room.number}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    Floor {inspection.room.floor} · Inspector: {inspection.inspector.name}
                  </p>
                </div>
                <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800">Pending</span>
              </div>

              <div className="mb-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {inspection.items.map((item) => (
                  <div key={item.id} className={`rounded-lg px-3 py-2 text-sm ${item.passed ? "bg-green-50 text-green-800" : "bg-muted"}`}>
                    {item.passed ? "✓" : "○"} {item.label}
                  </div>
                ))}
              </div>

              <p className="mb-4 text-sm text-muted-foreground">
                If rejected, the room automatically returns to the housekeeper for re-cleaning.
              </p>

              <InspectionActions inspectionId={inspection.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
