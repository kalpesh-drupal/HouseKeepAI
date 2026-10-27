/**
 * SynXis / SynXis Property Hub — Playwright collect + Mark Clean write-back (no official API yet).
 * Opt-in: hotel enables portal on the PMS page and supplies login (+ optional selectors).
 */
import path from "path";
import { mkdir, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { extractPdfText, printedRoomListToCsv } from "@/lib/pdf-hk";
import { assertPlaywrightHost } from "@/lib/pms/playwright-host";

export type SynxisPortalSelectors = {
  username?: string;
  password?: string;
  submit?: string;
  housekeepingLink?: string;
  boardUrl?: string;
  cleanControl?: string;
  saveButton?: string;
  downloadButton?: string;
};

const DEFAULT_SELECTORS: Required<Omit<SynxisPortalSelectors, "boardUrl">> & { boardUrl: string } = {
  username:
    'input[name="username"], input[name="userName"], input[name="j_username"], input[name="login"], input[type="email"], input[id*="user" i]',
  password: 'input[name="password"], input[name="j_password"], input[type="password"]',
  submit:
    'button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login"), a:has-text("Login")',
  housekeepingLink:
    'a:has-text("Housekeeping"), a:has-text("Room Status"), a:has-text("Room List"), a:has-text("Rooms"), button:has-text("Housekeeping"), a:has-text("Property Hub")',
  boardUrl: "",
  cleanControl:
    'input[type="radio"][value*="clean" i], input[type="radio"][id*="clean" i], label:has-text("Clean"), button:has-text("Clean"), a:has-text("Clean")',
  saveButton:
    'button:has-text("Save"), a:has-text("Save"), input[value*="Save" i], button:has-text("Update"), a:has-text("Update")',
  downloadButton:
    'button:has-text("Export"), a:has-text("Export"), button:has-text("Download"), a:has-text("Download"), button:has-text("PDF"), a:has-text("PDF"), button:has-text("Excel"), a:has-text("CSV"), input[value*="Export" i]',
};

function mergeSelectors(raw?: string | null): typeof DEFAULT_SELECTORS {
  let extra: SynxisPortalSelectors = {};
  if (raw) {
    try {
      extra = JSON.parse(raw) as SynxisPortalSelectors;
    } catch {
      extra = {};
    }
  }
  return { ...DEFAULT_SELECTORS, ...extra };
}

function normalizeLoginUrl(raw: string) {
  const trimmed = raw.trim();
  if (!/^https:\/\//i.test(trimmed)) {
    throw new Error("SynXis portal login URL must start with https://");
  }
  try {
    return new URL(trimmed).toString();
  } catch {
    throw new Error("SynXis portal login URL is not valid");
  }
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error(
      "Playwright is not installed. Run: npm install playwright && npx playwright install chromium"
    );
  }
}

async function launchBrowser(chromium: Awaited<ReturnType<typeof loadPlaywright>>["chromium"]) {
  assertPlaywrightHost();
  const args = ["--disable-dev-shm-usage", "--disable-http2", "--disable-features=IsolateOrigins,site-per-process"];
  const preferBundled =
    process.env.PLAYWRIGHT_DOCKER === "1" || process.env.PLAYWRIGHT_CHROMIUM_ONLY === "1";
  const launchBundled = () => chromium.launch({ headless: true, args });
  if (preferBundled) return launchBundled();
  try {
    return await chromium.launch({ headless: true, channel: "chrome", args });
  } catch {
    return launchBundled();
  }
}

