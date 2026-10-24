/**
 * Local PMS portal collect scheduler.
 * Hits /api/pms/cron every 10 minutes while this process stays alive.
 *
 * Usage (with the Next app running on :3006):
 *   npm run pms:cron:loop
 */
import { readFileSync, existsSync, appendFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, ".tmp");
const LOG_FILE = path.join(LOG_DIR, "pms-cron.log");
const PID_FILE = path.join(LOG_DIR, "pms-cron.pid");
const INTERVAL_MS = 10 * 60 * 1000;
const BASE_URL = process.env.PMS_CRON_URL || "http://127.0.0.1:3006/api/pms/cron";

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
    // ignore log write failures
  }
}

async function runOnce() {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    log("ERROR: CRON_SECRET is missing in .env / .env.local");
    return;
  }
  const started = Date.now();
  try {
    const res = await fetch(BASE_URL, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(4 * 60 * 1000),
    });
    const text = await res.text();
    const brief = text.length > 500 ? `${text.slice(0, 500)}…` : text;
    log(`HTTP ${res.status} (${Date.now() - started}ms) ${brief}`);
  } catch (err) {
    log(`ERROR ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env"));
  loadEnvFile(path.join(ROOT, ".env.local"));

  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));
  log(`PMS cron worker started pid=${process.pid} every ${INTERVAL_MS / 60000}m → ${BASE_URL}`);

  await runOnce();
  setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);

  const shutdown = () => {
    log("PMS cron worker stopping");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
