/**
 * SynXis / SynXis Property Hub — Playwright collect + Mark Clean write-back (no official API yet).
 * Opt-in: hotel enables portal on the PMS page and supplies login (+ optional selectors).
 *
 * MFA: SynXis email OTP + "Remember me" (~3 days). We reuse Playwright storageState when fresh,
 * and only poll IMAP for a new code when the session expired.
 */
import path from "path";
import { mkdir, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import { randomBytes, randomUUID } from "crypto";
import { extractPdfText, printedRoomListToCsv } from "@/lib/pdf-hk";
import { assertPlaywrightHost } from "@/lib/pms/playwright-host";
import { fetchEmailOtp, type ImapOtpConfig } from "@/lib/pms/email-otp";

export type SynxisPortalSelectors = {
  username?: string;
  password?: string;
  submit?: string;
  housekeepingLink?: string;
  boardUrl?: string;
  cleanControl?: string;
  saveButton?: string;
  downloadButton?: string;
  /** Checkbox / control for Remember me (defaults cover common labels). */
  rememberMe?: string;
  /** Input for email / Duo OTP when MFA is shown. */
  otpInput?: string;
  otpSubmit?: string;
  /** Forced password-change form (every ~45 days). */
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
  passwordChangeSubmit?: string;
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
  rememberMe:
    'input[type="checkbox"][name*="remember" i], input[type="checkbox"][id*="remember" i], label:has-text("Remember me") input, label:has-text("Remember") input, input[type="checkbox"][name*="trust" i]',
  otpInput:
    'input[name*="otp" i], input[name*="code" i], input[name*="passcode" i], input[name*="token" i], input[autocomplete="one-time-code"], input[inputmode="numeric"]',
  otpSubmit:
    'button[type="submit"], button:has-text("Verify"), button:has-text("Continue"), button:has-text("Submit"), button:has-text("Confirm"), input[type="submit"]',
  currentPassword:
    'input[name*="old" i][type="password"], input[name*="current" i][type="password"], input[id*="old" i][type="password"], input[id*="current" i][type="password"]',
  newPassword:
    'input[name*="new" i][type="password"], input[id*="new" i][type="password"], input[name*="password1" i], input[autocomplete="new-password"]',
  confirmPassword:
    'input[name*="confirm" i][type="password"], input[id*="confirm" i][type="password"], input[name*="password2" i], input[name*="retype" i][type="password"]',
  passwordChangeSubmit:
    'button:has-text("Change password"), button:has-text("Update password"), button:has-text("Save"), button:has-text("Submit"), button:has-text("Continue"), input[type="submit"]',
};

/** Re-auth a bit before SynXis' typical 3-day remember window. */
export const SYNXIS_SESSION_MAX_AGE_MS = 2.5 * 24 * 60 * 60 * 1000;

export type SynxisAuthOptions = {
  storageStateJson?: string | null;
  storageStateAt?: Date | string | null;
  imap?: ImapOtpConfig | null;
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

function sessionStillFresh(at?: Date | string | null) {
  if (!at) return false;
  const t = at instanceof Date ? at.getTime() : new Date(at).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < SYNXIS_SESSION_MAX_AGE_MS;
}

async function checkRememberMe(page: import("playwright").Page, selectors: typeof DEFAULT_SELECTORS) {
  const box = page.locator(selectors.rememberMe).first();
  if ((await box.count()) === 0) {
    // Click label text if checkbox is nested oddly
    const label = page.getByText(/remember\s*me|trust\s*this\s*device|keep\s*me\s*signed/i).first();
    if ((await label.count()) > 0) {
      await label.click({ timeout: 3_000 }).catch(() => undefined);
    }
    return;
  }
  try {
    if (!(await box.isChecked().catch(() => false))) {
      await box.check({ timeout: 3_000 }).catch(() => box.click({ timeout: 3_000 }));
    }
  } catch {
    // ignore
  }
}

async function pageNeedsLogin(page: import("playwright").Page, selectors: typeof DEFAULT_SELECTORS) {
  if (await pageLooksLikePasswordChange(page, selectors)) return false;
  const passVisible = await page.locator(selectors.password).first().isVisible().catch(() => false);
  if (passVisible) return true;
  const otpVisible = await page.locator(selectors.otpInput).first().isVisible().catch(() => false);
  return otpVisible;
}

async function pageLooksLikePasswordChange(page: import("playwright").Page, selectors: typeof DEFAULT_SELECTORS) {
  const body = ((await page.locator("body").innerText().catch(() => "")) || "").slice(0, 4000);
  if (/password\s+(has\s+)?expir|must\s+(be\s+)?change|change\s+your\s+password|reset\s+your\s+password|password\s+expired|update\s+your\s+password/i.test(body)) {
    return true;
  }
  const pwCount = await page.locator('input[type="password"]').count().catch(() => 0);
  if (pwCount >= 2) {
    const hasNew =
      (await page.locator(selectors.newPassword).count().catch(() => 0)) > 0 ||
      (await page.getByLabel(/new password/i).count().catch(() => 0)) > 0;
    if (hasNew || pwCount >= 3) return true;
  }
  return false;
}

/** Meets common hotel PMS rules: length, upper, lower, digit, symbol. */
export function generateSynxisPortalPassword() {
  const core = randomBytes(9).toString("base64url").replace(/[^a-zA-Z0-9]/g, "x");
  return `Hk!${core}9A`;
}

/**
 * When SynXis forces a password change (~45 days), set a new password and return it
 * so HouseKeepAI can store it encrypted for the next login.
 */
async function completePasswordChangeIfPresent(
  page: import("playwright").Page,
  selectors: typeof DEFAULT_SELECTORS,
  currentPassword: string
): Promise<string | null> {
  if (!(await pageLooksLikePasswordChange(page, selectors))) return null;

  const newPassword = generateSynxisPortalPassword();
  const passwordInputs = page.locator('input[type="password"]');
  const count = await passwordInputs.count();

  const current = page.locator(selectors.currentPassword).first();
  const next = page.locator(selectors.newPassword).first();
  const confirm = page.locator(selectors.confirmPassword).first();

  if ((await current.count()) > 0 && (await next.count()) > 0) {
    await current.fill(currentPassword);
    await next.fill(newPassword);
    if ((await confirm.count()) > 0) await confirm.fill(newPassword);
  } else if (count >= 3) {
    await passwordInputs.nth(0).fill(currentPassword);
    await passwordInputs.nth(1).fill(newPassword);
    await passwordInputs.nth(2).fill(newPassword);
  } else if (count === 2) {
    // Some UIs only ask for new + confirm (current already authenticated)
    await passwordInputs.nth(0).fill(newPassword);
    await passwordInputs.nth(1).fill(newPassword);
  } else {
    throw new Error(
      "SynXis requires a password change, but the change form was not recognized. Update portalSelectors (currentPassword/newPassword/confirmPassword) or change the password manually on the PMS page."
    );
  }

  const submit = page.locator(selectors.passwordChangeSubmit).first();
  if ((await submit.count()) > 0) {
    await submit.click({ timeout: 8_000 }).catch(() => undefined);
  } else {
    await passwordInputs.last().press("Enter").catch(() => undefined);
  }
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 2500));

  if (await pageLooksLikePasswordChange(page, selectors)) {
    throw new Error(
      "SynXis rejected the automatic password change (policy may require a different format). Set a new password in SynXis and save it on the HouseKeepAI PMS page."
    );
  }

  console.info("[synxis-portal] password rotated automatically after SynXis forced change");
  return newPassword;
}

