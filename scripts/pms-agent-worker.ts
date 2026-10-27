/**
 * SkyTouch portal agent for production data — Collect + Mark Clean write-back
 * with Chromium against DATABASE_URL.
 *
 * Local:
 *   npm run pms:agent:loop
 *
 * Hosted (Railway / Fly / Docker):
 *   docker build -f Dockerfile.pms-agent -t housekeep-pms-agent .
 *   See docs/PMS-AGENT.md
 */
import { createServer } from "http";
import { readFileSync, existsSync, appendFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { PrismaClient, PmsProvider, PmsWriteJobStatus } from "@prisma/client";

const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, ".tmp");
const LOG_FILE = path.join(LOG_DIR, "pms-agent.log");
const PID_FILE = path.join(LOG_DIR, "pms-agent.pid");
/** Collect wake interval (write-backs use a faster separate loop). */
const COLLECT_MS = Math.max(15_000, Number(process.env.PMS_AGENT_TICK_MS || 60_000));
/** Mark Clean write-backs — keep this short so SkyTouch updates quickly. */
const WRITE_MS = Math.max(10_000, Number(process.env.PMS_AGENT_WRITE_MS || 30_000));

function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, `${line}\n`);
  } catch {
    // Container filesystems may be read-only for .tmp — stdout is enough.
  }
}

/** Railway healthchecks expect something listening on $PORT. */
function startHealthServer() {
  const port = Number(process.env.PORT || 0);
  if (!port) {
    log("no PORT set — skipping health server (ok for local / pure worker hosts)");
    return;
  }
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  });
  server.listen(port, "0.0.0.0", () => {
    log(`health server listening on 0.0.0.0:${port}`);
  });
  server.on("error", (err) => {
    log(`health server error: ${err instanceof Error ? err.message : String(err)}`);
  });
}

let writeBusy = false;
let collectBusy = false;

async function runWrites() {
  if (writeBusy) {
    log("write tick skipped (previous write still in progress)");
    return;
  }
  writeBusy = true;
  const { processPendingPortalWrites } = await import("../src/lib/pms/portal-write");
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const pending = await prisma.pmsWriteJob.count({
      where: {
        provider: { in: [PmsProvider.SKYTOUCH, PmsProvider.SYNXIS] },
        status: PmsWriteJobStatus.PENDING,
      },
    });
    if (pending > 0) log(`write-back pending=${pending}`);
    const writes = await processPendingPortalWrites();
    if (writes.jobs > 0) {
      log(`write-back jobs=${writes.jobs} updated=${writes.updated} failed=${writes.failed}`);
    }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    writeBusy = false;
  }
}

async function runCollects() {
  if (collectBusy) {
    log("collect tick skipped (previous collect still in progress)");
    return;
  }
  collectBusy = true;
  const { runPortalCollect } = await import("../src/lib/pms/portal-collect");
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const connections = await prisma.pmsConnection.findMany({
      where: {
        portalEnabled: true,
        provider: { in: [PmsProvider.SKYTOUCH, PmsProvider.SYNXIS] },
      },
    });
    log(`collect tick hotels_with_portal=${connections.length}`);
    for (const conn of connections) {
      const intervalMs = Math.max(1, conn.syncIntervalMinutes || 10) * 60 * 1000;
      const due = !conn.lastSyncAt || Date.now() - conn.lastSyncAt.getTime() >= intervalMs;
      if (!due) continue;
      try {
        const result = await runPortalCollect(conn.hotelId, conn.provider);
        log(
          `collect provider=${conn.provider} hotel=${conn.hotelId} updated=${result.imported.updated} created=${result.imported.created} skipped=${result.imported.skipped}`
        );
      } catch (err) {
        log(
          `collect ERROR provider=${conn.provider} hotel=${conn.hotelId} ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    collectBusy = false;
  }
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env"));
  loadEnvFile(path.join(ROOT, ".env.local"));

  log(
    `boot has_DATABASE_URL=${Boolean(process.env.DATABASE_URL)} has_NEXTAUTH_SECRET=${Boolean(process.env.NEXTAUTH_SECRET)} has_PMS_CREDENTIALS_KEY=${Boolean(process.env.PMS_CREDENTIALS_KEY)}`
  );

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required (same production Postgres as Vercel)");
  }
  if (!process.env.PMS_CREDENTIALS_KEY && !process.env.NEXTAUTH_SECRET) {
    throw new Error("Set PMS_CREDENTIALS_KEY or NEXTAUTH_SECRET to decrypt portal passwords");
  }

  try {
    mkdirSync(LOG_DIR, { recursive: true });
    writeFileSync(PID_FILE, String(process.pid));
  } catch {
    // ignore
  }

  startHealthServer();

  log(
    `PMS agent started pid=${process.pid} write=${WRITE_MS / 1000}s collect=${COLLECT_MS / 1000}s docker=${process.env.PLAYWRIGHT_DOCKER || "0"}`
  );

  const safe = (fn: () => Promise<void>, label: string) =>
    fn().catch((err) => log(`${label} ERROR ${err instanceof Error ? err.message : String(err)}`));

  // Writes first and often — Mark Clean should not wait on a long collect.
  await safe(runWrites, "write");
  await safe(runCollects, "collect");

  setInterval(() => {
    void safe(runWrites, "write");
  }, WRITE_MS);
  setInterval(() => {
    void safe(runCollects, "collect");
  }, COLLECT_MS);

  const shutdown = () => {
    log("PMS agent stopping");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
