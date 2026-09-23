import { requireAuth } from "@/lib/session";
import { getLaundryBatches } from "@/lib/queries";
import { LaundryAdvance } from "@/components/laundry-advance";
import { LaundryCreateForm } from "@/components/laundry-create-form";

const STATUS_COLORS: Record<string, string> = {
  DIRTY: "bg-red-100 text-red-800",
  WASHING: "bg-yellow-100 text-yellow-800",
  DRYING: "bg-orange-100 text-orange-800",
  READY: "bg-blue-100 text-blue-800",
  DELIVERED: "bg-green-100 text-green-800",
};

export default async function LaundryPage() {
  const session = await requireAuth();
  const batches = await getLaundryBatches(session.user.hotelId);

  const byStatus = ["DIRTY", "WASHING", "DRYING", "READY", "DELIVERED"].map((status) => ({
    status,
    items: batches.filter((b) => b.status === status),
    total: batches.filter((b) => b.status === status).reduce((sum, b) => sum + b.quantity, 0),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Laundry Management</h1>
        <p className="text-muted-foreground">Track Dirty → Washing → Drying → Ready → Delivered</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        {byStatus.map((col) => (
          <div key={col.status} className="rounded-2xl border border-border bg-card p-4 text-center">
            <p className="text-xs font-medium text-muted-foreground">{col.status}</p>
            <p className="mt-1 text-2xl font-bold">{col.total}</p>
          </div>
        ))}
      </div>

      <LaundryCreateForm />

      <div className="space-y-3">
        {batches.map((batch) => (
          <div key={batch.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-semibold">{batch.itemType}</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[batch.status]}`}>
                  {batch.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Qty: {batch.quantity}</p>
            </div>
            <LaundryAdvance batchId={batch.id} status={batch.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
