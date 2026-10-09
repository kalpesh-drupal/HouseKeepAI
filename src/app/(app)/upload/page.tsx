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

  const [housekeepers, roomCount, hotel] = await Promise.all([
    prisma.user.findMany({
      where: { hotelId: session.user.hotelId, role: UserRole.HOUSEKEEPER, active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.room.count({ where: { hotelId: session.user.hotelId } }),
    prisma.hotel.findUnique({
      where: { id: session.user.hotelId },
      select: { reportPms: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="mb-1 text-sm font-medium text-primary">Match your PMS report</p>
        <h1 className="text-3xl font-bold">Housekeeping report import</h1>
        <p className="mt-2 text-muted-foreground">
          Choose SkyTouch, Choice Advantage, Synxis, or another PMS.{" "}
          <strong>Build property</strong> saves room numbers and types, then <strong>Update status</strong> applies
          that PMS’s housekeeping and guest-stay values.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Prefer live sync?{" "}
          <Link href="/pms" className="text-primary underline">
            Connect a PMS instead
          </Link>
        </p>
      </div>
      <HkUploadForm
        housekeepers={housekeepers}
        roomCount={roomCount}
        initialMode={initialMode}
        currentPms={hotel?.reportPms}
      />
    </div>
  );
}
