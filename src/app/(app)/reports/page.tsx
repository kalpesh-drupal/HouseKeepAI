import { requireAuth } from "@/lib/session";
import { getReportData } from "@/lib/queries";
import { ExportButtons } from "@/components/export-buttons";
import { UserRole } from "@prisma/client";
import { StatCard } from "@/components/stat-card";
import Link from "next/link";

type Period = "daily" | "weekly" | "monthly";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await requireAuth([
    UserRole.OWNER,
    UserRole.GENERAL_MANAGER,
    UserRole.EXECUTIVE_HOUSEKEEPER,
  ]);
  const params = await searchParams;
  const period: Period =
    params.period === "weekly" || params.period === "monthly" ? params.period : "daily";
  const data = await getReportData(session.user.hotelId, period);

  const exportRows = [
    { Metric: "Period", Value: period },
    { Metric: "Dirty Rooms", Value: data.cleaningPerformance.dirty },
    { Metric: "Cleaning In Progress", Value: data.cleaningPerformance.cleaning },
    { Metric: "Clean Rooms", Value: data.cleaningPerformance.clean },
    { Metric: "Completed In Period", Value: data.cleaningPerformance.completedInPeriod },
    { Metric: "Rush Rooms", Value: data.cleaningPerformance.rush },
    { Metric: "Avg Cleaning Time (min)", Value: data.avgCleaningTime },
    { Metric: "Inspection Avg Score", Value: data.inspectionScores.avgScore },
    { Metric: "Inspections Approved", Value: data.inspectionScores.approved },
    { Metric: "Inspections Rejected", Value: data.inspectionScores.rejected },
    { Metric: "Open Maintenance", Value: data.maintenance.open },
    { Metric: "Completed Maintenance", Value: data.maintenance.completed },
    { Metric: "OOO Rooms", Value: data.maintenance.oooRooms },
    { Metric: "Guest Requests Open", Value: data.guestRequests.open },
    { Metric: "Lost & Found Stored", Value: data.lostFound.stored },
    { Metric: "Room Turnaround Pending", Value: data.roomTurnaround },
  ];

  const periods: { key: Period; label: string }[] = [
    { key: "daily", label: "Daily" },
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">
            {period.charAt(0).toUpperCase() + period.slice(1)} operations metrics · since{" "}
            {new Date(data.periodFrom).toLocaleDateString()}
          </p>
        </div>
        <ExportButtons filename={`housekeepai-report-${period}`} rows={exportRows} />
      </div>

      <div className="flex flex-wrap gap-2">
        {periods.map((p) => (
          <Link
            key={p.key}
            href={`/reports?period=${p.key}`}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              period === p.key
                ? "bg-primary text-white"
                : "border border-border bg-card hover:bg-muted"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Cleaning Performance"
          value={data.cleaningPerformance.clean}
          subtitle={`${data.cleaningPerformance.dirty} dirty · ${data.cleaningPerformance.cleaning} cleaning · ${data.cleaningPerformance.completedInPeriod} done`}
          variant="success"
        />
        <StatCard title="Avg Cleaning Time" value={`${data.avgCleaningTime}m`} />
        <StatCard
          title="Inspection Score"
          value={`${data.inspectionScores.avgScore}%`}
          subtitle={`${data.inspectionScores.approved} approved · ${data.inspectionScores.rejected} rejected`}
          variant="info"
        />
        <StatCard
          title="Maintenance Open"
          value={data.maintenance.open}
          subtitle={`${data.maintenance.completed} completed`}
          variant="warning"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Guest Requests</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Open</span>
              <span className="font-medium">{data.guestRequests.open}</span>
            </div>
            <div className="flex justify-between">
              <span>Assigned</span>
              <span className="font-medium">{data.guestRequests.assigned}</span>
            </div>
            <div className="flex justify-between">
              <span>Completed</span>
              <span className="font-medium">{data.guestRequests.completed}</span>
            </div>
          </div>
          <div className="mt-4 space-y-1">
            {data.guestRequests.byType.map((t) => (
              <div key={t.type} className="flex justify-between text-sm text-muted-foreground">
                <span>{t.type}</span>
                <span>{t.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Inventory Snapshot</h2>
          <div className="max-h-64 space-y-1 overflow-auto">
            {data.inventoryUsage.map((i) => (
              <div key={i.category} className="flex justify-between text-sm">
                <span>{i.category}</span>
                <span className="font-medium">{i.quantity}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Lost & Found</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Stored</span>
              <span className="font-medium">{data.lostFound.stored}</span>
            </div>
            <div className="flex justify-between">
              <span>Claimed</span>
              <span className="font-medium">{data.lostFound.claimed}</span>
            </div>
            <div className="flex justify-between">
              <span>Disposed</span>
              <span className="font-medium">{data.lostFound.disposed}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Laundry Status</h2>
          <div className="space-y-1">
            {data.laundry.map((b, i) => (
              <div key={`${b.itemType}-${i}`} className="flex justify-between text-sm">
                <span>{b.itemType}</span>
                <span className="text-muted-foreground">
                  {b.status} · {b.quantity}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
