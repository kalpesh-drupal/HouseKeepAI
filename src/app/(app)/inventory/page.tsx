import { requireAuth } from "@/lib/session";
import { getInventory } from "@/lib/queries";
import { getStockAlert } from "@/lib/utils";
import { InventoryAdjust } from "@/components/inventory-adjust";
import { UserRole } from "@prisma/client";

export default async function InventoryPage() {
  const session = await requireAuth([
    UserRole.EXECUTIVE_HOUSEKEEPER,
    UserRole.GENERAL_MANAGER,
    UserRole.OWNER,
  ]);
  const items = await getInventory(session.user.hotelId);

  const alerts = items.filter((i) => {
    const alert = getStockAlert(i.quantity, i.reorderThreshold, i.criticalThreshold);
    return alert.level !== "OK";
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Inventory Management</h1>
        <p className="text-muted-foreground">Stock levels auto-decrease when rooms are cleaned</p>
      </div>

      {alerts.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <h2 className="font-semibold text-red-800">Stock Alerts ({alerts.length})</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {alerts.map((item) => {
              const alert = getStockAlert(item.quantity, item.reorderThreshold, item.criticalThreshold);
              return (
                <span key={item.id} className={`rounded-full px-3 py-1 text-xs font-medium ${alert.color}`}>
                  {item.category}: {item.quantity} ({alert.label})
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Quantity</th>
              <th className="px-4 py-3 font-medium">Per Clean</th>
              <th className="px-4 py-3 font-medium">Alert</th>
              <th className="px-4 py-3 font-medium">Adjust</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => {
              const alert = getStockAlert(item.quantity, item.reorderThreshold, item.criticalThreshold);
              return (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-medium">{item.category}</td>
                  <td className="px-4 py-3">{item.quantity} {item.unit}</td>
                  <td className="px-4 py-3">{item.usagePerClean}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${alert.color}`}>{alert.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <InventoryAdjust itemId={item.id} quantity={item.quantity} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
