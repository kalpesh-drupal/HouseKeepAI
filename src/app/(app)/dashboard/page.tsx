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
  BedDouble,
  DollarSign,
  Home,
  DoorOpen,
} from "lucide-react";
import { ROLE_LABELS, canAssignHousekeepers } from "@/lib/utils";
import { formatFlashCollectedAt } from "@/lib/pms/flash-stats";
import Link from "next/link";
import { UserRole } from "@prisma/client";

function flashValue(value: number | null | undefined, suffix = "") {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value}${suffix}`;
}

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
  const flash = stats.pmsFlash;
  const flashAt = formatFlashCollectedAt(flash?.collectedAt || stats.pmsFlashAt?.toISOString());

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {session.user.name} · {ROLE_LABELS[session.user.role]}
        </p>
      </div>

      {flash && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold">Today from SkyTouch</h2>
              <p className="text-sm text-muted-foreground">
                Home page flash stats{flashAt ? ` · collected ${flashAt}` : ""}
                {" · "}
                <Link href="/pms" className="underline underline-offset-2 hover:text-foreground">
                  Collect again
                </Link>
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard
              title="Today's Occupancy"
              value={flashValue(flash.occupancyPercent, "%")}
              icon={Users}
              variant="info"
            />
            <StatCard
              title="Expected ADR"
              value={flash.expectedAdr != null ? `$${flash.expectedAdr.toFixed(2)}` : "—"}
              icon={DollarSign}
            />
            <StatCard title="Total Arrivals" value={flashValue(flash.totalArrivals)} icon={LogIn} />
            <StatCard
              title="Check-ins Completed"
              value={flashValue(flash.checkInsCompleted)}
              icon={CheckCircle}
              variant="success"
            />
            <StatCard
              title="Check-ins Remaining"
              value={flashValue(flash.checkInsRemaining ?? flash.checkIns)}
              icon={ClipboardCheck}
              variant="warning"
            />
            <StatCard title="Departures" value={flashValue(flash.totalDepartures)} icon={LogOut} />
            <StatCard title="Stayovers" value={flashValue(flash.stayovers)} icon={BedDouble} />
            <StatCard title="Vacant" value={flashValue(flash.vacant)} icon={DoorOpen} />
            <StatCard
              title="Available"
              value={flashValue(flash.totalRoomsAvailable ?? flash.available)}
              icon={Home}
            />
            <StatCard
              title="Vacant / Dirty Remaining"
              value={flashValue(flash.vacantDirtyRemaining)}
              icon={Sparkles}
              variant="danger"
            />
            <StatCard title="Out of Order" value={flashValue(flash.ooo)} icon={Ban} variant="warning" />
          </div>
        </section>
      )}

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
        {/* Prefer SkyTouch Home flash when the same metric is already shown above. */}
        {flash?.occupancyPercent == null && (
          <StatCard
            title="Today's Occupancy"
            value={`${stats.occupancy}%`}
            subtitle={`${stats.occupied} of ${stats.totalRooms} rooms`}
            icon={Users}
            variant="info"
          />
        )}
        {flash?.totalArrivals == null && (
          <StatCard title="Today's Arrivals" value={stats.arrivals} icon={LogIn} href="/map?filter=arrival" />
        )}
        {flash?.totalDepartures == null && (
          <StatCard title="Today's Departures" value={stats.departures} icon={LogOut} href="/map?filter=departure" />
        )}
        {flash?.vacantDirtyRemaining == null && (
          <StatCard title="Dirty" value={stats.vacantDirty} icon={Sparkles} variant="danger" href="/map?filter=dirty" />
        )}
        <StatCard title="Clean" value={stats.vacantClean} icon={CheckCircle} variant="success" href="/map?filter=clean" />
        {flash?.ooo == null && (
          <StatCard title="Out of Order" value={stats.outOfOrder} icon={Ban} variant="warning" />
        )}
        <StatCard title="Maintenance Tickets" value={stats.maintenanceTickets} icon={Wrench} href="/maintenance" />
        <StatCard title="Ready to inspect" value={stats.inspectionPending} icon={ClipboardCheck} href="/inspection" />
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
