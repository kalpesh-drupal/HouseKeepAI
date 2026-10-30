import { appendFileSync, mkdirSync } from "fs";
import path from "path";

const lines: string[] = [];
const MAX_LINES = 400;
const LOG_FILE = path.join(process.cwd(), ".tmp", "pms-agent.log");

/** One line the operator can read. Chrome dumps stay out of the database. */
export function shortenAgentError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/pthread_create|Resource temporarily unavailable/i.test(raw)) {
    return "Browser failed to start: this server ran out of threads or memory. SkyTouch was not opened. Give the agent about 2 GB RAM and run one Chrome at a time.";
  }
  if (/Target page, context or browser has been closed/i.test(raw) && /launch/i.test(raw)) {
    return "Browser failed to start and closed immediately. SkyTouch was not opened. The agent host needs about 2 GB RAM.";
  }
  if (/Timeout \d+ms exceeded/i.test(raw) && /skytouchhos|Login\.do/i.test(raw)) {
    return "Browser started, but SkyTouch did not send the login page within 60 seconds.";
  }
  const first = raw
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("Call log") && !line.includes("chrome-headless") && !line.startsWith("<")) ;
  return (first || "Portal agent failed").slice(0, 400);
}

export function agentLog(step: string, detail = "") {
  const line = `[${new Date().toISOString()}] ${step}${detail ? ` ${detail}` : ""}`;
  console.log(line);
  lines.push(line);
  if (lines.length > MAX_LINES) lines.shift();
  try {
    mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    appendFileSync(LOG_FILE, `${line}\n`);
  } catch {
    // Railway keeps stdout. The file is a local copy.
  }
}

export function recentAgentLogs() {
  return lines.join("\n");
}

export async function agentStep<T>(step: string, fn: () => Promise<T>): Promise<T> {
  agentLog(`step=${step}`, "start");
  try {
    const value = await fn();
    agentLog(`step=${step}`, "ok");
    return value;
  } catch (err) {
    const brief = shortenAgentError(err);
    agentLog(`step=${step}`, `FAIL ${brief}`);
    throw new Error(`${step}: ${brief}`);
  }
}
