import { requireAuth } from "@/lib/session";
import { getDashboardStats } from "@/lib/queries";
import { buildAiInsights } from "@/lib/ai";
import { StatCard } from "@/components/stat-card";
import { ChartCard, CleaningProgressChart, MaintenanceChart, RoomStatusChart, MetricChart } from "@/components/charts";
import {
  Users,
  LogIn,
  LogOut,
  Sparkles,
  CheckCircle,
  Ban,
  Wrench,
  ClipboardCheck,
  Zap,
  Crown,
  MessageSquare,
  Bot,
  Upload,
} from "lucide-react";
import { ROLE_LABELS, canAssignHousekeepers } from "@/lib/utils";
import Link from "next/link";
import { UserRole } from "@prisma/client";

export default async function DashboardPage() {
  const session = await requireAuth();
  const [stats, ai] = await Promise.all([
    getDashboardStats(session.user.hotelId),
    buildAiInsights(session.user.hotelId),
  ]);

  const canImport = (
    [
      UserRole.OWNER,
      UserRole.GENERAL_MANAGER,
      UserRole.EXECUTIVE_HOUSEKEEPER,
      UserRole.FRONT_DESK,
    ] as UserRole[]
  ).includes(session.user.role);
  const canAssign = canAssignHousekeepers(session.user.role);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {session.user.name} · {ROLE_LABELS[session.user.role]}
        </p>
      </div>

      {canImport && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 font-semibold text-emerald-950">
                <Upload className="h-5 w-5" />
                Build or update rooms from HK report
              </div>
              <p className="text-sm text-emerald-900">
                First time: build the property room list from Room + Room Type. Daily: update Dirty/Clean without
                adding extra rooms.
              </p>
            </div>
            <Link
              href="/upload?mode=build"
              className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Open report import
            </Link>
          </div>
        </div>
      )}

      {canAssign && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 font-semibold text-indigo-950">
                <Sparkles className="h-5 w-5" />
                Assign rooms to housekeepers
              </div>
              <p className="text-sm text-indigo-900">
                Manually pick who cleans each room, or let AI balance unassigned rooms.
              </p>
            </div>
            <Link
              href="/housekeeping"
              className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800"
            >
              Assign rooms
            </Link>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 font-semibold text-blue-900">
              <Bot className="h-5 w-5" /> AI Insights
            </div>
            <ul className="space-y-1 text-sm text-blue-900">
              {ai.summary.slice(0, 3).map((s, i) => (
                <li key={i}>• {s}</li>
              ))}
            </ul>
          </div>
          <Link href="/ai" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
            Open AI Assistant
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard title="Today's Occupancy" value={`${stats.occupancy}%`} subtitle={`${stats.occupied} of ${stats.totalRooms} rooms`} icon={Users} variant="info" />
        <StatCard title="Today's Arrivals" value={stats.arrivals} icon={LogIn} href="/map?filter=arrival" />
        <StatCard title="Today's Departures" value={stats.departures} icon={LogOut} href="/map?filter=departure" />
        <StatCard title="Vacant Dirty" value={stats.vacantDirty} icon={Sparkles} variant="danger" href="/map?filter=dirty" />
        <StatCard title="Vacant Clean" value={stats.vacantClean} icon={CheckCircle} variant="success" href="/map?filter=clean" />
        <StatCard title="Out of Order" value={stats.outOfOrder} icon={Ban} variant="warning" />
        <StatCard title="Maintenance Tickets" value={stats.maintenanceTickets} icon={Wrench} href="/maintenance" />
        <StatCard title="Inspection Pending" value={stats.inspectionPending} icon={ClipboardCheck} href="/inspection" />
        <StatCard title="Rush Rooms" value={stats.rushRooms} icon={Zap} variant="danger" />
        <StatCard title="VIP Rooms" value={stats.vipRooms} icon={Crown} variant="warning" />
        <StatCard title="Guest Requests" value={stats.guestRequests} icon={MessageSquare} href="/front-desk" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard title="Cleaning Progress">
          <CleaningProgressChart data={stats.charts.cleaningProgress} />
        </ChartCard>
        <ChartCard title="Maintenance Status">
          <MaintenanceChart data={stats.charts.maintenanceStatus} />
        </ChartCard>
        <ChartCard title="Room Status">
          <RoomStatusChart data={stats.charts.roomStatus} />
        </ChartCard>
        <ChartCard title="Average Cleaning Time">
          <MetricChart title="Minutes per room today" value={stats.charts.avgCleaningTime} unit="minutes" />
        </ChartCard>
        <ChartCard title="Inspection Score">
          <MetricChart title="Average pass rate this week" value={stats.charts.inspectionScore} unit="%" />
        </ChartCard>
      </div>
    </div>
  );
}
