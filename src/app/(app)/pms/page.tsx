import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { PmsPanel } from "@/components/pms-panel";
import Link from "next/link";

export default async function PmsPage() {
  const session = await requireAuth([UserRole.OWNER, UserRole.GENERAL_MANAGER]);

  let connections = await prisma.pmsConnection.findMany({
    where: { hotelId: session.user.hotelId },
  });

  // Ensure all providers exist as rows for the UI
  const providers = [
    "SKYTOUCH",
    "SYNXIS",
    "OPERA",
    "CLOUDBEDS",
    "MEWS",
    "STAYNTOUCH",
    "AUTOCLERK",
    "LITTLE_HOTELIER",
  ] as const;
  for (const provider of providers) {
    if (!connections.find((c) => c.provider === provider)) {
      await prisma.pmsConnection.create({
        data: {
          hotelId: session.user.hotelId,
          provider,
          enabled: false,
          propertyId: "",
        },
      });
    }
  }

  connections = await prisma.pmsConnection.findMany({
    where: { hotelId: session.user.hotelId },
    orderBy: { provider: "asc" },
  });

  const logs = await prisma.pmsSyncLog.findMany({
    where: { hotelId: session.user.hotelId },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">PMS Connectors</h1>
        <p className="text-muted-foreground">
          Sync reservations, check-ins/outs, VIP flags, and room status from SkyTouch, SynXis, Opera, Cloudbeds, Mews, and more
        </p>
      </div>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="font-semibold text-emerald-950">No PMS? Build rooms from a housekeeping report</h2>
        <p className="mt-1 text-sm text-emerald-900">
          Upload Room + Room Type once to save your property room list, then use daily status updates without adding
          extra rooms.
        </p>
        <Link
          href="/upload?mode=build"
          className="mt-3 inline-flex rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Build property from report
        </Link>
      </div>

      <PmsPanel
        connections={connections.map((c) => ({
          ...c,
          lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
        }))}
        logs={logs.map((l) => ({
          ...l,
          createdAt: l.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
