import { PmsProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PortalPms } from "@/lib/pms/pms-labels";

/**
 * PMS whose portal is enabled and has the latest successful login.
 * Staff labels follow that connection.
 */
export async function activePortalProvider(hotelId: string): Promise<PortalPms> {
  const rows = await prisma.pmsConnection.findMany({
    where: {
      hotelId,
      portalEnabled: true,
      provider: { in: [PmsProvider.SKYTOUCH, PmsProvider.SYNXIS] },
    },
    select: { provider: true, lastSyncAt: true },
  });
  if (!rows.length) return null;
  const loggedIn = rows
    .filter((row) => row.lastSyncAt)
    .sort((a, b) => b.lastSyncAt!.getTime() - a.lastSyncAt!.getTime());
  const chosen = loggedIn[0] ?? rows[0];
  return chosen.provider === PmsProvider.SYNXIS ? "SYNXIS" : "SKYTOUCH";
}
