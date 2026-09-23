import { requireAuth } from "@/lib/session";
import { UserRole } from "@prisma/client";
import { HkUploadForm } from "@/components/hk-upload-form";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const session = await requireAuth([
    UserRole.OWNER,
    UserRole.GENERAL_MANAGER,
    UserRole.EXECUTIVE_HOUSEKEEPER,
    UserRole.FRONT_DESK,
  ]);
  const params = await searchParams;
  const initialMode = params.mode === "build" ? "build" : params.mode === "update" ? "update" : undefined;

  const [housekeepers, roomCount] = await Promise.all([
    prisma.user.findMany({
      where: { hotelId: session.user.hotelId, role: UserRole.HOUSEKEEPER, active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.room.count({ where: { hotelId: session.user.hotelId } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="mb-1 text-sm font-medium text-primary">No PMS required</p>
        <h1 className="text-3xl font-bold">Housekeeping report import</h1>
        <p className="mt-2 text-muted-foreground">
          <strong>Build property</strong> once from your report (saves room numbers + types permanently), then use{" "}
          <strong>Update status</strong> daily without adding extra rooms.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Prefer live sync?{" "}
          <Link href="/pms" className="text-primary underline">
            Connect a PMS instead
          </Link>
        </p>
      </div>
      <HkUploadForm housekeepers={housekeepers} roomCount={roomCount} initialMode={initialMode} />
    </div>
  );
}
