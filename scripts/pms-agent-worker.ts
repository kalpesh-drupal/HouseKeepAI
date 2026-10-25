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
import { readFileSync, existsSync, appendFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { PrismaClient, PmsProvider } from "@prisma/client";

const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, ".tmp");
const LOG_FILE = path.join(LOG_DIR, "pms-agent.log");
const PID_FILE = path.join(LOG_DIR, "pms-agent.pid");
/** How often to wake up (write-backs every tick; collect respects each hotel interval). */
const TICK_MS = Math.max(15_000, Number(process.env.PMS_AGENT_TICK_MS || 60_000));

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

let busy = false;

async function runOnce() {
  if (busy) {
    log("tick skipped (previous run still in progress)");
    return;
  }
  busy = true;

  const { processPendingSkyTouchWrites } = await import("../src/lib/pms/portal-write");
  const { runPortalCollect } = await import("../src/lib/pms/portal-collect");
  const prisma = new PrismaClient();

  try {
    const writes = await processPendingSkyTouchWrites();
    if (writes.jobs > 0) {
      log(`write-back jobs=${writes.jobs} updated=${writes.updated} failed=${writes.failed}`);
    }

    const connections = await prisma.pmsConnection.findMany({
      where: { portalEnabled: true, provider: PmsProvider.SKYTOUCH },
    });
    for (const conn of connections) {
      const intervalMs = Math.max(1, conn.syncIntervalMinutes || 10) * 60 * 1000;
      const due = !conn.lastSyncAt || Date.now() - conn.lastSyncAt.getTime() >= intervalMs;
      if (!due) continue;
      try {
        const result = await runPortalCollect(conn.hotelId, conn.provider);
        log(
          `collect hotel=${conn.hotelId} updated=${result.imported.updated} created=${result.imported.created} skipped=${result.imported.skipped}`
        );
      } catch (err) {
        log(`collect ERROR hotel=${conn.hotelId} ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    await prisma.$disconnect();
    busy = false;
  }
}

async function main() {
  // Local only — in Docker/Railway, env vars are injected by the platform.
  loadEnvFile(path.join(ROOT, ".env"));
  loadEnvFile(path.join(ROOT, ".env.local"));
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

  log(
    `PMS agent started pid=${process.pid} tick=${TICK_MS / 1000}s docker=${process.env.PLAYWRIGHT_DOCKER || "0"}`
  );

  await runOnce();
  setInterval(() => {
    void runOnce().catch((err) => log(`ERROR ${err instanceof Error ? err.message : String(err)}`));
  }, TICK_MS);

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
