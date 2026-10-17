import { requireAuth } from "@/lib/session";
import { getReportData } from "@/lib/queries";
import { ExportButtons } from "@/components/export-buttons";
import { UserRole } from "@prisma/client";
import { StatCard } from "@/components/stat-card";
import { GUEST_STAY_CONFIG, ROOM_STATUS_CONFIG } from "@/lib/utils";
import { formatDuration } from "@/lib/business-day";
import Link from "next/link";

type Period = "day" | "month" | "year";

function statusLabel(status: string) {
  return ROOM_STATUS_CONFIG[status as keyof typeof ROOM_STATUS_CONFIG]?.label ?? status;
}

function guestLabel(status: string) {
  return GUEST_STAY_CONFIG[status as keyof typeof GUEST_STAY_CONFIG]?.label ?? status;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string; employee?: string }>;
}) {
  const session = await requireAuth([
    UserRole.OWNER,
    UserRole.GENERAL_MANAGER,
    UserRole.EXECUTIVE_HOUSEKEEPER,
  ]);
  const params = await searchParams;
  const period: Period = params.period === "month" || params.period === "year" ? params.period : "day";
  const data = await getReportData(session.user.hotelId, {
    period,
    date: params.date,
    employeeId: params.employee,
  });

  const periods: { key: Period; label: string }[] = [
    { key: "day", label: "Day" },
    { key: "month", label: "Month" },
    { key: "year", label: "Year" },
  ];

  const query = (nextPeriod: Period) => {
    const search = new URLSearchParams({ period: nextPeriod, date: data.date });
    if (data.employeeId) search.set("employee", data.employeeId);
    return `/reports?${search.toString()}`;
  };

  const exportRows: Record<string, string | number>[] = [
    ...data.employeeRows.map((row) => ({
      Type: "Employee",
      Date: data.label,
      Name: row.name,
      Detail: `${row.rooms} rooms cleaned`,
      Minutes: row.totalMinutes,
      Average: row.avgMinutes,
    })),
    ...data.roomRows.map((row) => ({
      Type: "Room",
      Date: row.date,
      Name: row.roomNumber,
      Detail: `${statusLabel(row.status)} / ${guestLabel(row.guestStatus)}${row.doNotDisturb ? " / DND" : ""}`,
      Minutes: "",
      Average: row.housekeeperName || "",
    })),
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">
            {data.label}
            {data.dayIsOpen ? " · today is still open and will be saved at 3:00 AM" : ""}
          </p>
        </div>
        <ExportButtons filename={`housekeepai-report-${period}-${data.date}`} rows={exportRows} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {periods.map((item) => (
          <Link
            key={item.key}
            href={query(item.key)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              period === item.key ? "bg-primary text-white" : "border border-border bg-card hover:bg-muted"
            }`}
          >
            {item.label}
          </Link>
        ))}
        <form className="flex flex-wrap items-end gap-2" method="get">
          <input type="hidden" name="period" value={period} />
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Date</span>
            <input
              type="date"
              name="date"
              defaultValue={data.date}
              className="rounded-xl border border-border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Employee</span>
            <select
              name="employee"
              defaultValue={data.employeeId}
              className="rounded-xl border border-border px-3 py-2"
            >
              <option value="">All employees</option>
              {data.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white">
            Apply
          </button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={period === "day" ? "Rooms" : "Room-days"}
          value={data.roomCount}
          subtitle={data.statusCounts.map((item) => `${item.count} ${statusLabel(item.status)}`).join(" · ") || "No rooms saved"}
        />
        <StatCard title="Cleans finished" value={data.cleansFinished} subtitle="Marked clean or ready to inspect" variant="success" />
        <StatCard title="Avg cleaning time" value={`${data.avgCleaningTime}m`} subtitle="Finished cleans in this period" />
        <StatCard
          title="Inspection score"
          value={`${data.inspectionScores.avgScore}%`}
          subtitle={`${data.inspectionScores.approved} approved · ${data.inspectionScores.rejected} rejected`}
          variant="info"
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold">Cleaning time by employee</h2>
        {data.employeeRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No housekeepers in this hotel.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Employee</th>
                  <th className="py-2 pr-4 font-medium">Rooms</th>
                  <th className="py-2 pr-4 font-medium">Total time</th>
                  <th className="py-2 pr-4 font-medium">Average</th>
                  <th className="py-2 font-medium">Unfinished at day close</th>
                </tr>
              </thead>
              <tbody>
                {data.employeeRows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="py-2 pr-4">{row.name}</td>
                    <td className="py-2 pr-4">{row.rooms}</td>
                    <td className="py-2 pr-4">{formatDuration(row.totalSeconds)}</td>
                    <td className="py-2 pr-4">{row.avgMinutes}m</td>
                    <td className="py-2">{row.unfinished}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {period === "day" && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-1 font-semibold">Room status</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {data.dayIsOpen
              ? "This is the live board. It is saved automatically at 3:00 AM hotel time."
              : "Saved at the 3:00 AM day close."}
          </p>
          {data.roomRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No room record for this day.</p>
          ) : (
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Room</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Guest</th>
                    <th className="py-2 pr-4 font-medium">Housekeeper</th>
                    <th className="py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.roomRows.map((row) => (
                    <tr key={`${row.date}-${row.roomNumber}`} className="border-t border-border">
                      <td className="py-2 pr-4 font-medium">{row.roomNumber}</td>
                      <td className="py-2 pr-4">
                        {statusLabel(row.status)}
                        {row.doNotDisturb ? " · DND" : ""}
                      </td>
                      <td className="py-2 pr-4">{guestLabel(row.guestStatus)}</td>
                      <td className="py-2 pr-4">{row.housekeeperName || "—"}</td>
                      <td className="py-2 text-muted-foreground">{row.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Guest requests</h2>
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
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Lost & found</h2>
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
          <h2 className="mb-4 font-semibold">Maintenance</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Open</span>
              <span className="font-medium">{data.maintenance.open}</span>
            </div>
            <div className="flex justify-between">
              <span>Completed</span>
              <span className="font-medium">{data.maintenance.completed}</span>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Laundry</h2>
          <div className="space-y-1">
            {data.laundry.length === 0 ? (
              <p className="text-sm text-muted-foreground">No laundry updated in this period.</p>
            ) : (
              data.laundry.map((batch, index) => (
                <div key={`${batch.itemType}-${index}`} className="flex justify-between text-sm">
                  <span>{batch.itemType}</span>
                  <span className="text-muted-foreground">
                    {batch.status} · {batch.quantity}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
