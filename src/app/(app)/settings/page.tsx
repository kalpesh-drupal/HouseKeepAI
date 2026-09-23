import { requireAuth } from "@/lib/session";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UsersAdminPanel } from "@/components/users-admin-panel";
import Link from "next/link";
import { NotificationToggle } from "@/components/notification-toggle";
import { ChangePasswordForm } from "@/components/change-password-form";

export default async function SettingsPage() {
  const session = await requireAuth([UserRole.OWNER, UserRole.GENERAL_MANAGER]);
  const [users, rooms, connections] = await Promise.all([
    prisma.user.findMany({
      where: { hotelId: session.user.hotelId },
      select: { id: true, name: true, email: true, role: true, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.room.count({ where: { hotelId: session.user.hotelId } }),
    prisma.pmsConnection.findMany({ where: { hotelId: session.user.hotelId } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Users, roles, notifications, and production readiness</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Staff users</p>
          <p className="text-2xl font-bold">{users.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Rooms</p>
          <p className="text-2xl font-bold">{rooms}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">PMS connectors</p>
          <p className="text-2xl font-bold">{connections.filter((c) => c.enabled).length} enabled</p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your password</h2>
        <ChangePasswordForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Users & Roles</h2>
        <p className="text-sm text-muted-foreground">
          Create staff logins and reset employee passwords. Tell them to sign in at the login page with the new password.
        </p>
        <UsersAdminPanel users={users} />
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 space-y-3">
        <h2 className="font-semibold">Browser notifications</h2>
        <p className="text-sm text-muted-foreground">Get alerts for rush rooms and new guest requests on this device.</p>
        <NotificationToggle />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/pms" className="rounded-2xl border border-border bg-card p-6 hover:bg-muted">
          <h3 className="font-semibold">PMS Connectors</h3>
          <p className="mt-1 text-sm text-muted-foreground">SkyTouch, SynXis, OPERA, Cloudbeds, Mews, and more</p>
        </Link>
        <Link href="/map" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 hover:bg-emerald-100">
          <h3 className="font-semibold text-emerald-950">Edit rooms on hotel map</h3>
          <p className="mt-1 text-sm text-emerald-900">
            Add, remove, or change room numbers and types — the rest of the app for this property follows the map
          </p>
        </Link>
        <Link href="/upload?mode=build" className="rounded-2xl border border-border bg-card p-6 hover:bg-muted">
          <h3 className="font-semibold">Build property from HK report</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload Room + Room Type once to replace your room list in bulk (no PMS)
          </p>
        </Link>
        <Link href="/onboarding" className="rounded-2xl border border-border bg-card p-6 hover:bg-muted">
          <h3 className="font-semibold">Add another hotel</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create a new property + owner account</p>
        </Link>
        <a href="/api/health" className="rounded-2xl border border-border bg-card p-6 hover:bg-muted">
          <h3 className="font-semibold">Health Check</h3>
          <p className="mt-1 text-sm text-muted-foreground">System status JSON endpoint</p>
        </a>
      </div>
    </div>
  );
}