async function loginAndOpenBoard(
  page: import("playwright").Page,
  input: { loginUrl: string; username: string; password: string; selectors: typeof DEFAULT_SELECTORS; timeout: number }
) {
  const loginUrl = normalizeLoginUrl(input.loginUrl);
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: input.timeout });
  const user = page.locator(input.selectors.username).first();
  const pass = page.locator(input.selectors.password).first();
  await user.waitFor({ state: "visible", timeout: 25_000 });
  await user.fill(input.username);
  await pass.fill(input.password);
  const submit = page.locator(input.selectors.submit).first();
  if ((await submit.count()) > 0) {
    await submit.click({ timeout: 8_000 }).catch(() => pass.press("Enter"));
  } else {
    await pass.press("Enter");
  }
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 2000));

  const stillLogin = await page.locator(input.selectors.password).first().isVisible().catch(() => false);
  if (stillLogin) {
    throw new Error(
      "SynXis login failed — check username/password or MFA (portal automation needs password-only login)."
    );
  }

  if (input.selectors.boardUrl?.trim()) {
    const board = input.selectors.boardUrl.trim();
    const target = /^https?:\/\//i.test(board) ? board : new URL(board, loginUrl).toString();
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: input.timeout }).catch(() => undefined);
  } else {
    const hk = page.locator(input.selectors.housekeepingLink).first();
    if ((await hk.count()) > 0) {
      await hk.click({ timeout: 8_000 }).catch(() => undefined);
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
    }
  }
  await new Promise((r) => setTimeout(r, 1500));
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Build SynXis-shaped CSV from scraped room rows. */
function boardRowsToSynxisCsv(
  rows: Array<{
    roomNumber: string;
    roomType?: string;
    housekeeping?: string;
    occupancy?: string;
    guestStatus?: string;
  }>
) {
  const header = "Room,Room Type,Housekeeping Status,Occupancy Status,Guest Status,Check-In,Check-Out,Notes";
  const lines = rows.map((r) =>
    [
      csvEscape(r.roomNumber),
      csvEscape(r.roomType || ""),
      csvEscape(r.housekeeping || "Dirty"),
      csvEscape(r.occupancy || ""),
      csvEscape(r.guestStatus || ""),
      "",
      "",
      "",
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

async function scrapeBoardRows(page: import("playwright").Page) {
  return page.evaluate(() => {
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
    const out: Array<{
      roomNumber: string;
      roomType: string;
      housekeeping: string;
      occupancy: string;
      guestStatus: string;
    }> = [];
    const seen = new Set<string>();

    const pickStatus = (text: string) => {
      const hk = text.match(/\b(Dirty|Clean|Pickup|Inspected|Ready)\b/i)?.[1] || "";
      const occ = text.match(/\b(Occupied|Vacant)\b/i)?.[1] || "";
      const guest =
        text.match(/\b(Stay\s*Overs?|Checked\s*Out|Arrivals?|Arrival|Due\s*Out)\b/i)?.[1] || "";
      return { hk, occ, guest };
    };

    const rows = Array.from(document.querySelectorAll("table tr, [role='row']")) as HTMLElement[];
    for (const tr of rows) {
      const cells = Array.from(tr.querySelectorAll("td, th, [role='cell'], [role='gridcell']")).map((c) =>
        normalize(c.textContent || "")
      );
      if (cells.length < 2) continue;
      if (/^room$/i.test(cells[0]) || /housekeeping/i.test(cells.join(" "))) continue;

      let roomNumber = "";
      let roomType = "";
      for (const cell of cells) {
        if (/^[A-Za-z]{0,3}\d{2,4}[A-Za-z]?$/.test(cell) || /^\d{2,4}$/.test(cell)) {
          roomNumber = cell;
          break;
        }
      }
      if (!roomNumber) {
        const m = normalize(tr.innerText || "").match(/\b([A-Za-z]{0,3}\d{2,4}[A-Za-z]?)\b/);
        if (m) roomNumber = m[1];
      }
      if (!roomNumber || seen.has(roomNumber)) continue;

      const joined = cells.join(" | ");
      const { hk, occ, guest } = pickStatus(joined);
      if (!hk && !occ) continue;

      for (const cell of cells) {
        if (cell !== roomNumber && /^[A-Za-z]{1,4}\d*$/.test(cell) && cell.length <= 6) {
          roomType = cell;
          break;
        }
      }

      seen.add(roomNumber);
      out.push({
        roomNumber,
        roomType,
        housekeeping: hk || "Dirty",
        occupancy: occ,
        guestStatus: guest,
      });
    }

    // Fallback: div-based boards
    if (out.length < 3) {
      const blocks = Array.from(document.querySelectorAll("div, li")) as HTMLElement[];
      for (const el of blocks) {
        const text = normalize(el.innerText || "");
        if (text.length > 220 || text.length < 5) continue;
        const m = text.match(/\b([A-Za-z]{0,3}\d{2,4}[A-Za-z]?)\b/);
        if (!m) continue;
        const roomNumber = m[1];
        if (seen.has(roomNumber)) continue;
        const { hk, occ, guest } = pickStatus(text);
        if (!hk) continue;
        seen.add(roomNumber);
        out.push({
          roomNumber,
          roomType: "",
          housekeeping: hk,
          occupancy: occ,
          guestStatus: guest,
        });
      }
    }

    return out;
  });
}

export type SynxisCollectResult = {
  buffer: Buffer | null;
  filename: string | null;
  mime: string | null;
  boardError?: string;
};

/**
 * Login → open room/HK board → export file if possible, else scrape to SynXis CSV.
 */
export async function collectSynxisHousekeepingReport(input: {
  loginUrl: string;
  username: string;
  password: string;
  selectorsJson?: string | null;
  timeoutMs?: number;
}): Promise<SynxisCollectResult> {
  const selectors = mergeSelectors(input.selectorsJson);
  const timeout = input.timeoutMs ?? 60_000;
  const downloadDir = path.join(tmpdir(), `synxis-hk-${randomUUID()}`);
  await mkdir(downloadDir, { recursive: true });

  const { chromium } = await loadPlaywright();
  const browser = await launchBrowser(chromium);

  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      ignoreHTTPSErrors: true,
      viewport: { width: 1400, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);

    await loginAndOpenBoard(page, {
      loginUrl: input.loginUrl,
      username: input.username,
      password: input.password,
      selectors,
      timeout,
    });

    // 1) Try export / download
    let buffer: Buffer | null = null;
    let filename: string | null = null;
    let mime: string | null = null;
    let boardError: string | undefined;

    try {
      const dlBtn = page.locator(selectors.downloadButton).first();
      if ((await dlBtn.count()) > 0 && (await dlBtn.isVisible().catch(() => false))) {
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 20_000 }).catch(() => null),
          dlBtn.click({ timeout: 8_000 }),
        ]);
        if (download) {
          const suggested = download.suggestedFilename() || `synxis-export-${Date.now()}.bin`;
          const dest = path.join(downloadDir, suggested);
          await download.saveAs(dest);
          buffer = await readFile(dest);
          filename = suggested;
          const lower = suggested.toLowerCase();
          if (lower.endsWith(".pdf")) mime = "application/pdf";
          else if (lower.endsWith(".csv")) mime = "text/csv";
          else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
            mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          } else mime = "application/octet-stream";

          // Prefer SynXis CSV shape when PDF text can be parsed
          if (mime === "application/pdf") {
            try {
              const text = await extractPdfText(buffer);
              const csv = printedRoomListToCsv(text);
              if (csv) {
                buffer = Buffer.from(csv, "utf8");
                filename = `synxis-board-${Date.now()}.csv`;
                mime = "text/csv";
              }
            } catch {
              // keep raw PDF — import-report may still handle it
            }
          }
        }
      }
    } catch (err) {
      boardError = err instanceof Error ? err.message : "Export download failed";
    }

    // 2) Scrape board → CSV if no usable export
    if (!buffer) {
      try {
        let rows: Awaited<ReturnType<typeof scrapeBoardRows>> = [];
        for (let attempt = 0; attempt < 4; attempt++) {
          rows = await scrapeBoardRows(page);
          if (rows.length >= 3) break;
          await new Promise((r) => setTimeout(r, 1200));
        }
        if (rows.length < 3) {
          boardError =
            boardError ||
            `Could not read SynXis room board (parsed ${rows.length} rooms). Set portalSelectors.boardUrl or downloadButton for this hotel.`;
        } else {
          const csv = boardRowsToSynxisCsv(rows);
          buffer = Buffer.from(csv, "utf8");
          filename = `synxis-board-${Date.now()}.csv`;
          mime = "text/csv";
          boardError = undefined;
        }
      } catch (err) {
        boardError = err instanceof Error ? err.message : "SynXis board scrape failed";
      }
    }

    await context.close();

    if (!buffer) {
      throw new Error(boardError || "Logged in to SynXis, but could not collect a room list.");
    }

    return { buffer, filename, mime, boardError };
  } finally {
    await browser.close().catch(() => undefined);
    await rm(downloadDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export type SynxisBoardWriteResult = {
  rooms: Array<{ roomNumber: string; ok: boolean; error?: string }>;
  error?: string;
};

/** Mark Clean write-back: set rooms to Clean on the SynXis board. */
export async function writeSynxisRoomsClean(input: {
  loginUrl: string;
  username: string;
  password: string;
  selectorsJson?: string | null;
  timeoutMs?: number;
  roomNumbers: string[];
}): Promise<SynxisBoardWriteResult> {
  if (!input.roomNumbers.length) return { rooms: [] };

  const selectors = mergeSelectors(input.selectorsJson);
  const timeout = input.timeoutMs ?? 60_000;
  const { chromium } = await loadPlaywright();
  const browser = await launchBrowser(chromium);
  const uniqueRooms = [...new Set(input.roomNumbers.map((r) => r.trim()).filter(Boolean))];
  const results: SynxisBoardWriteResult["rooms"] = [];

  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1400, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);

    await loginAndOpenBoard(page, {
      loginUrl: input.loginUrl,
      username: input.username,
      password: input.password,
      selectors,
      timeout,
    });

    for (const roomNumber of uniqueRooms) {
      try {
        const ok = await page.evaluate(
          ({ room, cleanSel }) => {
            const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
            const want = normalize(room);
            const rows = Array.from(
              document.querySelectorAll("tr, [role='row'], .room-row, li, div")
            ) as HTMLElement[];
            let row: HTMLElement | null = null;
            for (const el of rows) {
              const text = normalize(el.innerText || el.textContent || "");
              if (!text) continue;
              const parts = text.split(/[\s|/]+/);
              if (parts.includes(want) || text.startsWith(want + " ") || text.includes(" " + want + " ")) {
                if (text.length < 400) {
                  row = el;
                  break;
                }
              }
            }
            if (!row) {
              const any = Array.from(document.querySelectorAll("body *")).find((n) => {
                const t = normalize((n as HTMLElement).innerText || "");
                return t === want || t.startsWith(want + "\n");
              }) as HTMLElement | undefined;
              row = any?.closest("tr, [role='row'], li, div") || any || null;
            }
            if (!row) return { ok: false, error: "Room not found on SynXis board" };

            const controls = row.querySelectorAll(cleanSel);
            for (const c of Array.from(controls)) {
              const el = c as HTMLElement;
              if (el instanceof HTMLInputElement && el.type === "radio") {
                el.click();
                el.checked = true;
                el.dispatchEvent(new Event("change", { bubbles: true }));
                return { ok: true };
              }
              el.click();
              return { ok: true };
            }

            const labeled = Array.from(row.querySelectorAll("label, button, a, span")).find((n) =>
              /^\s*clean\s*$/i.test((n.textContent || "").trim())
            ) as HTMLElement | undefined;
            if (labeled) {
              labeled.click();
              return { ok: true };
            }
            return { ok: false, error: "Clean control not found for room" };
          },
          { room: roomNumber, cleanSel: selectors.cleanControl }
        );
        results.push({ roomNumber, ok: Boolean(ok?.ok), error: ok?.ok ? undefined : ok?.error || "Write failed" });
      } catch (err) {
        results.push({
          roomNumber,
          ok: false,
          error: err instanceof Error ? err.message : "Write failed",
        });
      }
    }

    const save = page.locator(selectors.saveButton).first();
    if ((await save.count()) > 0 && results.some((r) => r.ok)) {
      await save.click({ timeout: 8_000 }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 2000));
    }

    return { rooms: results };
  } catch (err) {
    const message = err instanceof Error ? err.message : "SynXis portal write failed";
    return {
      rooms: uniqueRooms.map((roomNumber) => ({ roomNumber, ok: false, error: message })),
      error: message,
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
