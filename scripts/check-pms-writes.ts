import { PrismaClient, PmsProvider } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const jobs = await p.pmsWriteJob.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  console.log(
    "WRITE_JOBS",
    JSON.stringify(
      jobs.map((j) => ({
        id: j.id,
        provider: j.provider,
        room: j.roomNumber,
        cond: j.condition,
        status: j.status,
        err: j.lastError,
        at: j.createdAt,
        done: j.completedAt,
      })),
      null,
      2
    )
  );

  const conns = await p.pmsConnection.findMany({ where: { provider: PmsProvider.SKYTOUCH } });
  console.log(
    "SKYTOUCH_CONN",
    JSON.stringify(
      conns.map((c) => ({
        hotelId: c.hotelId,
        portalEnabled: c.portalEnabled,
        hasUrl: Boolean(c.portalLoginUrl),
        hasUser: Boolean(c.portalUsername),
        hasPass: Boolean(c.portalPasswordEnc),
        lastSyncAt: c.lastSyncAt,
      })),
      null,
      2
    )
  );

  const logs = await p.pmsSyncLog.findMany({
    where: { action: { in: ["PORTAL_WRITE", "PORTAL_COLLECT"] } },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  console.log(
    "SYNC_LOGS",
    JSON.stringify(
      logs.map((l) => ({
        at: l.createdAt,
        provider: l.provider,
        action: l.action,
        status: l.status,
        msg: l.message,
        records: l.records,
      })),
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
