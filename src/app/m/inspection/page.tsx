import { requireAuth } from "@/lib/session";
import { getPendingInspections } from "@/lib/queries";
import { InspectionActions } from "@/components/inspection-actions";
import Link from "next/link";

export default async function MobileInspectionPage() {
  const session = await requireAuth();
  const inspections = await getPendingInspections(session.user.hotelId);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Inspections</h2>
        <p className="text-sm text-muted-foreground">{inspections.length} pending</p>
      </div>
      {inspections.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          All clear
        </div>
      ) : (
        inspections.map((insp) => (
          <div key={insp.id} className="rounded-2xl border border-border bg-card p-4">
            <Link href={`/m/rooms/${insp.room.id}`} className="text-lg font-bold">
              Room {insp.room.number}
            </Link>
            <div className="mt-2 grid grid-cols-2 gap-1">
              {insp.items.slice(0, 8).map((item) => (
                <div key={item.id} className="rounded-lg bg-muted px-2 py-1 text-xs">
                  {item.passed ? "✓" : "○"} {item.label}
                </div>
              ))}
            </div>
            <div className="mt-3">
              <InspectionActions inspectionId={insp.id} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
