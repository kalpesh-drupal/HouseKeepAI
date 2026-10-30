/**
 * Portal agent — Collect + Mark Clean write-back with Chromium against DATABASE_URL.
 * PMS_AGENT_PROVIDERS=SKYTOUCH|SYNXIS splits workers by PMS.
 * PMS_AGENT_SLOT / PMS_AGENT_SLOTS splits hotels inside one PMS.
 *
 * Local:
 *   npm run pms:agent:loop
 *
 * Hosted (Railway / Fly / Docker):
 *   docker build -f Dockerfile.pms-agent -t housekeep-pms-agent .
 *   See docs/PMS-AGENT.md
 */
import { createServer } from "http";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import os from "os";
import path from "path";
import { PrismaClient, PmsWriteJobStatus } from "@prisma/client";
import { agentLog, recentAgentLogs, shortenAgentError } from "../src/lib/pms/agent-log";
import { agentOwnsHotel, agentProviders, agentSlotLabel } from "../src/lib/pms/agent-fleet";

const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, ".tmp");
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
  agentLog(message);
}

/** Railway healthchecks expect something listening on $PORT. */
function startHealthServer() {
  const port = Number(process.env.PORT || 0);
  if (!port) {
    log("no PORT set — skipping health server (ok for local / pure worker hosts)");
    return;
  }
  const server = createServer((req, res) => {
    const pathName = (req.url || "/").split("?")[0];
    if (pathName === "/logs") {
      const body = recentAgentLogs() || "(no log lines yet)";
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`${body}\n`);
      return;
    }
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

/** One Chrome at a time. A second browser on a small host dies at launch. */
let chromeBusy: "write" | "collect" | null = null;

async function runWrites() {
  if (chromeBusy) {
    log(`write tick skipped (chrome busy: ${chromeBusy})`);
    return;
  }
  chromeBusy = "write";
  const prisma = new PrismaClient();
  try {
    const { processPendingSkyTouchWrites, processPendingSynxisWrites } = await import("../src/lib/pms/portal-write");
    const providers = agentProviders();
    await prisma.$connect();
    const pending = await prisma.pmsWriteJob.count({
      where: {
        provider: { in: providers },
        status: PmsWriteJobStatus.PENDING,
      },
    });
    if (pending > 0) log(`write-back pending=${pending}`);
    const parts = [];
    if (providers.includes("SKYTOUCH")) parts.push(await processPendingSkyTouchWrites());
    if (providers.includes("SYNXIS")) parts.push(await processPendingSynxisWrites());
    const writes = parts.reduce(
      (sum, part) => ({
        jobs: sum.jobs + part.jobs,
        updated: sum.updated + part.updated,
        failed: sum.failed + part.failed,
      }),
      { jobs: 0, updated: 0, failed: 0 }
    );
    if (writes.jobs > 0) {
      log(`write-back jobs=${writes.jobs} updated=${writes.updated} failed=${writes.failed}`);
    }
  } catch (err) {
    log(`write ERROR ${shortenAgentError(err)}`);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    chromeBusy = null;
  }
}

async function runCollects() {
  if (chromeBusy) {
    log(`collect tick skipped (chrome busy: ${chromeBusy})`);
    return;
  }
  chromeBusy = "collect";
  const prisma = new PrismaClient();
  try {
    const { runPortalCollect } = await import("../src/lib/pms/portal-collect");
    await prisma.$connect();
    const providers = agentProviders();
    const connections = await prisma.pmsConnection.findMany({
      where: {
        portalEnabled: true,
        provider: { in: providers },
      },
      orderBy: [{ provider: "asc" }, { hotelId: "asc" }],
    });
    const owned = connections.filter((conn) => agentOwnsHotel(conn.hotelId));
    log(
      `collect tick hotels_with_portal=${connections.length} owned=${owned.length} providers=${providers.join(",") || "none"} slot=${agentSlotLabel()}`
    );
    for (const conn of owned) {
      const intervalMs = Math.max(1, conn.syncIntervalMinutes || 10) * 60 * 1000;
      const due = !conn.lastSyncAt || Date.now() - conn.lastSyncAt.getTime() >= intervalMs;
      if (!due) continue;
      try {
        const result = await runPortalCollect(conn.hotelId, conn.provider);
        log(
          `collect provider=${conn.provider} hotel=${conn.hotelId} updated=${result.imported.updated} created=${result.imported.created} skipped=${result.imported.skipped}`
        );
      } catch (err) {
        log(`collect ERROR provider=${conn.provider} hotel=${conn.hotelId} ${shortenAgentError(err)}`);
      }
    }
  } catch (err) {
    log(`collect ERROR ${shortenAgentError(err)}`);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    chromeBusy = null;
  }
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env"));
  loadEnvFile(path.join(ROOT, ".env.local"));

  const totalMb = Math.round(os.totalmem() / 1024 / 1024);
  const freeMb = Math.round(os.freemem() / 1024 / 1024);
  log(
    `boot has_DATABASE_URL=${Boolean(process.env.DATABASE_URL)} has_NEXTAUTH_SECRET=${Boolean(process.env.NEXTAUTH_SECRET)} has_PMS_CREDENTIALS_KEY=${Boolean(process.env.PMS_CREDENTIALS_KEY)} mem_total_mb=${totalMb} mem_free_mb=${freeMb}`
  );
  if (totalMb < 1500) {
    log("boot WARN memory under 1500 MB. Chrome needs about 2 GB or the browser dies at launch with pthread_create.");
  }

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
    `PMS agent started pid=${process.pid} write=${WRITE_MS / 1000}s collect=${COLLECT_MS / 1000}s docker=${process.env.PLAYWRIGHT_DOCKER || "0"} providers=${agentProviders().join(",") || "none"} slot=${agentSlotLabel()}`
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
