/**
 * SynXis / SynXis Property Hub — Playwright write-back (no official API yet).
 * Opt-in only: hotel enables portal on the PMS page and supplies login + selectors.
 *
 * Mark Clean in HouseKeepAI → set room Housekeeping status to Clean in SynXis UI.
 * Selectors vary by property; tune via portalSelectors JSON when defaults fail.
 */
import { assertPlaywrightHost } from "@/lib/pms/playwright-host";

export type SynxisPortalSelectors = {
  username?: string;
  password?: string;
  submit?: string;
  /** Link/button to open housekeeping / room status after login */
  housekeepingLink?: string;
  /** Optional direct URL path or absolute URL to the HK board (opened after login) */
  boardUrl?: string;
  /** CSS for the Clean control inside a room row (fallback heuristics also run) */
  cleanControl?: string;
  saveButton?: string;
};

const DEFAULT_SELECTORS: Required<Omit<SynxisPortalSelectors, "boardUrl">> & { boardUrl: string } = {
  username:
    'input[name="username"], input[name="userName"], input[name="j_username"], input[name="login"], input[type="email"], input[id*="user" i]',
  password: 'input[name="password"], input[name="j_password"], input[type="password"]',
  submit:
    'button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login"), a:has-text("Login")',
  housekeepingLink:
    'a:has-text("Housekeeping"), a:has-text("Room Status"), a:has-text("Rooms"), button:has-text("Housekeeping"), a:has-text("Property Hub")',
  boardUrl: "",
  cleanControl:
    'input[type="radio"][value*="clean" i], input[type="radio"][id*="clean" i], label:has-text("Clean"), button:has-text("Clean"), a:has-text("Clean")',
  saveButton:
    'button:has-text("Save"), a:has-text("Save"), input[value*="Save" i], button:has-text("Update"), a:has-text("Update")',
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

  if (preferBundled) {
    return launchBundled();
  }
  try {
    return await chromium.launch({ headless: true, channel: "chrome", args });
  } catch {
    return launchBundled();
  }
}

export type SynxisBoardWriteResult = {
  rooms: Array<{ roomNumber: string; ok: boolean; error?: string }>;
  error?: string;
};

/**
 * After login, open HK board and set listed rooms to Clean, then Save.
 */
export async function writeSynxisRoomsClean(input: {
  loginUrl: string;
  username: string;
  password: string;
  selectorsJson?: string | null;
  timeoutMs?: number;
  roomNumbers: string[];
}): Promise<SynxisBoardWriteResult> {
  if (!input.roomNumbers.length) return { rooms: [] };

  const loginUrl = normalizeLoginUrl(input.loginUrl);
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

    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout });
    const user = page.locator(selectors.username).first();
    const pass = page.locator(selectors.password).first();
    await user.waitFor({ state: "visible", timeout: 25_000 });
    await user.fill(input.username);
    await pass.fill(input.password);
    const submit = page.locator(selectors.submit).first();
    if ((await submit.count()) > 0) {
      await submit.click({ timeout: 8_000 }).catch(() => pass.press("Enter"));
    } else {
      await pass.press("Enter");
    }
    await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 2000));

    const stillLogin = await page.locator(selectors.password).first().isVisible().catch(() => false);
    if (stillLogin) {
      throw new Error("SynXis login failed — check username/password or MFA (portal write needs password-only login).");
    }

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
              // Prefer compact rows that contain the room number as a token
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

            // Text fallback: click element whose label is Clean inside the row
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