async function completeEmailOtpIfPresent(
  page: import("playwright").Page,
  selectors: typeof DEFAULT_SELECTORS,
  imap: ImapOtpConfig | null | undefined
) {
  const otp = page.locator(selectors.otpInput).first();
  const visible = (await otp.count()) > 0 && (await otp.isVisible().catch(() => false));
  if (!visible) return;

  if (!imap?.host || !imap.user || !imap.password) {
    throw new Error(
      "SynXis asked for an email verification code, but IMAP is not configured. Add the bot inbox on the PMS SynXis portal settings."
    );
  }

  // Small delay so the email can leave SynXis/Duo before we poll
  await new Promise((r) => setTimeout(r, 3000));
  const code = await fetchEmailOtp(imap);
  await otp.fill(code);
  await checkRememberMe(page, selectors);
  const submit = page.locator(selectors.otpSubmit).first();
  if ((await submit.count()) > 0) {
    await submit.click({ timeout: 8_000 }).catch(() => otp.press("Enter"));
  } else {
    await otp.press("Enter");
  }
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 2000));
}

async function openHousekeepingBoard(
  page: import("playwright").Page,
  loginUrl: string,
  selectors: typeof DEFAULT_SELECTORS,
  timeout: number
) {
  if (selectors.boardUrl?.trim()) {
    const board = selectors.boardUrl.trim();
    const target = /^https?:\/\//i.test(board) ? board : new URL(board, loginUrl).toString();
    await page.goto(target, { waitUntil: "domcontentloaded", timeout }).catch(() => undefined);
  } else {
    const hk = page.locator(selectors.housekeepingLink).first();
    if ((await hk.count()) > 0) {
      await hk.click({ timeout: 8_000 }).catch(() => undefined);
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
    }
  }
  await new Promise((r) => setTimeout(r, 1500));
}

type SynxisSessionResult = {
  storageStateJson: string;
  /** Set when SynXis forced a password change and we rotated it. */
  rotatedPassword?: string | null;
};

/**
 * Establish a SynXis browser session: reuse Remember-me cookies when fresh,
 * otherwise password login + email OTP (IMAP) + Remember me + forced password change.
 */
async function ensureSynxisSession(
  context: import("playwright").BrowserContext,
  page: import("playwright").Page,
  input: {
    loginUrl: string;
    username: string;
    password: string;
    selectors: typeof DEFAULT_SELECTORS;
    timeout: number;
    auth?: SynxisAuthOptions | null;
  }
): Promise<SynxisSessionResult> {
  const loginUrl = normalizeLoginUrl(input.loginUrl);
  let password = input.password;
  let rotatedPassword: string | null = null;

  // Try saved session first
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: input.timeout }).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 1000));

  if (!(await pageNeedsLogin(page, input.selectors))) {
    const rotated = await completePasswordChangeIfPresent(page, input.selectors, password);
    if (rotated) {
      rotatedPassword = rotated;
      password = rotated;
    }
    await openHousekeepingBoard(page, loginUrl, input.selectors, input.timeout);
    if (!(await pageNeedsLogin(page, input.selectors)) && !(await pageLooksLikePasswordChange(page, input.selectors))) {
      return {
        storageStateJson: JSON.stringify(await context.storageState()),
        rotatedPassword,
      };
    }
  }

  // Full login
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: input.timeout });
  const user = page.locator(input.selectors.username).first();
  const pass = page.locator(input.selectors.password).first();
  await user.waitFor({ state: "visible", timeout: 25_000 });
  await user.fill(input.username);
  await pass.fill(password);
  await checkRememberMe(page, input.selectors);

  const submit = page.locator(input.selectors.submit).first();
  if ((await submit.count()) > 0) {
    await submit.click({ timeout: 8_000 }).catch(() => pass.press("Enter"));
  } else {
    await pass.press("Enter");
  }
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 2000));

  await completeEmailOtpIfPresent(page, input.selectors, input.auth?.imap);
  await checkRememberMe(page, input.selectors);

  if (await pageNeedsLogin(page, input.selectors)) {
    await completeEmailOtpIfPresent(page, input.selectors, input.auth?.imap);
  }

  const rotated = await completePasswordChangeIfPresent(page, input.selectors, password);
  if (rotated) {
    rotatedPassword = rotated;
    password = rotated;
  }

  if (
    (await page.locator(input.selectors.password).first().isVisible().catch(() => false)) &&
    !(await pageLooksLikePasswordChange(page, input.selectors))
  ) {
    throw new Error(
      "SynXis login failed after password/OTP. Check credentials, IMAP inbox for the code, and Remember me."
    );
  }

  await openHousekeepingBoard(page, loginUrl, input.selectors, input.timeout);
  return {
    storageStateJson: JSON.stringify(await context.storageState()),
    rotatedPassword,
  };
}

function parseStorageState(json?: string | null): import("playwright").BrowserContextOptions["storageState"] | undefined {
  if (!json?.trim()) return undefined;
  try {
    return JSON.parse(json) as import("playwright").BrowserContextOptions["storageState"];
  } catch {
    return undefined;
  }
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
  /** Persist this encrypted on PmsConnection for Remember-me reuse. */
  storageStateJson?: string | null;
  /** New portal password if SynXis forced a ~45-day change and we rotated it. */
  rotatedPassword?: string | null;
};

/**
 * Login (session or email OTP) → open room/HK board → export or scrape to SynXis CSV.
 */
export async function collectSynxisHousekeepingReport(input: {
  loginUrl: string;
  username: string;
  password: string;
  selectorsJson?: string | null;
  timeoutMs?: number;
  auth?: SynxisAuthOptions | null;
}): Promise<SynxisCollectResult> {
  const selectors = mergeSelectors(input.selectorsJson);
  const timeout = input.timeoutMs ?? 60_000;
  const downloadDir = path.join(tmpdir(), `synxis-hk-${randomUUID()}`);
  await mkdir(downloadDir, { recursive: true });

  const { chromium } = await loadPlaywright();
  const browser = await launchBrowser(chromium);
  let storageStateJson: string | null = null;
  let rotatedPassword: string | null = null;

  try {
    const useSession =
      sessionStillFresh(input.auth?.storageStateAt) && Boolean(input.auth?.storageStateJson?.trim());
    const context = await browser.newContext({
      acceptDownloads: true,
      ignoreHTTPSErrors: true,
      viewport: { width: 1400, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ...(useSession ? { storageState: parseStorageState(input.auth?.storageStateJson) } : {}),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);

    const session = await ensureSynxisSession(context, page, {
      loginUrl: input.loginUrl,
      username: input.username,
      password: input.password,
      selectors,
      timeout,
      auth: input.auth,
    });
    storageStateJson = session.storageStateJson;
    rotatedPassword = session.rotatedPassword || null;

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

    return { buffer, filename, mime, boardError, storageStateJson, rotatedPassword };
  } finally {
    await browser.close().catch(() => undefined);
    await rm(downloadDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export type SynxisBoardWriteResult = {
  rooms: Array<{ roomNumber: string; ok: boolean; error?: string }>;
  error?: string;
  storageStateJson?: string | null;
  rotatedPassword?: string | null;
};

/** Mark Clean write-back: set rooms to Clean on the SynXis board. */
export async function writeSynxisRoomsClean(input: {
  loginUrl: string;
  username: string;
  password: string;
  selectorsJson?: string | null;
  timeoutMs?: number;
  roomNumbers: string[];
  auth?: SynxisAuthOptions | null;
}): Promise<SynxisBoardWriteResult> {
  if (!input.roomNumbers.length) return { rooms: [] };

  const selectors = mergeSelectors(input.selectorsJson);
  const timeout = input.timeoutMs ?? 60_000;
  const { chromium } = await loadPlaywright();
  const browser = await launchBrowser(chromium);
  const uniqueRooms = [...new Set(input.roomNumbers.map((r) => r.trim()).filter(Boolean))];
  const results: SynxisBoardWriteResult["rooms"] = [];
  let storageStateJson: string | null = null;
  let rotatedPassword: string | null = null;

  try {
    const useSession =
      sessionStillFresh(input.auth?.storageStateAt) && Boolean(input.auth?.storageStateJson?.trim());
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1400, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ...(useSession ? { storageState: parseStorageState(input.auth?.storageStateJson) } : {}),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);

    const session = await ensureSynxisSession(context, page, {
      loginUrl: input.loginUrl,
      username: input.username,
      password: input.password,
      selectors,
      timeout,
      auth: input.auth,
    });
    storageStateJson = session.storageStateJson;
    rotatedPassword = session.rotatedPassword || null;

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

    return { rooms: results, storageStateJson, rotatedPassword };
  } catch (err) {
    const message = err instanceof Error ? err.message : "SynXis portal write failed";
    return {
      rooms: uniqueRooms.map((roomNumber) => ({ roomNumber, ok: false, error: message })),
      error: message,
      storageStateJson,
      rotatedPassword,
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
