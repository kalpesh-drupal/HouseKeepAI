import path from "path";
import { mkdir, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { housekeepingCheckOffToCsv } from "@/lib/pdf-hk";
import type { PmsFlashStats } from "@/lib/pms/flash-stats";
import { agentLog, agentStep, shortenAgentError } from "@/lib/pms/agent-log";
import { assertPlaywrightHost, playwrightLaunchExtras } from "@/lib/pms/playwright-host";

export type PortalSelectors = {
  username?: string;
  password?: string;
  submit?: string;
  reportsLink?: string;
  housekeepingLink?: string;
  downloadButton?: string;
};

export type PortalCollectResult = {
  buffer: Buffer | null;
  filename: string | null;
  mime: string | null;
  flash: PmsFlashStats | null;
  boardError?: string;
};

const DEFAULT_SELECTORS: Required<PortalSelectors> = {
  username:
    'input[name="username"], input[name="userName"], input[name="j_username"], input[name="login"], input[name="userId"], input[type="email"], input[id*="user" i], input[placeholder*="user" i], input[placeholder*="User" i]',
  password: 'input[name="password"], input[name="j_password"], input[type="password"]',
  submit:
    'button[type="submit"], input[type="submit"], input[type="image"], input[name="submit"], input[name="login"], input[id*="login" i], input[value*="Log" i], input[value*="Sign" i], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login"), a:has-text("Login"), a:has-text("Log in"), a:has-text("Sign in"), [onclick*="login" i], [onclick*="Login" i]',
  reportsLink: 'a:has-text("Reports"), a:has-text("Report"), a:has-text("Enterprise Reporting")',
  housekeepingLink:
    'a:has-text("Housekeeping Center"), a:has-text("Housekeeping"), a:has-text("Check-off"), a:has-text("Check Off"), a:has-text("Housekeeping Check-off")',
  downloadButton:
    'button:has-text("Export"), button:has-text("Download"), a:has-text("Export"), a:has-text("Download"), button:has-text("PDF"), a:has-text("PDF"), input[value*="Export" i], input[value*="Download" i]',
};

function mergeSelectors(raw?: string | null): Required<PortalSelectors> {
  let extra: PortalSelectors = {};
  if (raw) {
    try {
      extra = JSON.parse(raw) as PortalSelectors;
    } catch {
      extra = {};
    }
  }
  return { ...DEFAULT_SELECTORS, ...extra };
}

/**
 * SkyTouch often redirects Login.do → ContinueLogin.do, which can hang forever on GET.
 * Always start from a clean login entry URL.
 */
export function normalizeSkyTouchLoginUrl(raw: string) {
  const trimmed = raw.trim();
  if (!/^https:\/\//i.test(trimmed)) {
    throw new Error("Portal login URL must start with https://");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Portal login URL is not valid");
  }

  const pathName = url.pathname.toLowerCase();
  if (pathName.includes("continuelogin") || pathName.includes("logout") || pathName.endsWith("/pms") || pathName.endsWith("/pms/")) {
    url.pathname = "/pms/Login.do";
    url.search = "cleanSession=true";
    url.hash = "";
    return url.toString();
  }
  if (pathName.includes("login.do") && !url.searchParams.has("cleanSession")) {
    url.searchParams.set("cleanSession", "true");
  }
  return url.toString();
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

type DomRoot = import("playwright").Page | import("playwright").Frame;

async function firstVisible(candidates: import("playwright").Locator[]) {
  for (const candidate of candidates) {
    const target = candidate.first();
    try {
      if ((await target.count()) === 0) continue;
      if (!(await target.isVisible().catch(() => false))) continue;
      return target;
    } catch {
      // try next
    }
  }
  return null;
}

async function clickFirstMatching(candidates: import("playwright").Locator[]) {
  const target = await firstVisible(candidates);
  if (!target) return false;
  try {
    await target.click({ timeout: 8_000 });
    return true;
  } catch {
    return false;
  }
}

async function clickLoginControl(page: import("playwright").Page, submitSelector: string) {
  const candidates = [
    page.getByRole("button", { name: /^\s*log\s*in\s*$/i }),
    page.getByRole("button", { name: /^\s*login\s*$/i }),
    page.getByRole("link", { name: /^\s*log\s*in\s*$/i }),
    page.getByRole("link", { name: /^\s*login\s*$/i }),
    page.getByText(/^\s*login\s*$/i),
    page.getByText(/^\s*log\s*in\s*$/i),
    page.locator(submitSelector),
  ];

  for (const candidate of candidates) {
    const target = candidate.first();
    try {
      if ((await target.count()) === 0) continue;
      if (!(await target.isVisible().catch(() => false))) continue;
      await target.click({ timeout: 8_000 });
      return true;
    } catch {
      // try next candidate
    }
  }

  // Last resort: click whatever visible control literally says Login.
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll("button, a, input, div, span")];
    const login = nodes.find((el) => {
      const label = (
        (el as HTMLInputElement).value ||
        el.getAttribute("aria-label") ||
        el.textContent ||
        ""
      )
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (label !== "login" && label !== "log in") return false;
      const style = window.getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none";
    }) as HTMLElement | undefined;
    if (!login) return false;
    login.click();
    return true;
  });
}

async function submitSkyTouchLogin(
  page: import("playwright").Page,
  passwordField: import("playwright").Locator,
  submitSelector: string
) {
  // Give the page a beat after filling credentials.
  await new Promise((resolve) => setTimeout(resolve, 400));

  if (await clickLoginControl(page, submitSelector)) return;

  try {
    await passwordField.press("Enter");
    return;
  } catch {
    // fall through
  }

  const submitted = await page.evaluate(() => {
    const pwd =
      document.querySelector<HTMLInputElement>('input[type="password"]') ||
      document.querySelector<HTMLInputElement>('input[name="password"]');
    const form = pwd?.form || document.querySelector("form");
    if (!form) return false;
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return true;
    }
    form.submit();
    return true;
  });

  if (!submitted) {
    throw new Error(
      `Found the username/password fields on ${page.url()}, but could not click the Login button. Try again, or set portalSelectors.submit to that button's selector.`
    );
  }
}

async function launchBrowser(chromium: Awaited<ReturnType<typeof loadPlaywright>>["chromium"]) {
  assertPlaywrightHost();
  const args = ["--disable-dev-shm-usage", "--disable-http2", "--disable-features=IsolateOrigins,site-per-process"];
  const extras = playwrightLaunchExtras();
  // Docker / hosted agent: use Playwright's bundled Chromium (channel "chrome" is for local Macs).
  const preferBundled =
    process.env.PLAYWRIGHT_DOCKER === "1" || process.env.PLAYWRIGHT_CHROMIUM_ONLY === "1";

  const launchBundled = () => chromium.launch({ ...extras, args });

  if (preferBundled) {
    try {
      return await launchBundled();
    } catch (err) {
      agentLog("step=browser-launch", `FAIL ${shortenAgentError(err)}`);
      throw new Error(`browser-launch: ${shortenAgentError(err)}`);
    }
  }

  try {
    return await chromium.launch({
      ...extras,
      channel: "chrome",
      args,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Executable doesn't exist|browserType\.launch/i.test(message)) {
      throw new Error(
        "Playwright Chromium is not installed on this machine. Run: npx playwright install chromium"
      );
    }
    try {
      return await launchBundled();
    } catch (fallbackErr) {
      const fallback = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(
        `Could not start Chromium for SkyTouch portal automation (${fallback}). ` +
          `On a normal server/Mac run: npx playwright install chromium`
      );
    }
  }
}

const CHECK_OFF_LIST = /^\s*housekeeping check-?\s*off list\s*$/i;

function rootsOf(page: import("playwright").Page): DomRoot[] {
  return [page, ...page.frames()];
}

/** Click the Housekeeping Check-Off List row. A single click, then Submit runs it. */
async function clickHousekeepingCheckOffList(page: import("playwright").Page) {
  for (const root of rootsOf(page)) {
    const clicked = await clickFirstMatching([
      root.getByRole("link", { name: CHECK_OFF_LIST }),
      root.getByRole("button", { name: CHECK_OFF_LIST }),
      root.getByRole("treeitem", { name: CHECK_OFF_LIST }),
      root.getByRole("option", { name: CHECK_OFF_LIST }),
      root.getByRole("row", { name: CHECK_OFF_LIST }),
      root.locator("a, button, option, td, span, li").filter({ hasText: CHECK_OFF_LIST }),
    ]);
    if (clicked) return true;
  }
  return false;
}

/** SkyTouch report criteria pages run when Submit is clicked. */
async function clickReportSubmit(page: import("playwright").Page) {
  for (const root of rootsOf(page)) {
    const clicked = await clickFirstMatching([
      root.getByRole("button", { name: /^\s*submit\s*$/i }),
      root.locator('input[type="submit"][value="Submit" i], input[name="submit"][value="Submit" i]'),
      root.locator('input[type="submit"], button').filter({ hasText: /^\s*submit\s*$/i }),
      root.getByText(/^\s*submit\s*$/i),
    ]);
    if (clicked) return true;
  }
  return false;
}

async function countRoomNumberHits(page: import("playwright").Page) {
  const roots: DomRoot[] = [page, ...page.frames()];
  let best = 0;
  for (const root of roots) {
    const count = await root
      .evaluate(() => {
        const text = document.body?.innerText || "";
        const rooms = text.match(/\b\d{3,4}\b/g) || [];
        return new Set(rooms).size;
      })
      .catch(() => 0);
    if (count > best) best = count;
  }
  return best;
}

async function openHousekeepingCenter(page: import("playwright").Page, selectors: Required<PortalSelectors>) {
  // Already on HK Center after login — still click through in case the board is lazy-loaded.
  const opened = await clickFirstMatching([
    page.getByRole("link", { name: /housekeeping center/i }),
    page.getByRole("button", { name: /housekeeping center/i }),
    page.getByText(/^\s*housekeeping center\s*$/i),
    page.getByRole("link", { name: /^\s*housekeeping\s*$/i }),
    page.locator(selectors.housekeepingLink),
  ]);
  if (!opened) {
    for (const frame of page.frames()) {
      const ok = await clickFirstMatching([
        frame.getByRole("link", { name: /housekeeping center/i }),
        frame.getByRole("button", { name: /housekeeping center/i }),
        frame.getByText(/^\s*housekeeping center\s*$/i),
        frame.getByRole("link", { name: /^\s*housekeeping\s*$/i }),
      ]);
      if (ok) break;
    }
  }

  // Some SkyTouch layouts need a direct init URL when the shell menu is all that loaded.
  if (!/housekeepingcenter/i.test(page.url())) {
    const target = new URL(page.url());
    target.pathname = "/pms/HousekeepingCenter_start.init";
    target.search = "";
    target.hash = "";
    await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
  }

  // Floor / all-rooms controls often unlock the tile grid.
  await clickFirstMatching([
    page.getByRole("button", { name: /all\s*(floors?|rooms?)/i }),
    page.getByRole("link", { name: /all\s*(floors?|rooms?)/i }),
    page.getByText(/^\s*all\s*(floors?|rooms?)\s*$/i),
    page.locator('select').filter({ hasText: /floor|all/i }).first(),
  ]).catch(() => false);

  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

  // Wait specifically for the Update Room Condition grid (not just nav chrome).
  for (let i = 0; i < 20; i++) {
    const ready = await page
      .evaluate(() => {
        const rows = document.querySelectorAll(
          "#updateRoomConditionDataTable tr[index], a[onclick*='showHistoricalRoomCondition']"
        ).length;
        if (rows >= 3) return rows;
        for (const frame of Array.from(window.frames)) {
          try {
            const doc = frame.document;
            if (!doc) continue;
            const nested = doc.querySelectorAll(
              "#updateRoomConditionDataTable tr[index], a[onclick*='showHistoricalRoomCondition']"
            ).length;
            if (nested >= 3) return nested;
          } catch {
            // cross-origin
          }
        }
        return 0;
      })
      .catch(() => 0);
    if (ready >= 3) break;
    // Also poll Playwright frames (more reliable than window.frames).
    let frameRows = 0;
    for (const frame of page.frames()) {
      frameRows = Math.max(
        frameRows,
        await frame
          .locator("#updateRoomConditionDataTable tr[index], a[onclick*='showHistoricalRoomCondition']")
          .count()
          .catch(() => 0)
      );
    }
    if (frameRows >= 3) break;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}

async function openSkyTouchCheckOffReport(
  page: import("playwright").Page,
  context: import("playwright").BrowserContext,
  selectors: Required<PortalSelectors>
) {
  if (!/report/i.test(page.url())) {
    await clickFirstMatching([
      page.getByRole("link", { name: /enterprise reporting|^reports?$/i }),
      page.getByText(/enterprise reporting/i),
      page.getByText(/^\s*reports?\s*$/i),
      page.locator(selectors.reportsLink),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  let reportPopup: import("playwright").Page | null = null;
  const onPopup = (next: import("playwright").Page) => {
    reportPopup = next;
  };
  context.on("page", onPopup);
  try {
    const picked = await clickHousekeepingCheckOffList(page);
    console.info("check-off: list-clicked", picked, page.url());
    await new Promise((resolve) => setTimeout(resolve, 800));
    const criteria = reportPopup ?? page;
    const submitted = await clickReportSubmit(criteria);
    console.info("check-off: submit-clicked", submitted, criteria.url());
    const started = Date.now();
    while (Date.now() - started < 20_000) {
      const candidate = reportPopup ?? criteria;
      await candidate.waitForLoadState("domcontentloaded", { timeout: 2_000 }).catch(() => undefined);
      const text = await readCheckOffTextFromContext(context, candidate);
      const csv = text ? housekeepingCheckOffToCsv(text) : null;
      const rooms = csv ? csv.split(/\n/).filter((line) => /^\d{3,4},/.test(line)).length : 0;
      if (rooms >= 3) return candidate;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    return reportPopup ?? criteria;
  } finally {
    context.off("page", onPopup);
  }
}

type BoardRoom = {
  roomNumber: string;
  status: string;
  guestStatus: string;
  notes: string;
};

function reportTextLooksUseful(text: string) {
  const roomHits = text.match(/\b\d{3,4}\b/g) || [];
  return (
    /housekeeping check-?off/i.test(text) ||
    (/dirty|ready|vac|occ|stay/i.test(text) && roomHits.length >= 5)
  );
}

async function extractOnScreenReportText(root: DomRoot) {
  const tableText = await root
    .evaluate(() => {
      const lines: string[] = [];
      for (const table of Array.from(document.querySelectorAll("table"))) {
        for (const tr of Array.from(table.querySelectorAll("tr"))) {
          const cells = Array.from(tr.querySelectorAll("th,td"))
            .map((cell) => (cell.textContent || "").replace(/\s+/g, " ").trim())
            .filter(Boolean);
          if (cells.length >= 2) lines.push(cells.join("\t"));
        }
      }
      return lines.join("\n");
    })
    .catch(() => "");

  const bodyText = (await root.locator("body").innerText().catch(() => "")).trim();
  return [tableText, bodyText].filter(Boolean).join("\n").trim();
}

function normalizeBoardStatus(raw: string) {
  const value = raw.toLowerCase().replace(/[_-]+/g, " ");
  // Prefer clean/ready over dirty when both somehow appear in a short tile / CSS class.
  if (/\b(ooo|out\s*of\s*order)\b/.test(value)) return "Out of Order";
  if (/\b(maintenance)\b/.test(value)) return "Maintenance";
  if (/\b(ready|clean|inspected|vacant\s*clean|vc)\b/.test(value) || /\b(status|hk|room)\s*(ready|clean|vc)\b/.test(value))
    return "Ready";
  if (/\b(dirty|vacant\s*dirty|vd)\b/.test(value) || /\b(status|hk|room)\s*(dirty|vd)\b/.test(value)) return "Dirty";
  // Compact CSS tokens: roomDirty, is-clean, hk_ready, etc.
  if (/(^|[^a-z])(ready|clean|inspected|vc)([^a-z]|$)/i.test(raw)) return "Ready";
  if (/(^|[^a-z])(dirty|vd)([^a-z]|$)/i.test(raw)) return "Dirty";
  return "";
}

function normalizeGuestStatus(raw: string) {
  const value = raw.toLowerCase().replace(/[_-]+/g, " ");
  // Use word boundaries so page legends don't mark every room occupied.
  if (/\b(stayover|stay)\b/.test(value)) return "Stayover";
  if (/\b(departing|departure|c\/o|checked\s*out)\b/.test(value)) return "Departing";
  if (/\b(arriving|arrival)\b/.test(value)) return "Arriving";
  if (/\bocc\b|\boccupied\b|\bod\b|\boc\b/.test(value) && !/\bvac\b|\bvacant\b|\bvd\b|\bvc\b/.test(value))
    return "Occupied";
  if (/\bvac\b|\bvacant\b|\bvd\b|\bvc\b/.test(value)) return "Vacant";
  if (/(^|[^a-z])(occupied|occ)([^a-z]|$)/i.test(raw)) return "Occupied";
  if (/(^|[^a-z])(vacant|vac)([^a-z]|$)/i.test(raw)) return "Vacant";
  return "";
}

function occupancyFromGuest(guestStatus: string) {
  if (/\b(stayover|occupied|departing|arriving)\b/i.test(guestStatus)) return "Occupied";
  return "Vacant";
}

async function extractHousekeepingCenterBoard(root: DomRoot): Promise<BoardRoom[]> {
  // SkyTouch "Update Room Condition" table: each row shows Ready/CLEAN/DIRTY as
  // always-visible buttons. Only the selected control is marked (GreenFake/RedFake)
  // or encoded on .UBcontainer[tablesort_sortvalue=R|C|D].
  const parsed = await root
    .evaluate(() => {
      const out: Array<{ roomNumber: string; status: string; guestStatus: string; notes: string }> = [];

      const table =
        document.querySelector("#updateRoomConditionDataTable") ||
        document.querySelector("tbody#updateRoomConditionDataTable") ||
        null;
      const allRows = Array.from(document.querySelectorAll("tr"));
      const linked: Element[] = [];
      for (const tr of allRows) {
        if (tr.querySelector("a[onclick*='showHistoricalRoomCondition']")) linked.push(tr);
      }
      let trs: Element[] = [];
      if (table) {
        for (const tr of Array.from(table.querySelectorAll("tr[index], tr"))) {
          if (tr.querySelector("a[onclick*='showHistoricalRoomCondition']")) trs.push(tr);
        }
      }
      if (trs.length < 3) trs = linked;

      for (const tr of trs) {
        const link =
          tr.querySelector<HTMLAnchorElement>("a[onclick*='showHistoricalRoomCondition']") ||
          tr.querySelector<HTMLAnchorElement>("a.CHI_Link");
        const fromClick = link?.getAttribute("onclick")?.match(/showHistoricalRoomCondition\('(\d{3,4})'/)?.[1];
        const roomNumber = fromClick || (link?.textContent || "").replace(/\s+/g, " ").trim();
        if (!/^\d{3,4}$/.test(roomNumber)) continue;

        const condCell = tr.querySelector(".UBcontainer");
        const sort = (condCell?.getAttribute("tablesort_sortvalue") || "").toUpperCase();
        let status = "";
        if (sort === "R" || sort === "C") status = "Ready";
        else if (sort === "D") status = "Dirty";
        else if (tr.querySelector("#rdInput .RedFake, #rdInput .GreenFake")) status = "Dirty";
        else if (tr.querySelector("#rrInput .GreenFake, #rrInput .RedFake")) status = "Ready";
        else if (tr.querySelector("#rcInput .GreenFake, #rcInput .RedFake, #rcInput .BlueFake")) status = "Ready";
        if (!status) continue;

        const hkSelect = tr.querySelector<HTMLSelectElement>("select.hk-status-dropdown");
        const hkInitial = (hkSelect?.getAttribute("data-initial") || hkSelect?.value || "").toUpperCase();
        let roomStatusText = (tr.querySelector("td p.CHI_Data:not(.CHI_State_NoWrap)")?.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
        let serviceText = "";
        const paras = tr.querySelectorAll("p.CHI_Data");
        for (let i = 0; i < paras.length; i++) {
          const t = (paras[i].textContent || "").replace(/\s+/g, " ").trim();
          if (!roomStatusText && /^(vacant|occupied)$/i.test(t)) roomStatusText = t;
          if (!serviceText && /\b(stay\s*over|depart|arriv|due\s*out|none)\b/i.test(t)) serviceText = t;
        }

        let guestStatus = "";
        if (/\bstay\s*over\b/i.test(serviceText)) guestStatus = "Stayover";
        else if (/\bdepart|due\s*out|c\/o\b/i.test(serviceText)) guestStatus = "Departing";
        else if (/\barriv/i.test(serviceText)) guestStatus = "Arriving";
        else if (hkInitial === "OCCUPIED" || /^occupied$/i.test(roomStatusText)) guestStatus = "Occupied";
        else if (hkInitial === "VACANT" || /^vacant$/i.test(roomStatusText)) guestStatus = "Vacant";
        else guestStatus = "Vacant";

        const notesBits: string[] = [];
        const noteInput = tr.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          'input[name^="notes"], textarea[name^="notes"], input[name*="specialRequest" i], textarea[name*="specialRequest" i]'
        );
        if (noteInput?.value?.trim()) notesBits.push(noteInput.value.trim());
        const dndChecked = tr.querySelector<HTMLInputElement>(
          'input[name*="doNotDisturb" i], input[id*="doNotDisturb" i]'
        )?.checked;
        if (dndChecked) notesBits.push("DND");

        out.push({
          roomNumber,
          status,
          guestStatus,
          notes: notesBits.join("; "),
        });
      }
      return out;
    })
    .catch((err) => {
      console.info(
        "BOARD_EVAL_ERR",
        err instanceof Error ? err.message.split("\n")[0] : String(err)
      );
      return [] as BoardRoom[];
    });

  const byRoom = new Map<string, BoardRoom>();
  for (const row of parsed) {
    if (!row.status) continue;
    byRoom.set(row.roomNumber, row);
  }
  return [...byRoom.values()].sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));
}

async function readBoardFromContext(context: import("playwright").BrowserContext, page: import("playwright").Page) {
  const pages = context.pages().length ? context.pages() : [page];
  let best: BoardRoom[] = [];
  for (const current of pages) {
    const top = await extractHousekeepingCenterBoard(current);
    if (top.length > best.length) best = top;
    for (const frame of current.frames()) {
      const nested = await extractHousekeepingCenterBoard(frame);
      if (nested.length > best.length) best = nested;
    }
  }
  return best;
}

function parseCheckOffRooms(text: string) {
  const csv = housekeepingCheckOffToCsv(
    /housekeeping check-?off/i.test(text) ? text : `Housekeeping Check-Off List\n${text}`
  );
  if (!csv) return new Map<string, BoardRoom>();
  const lines = csv.split(/\r?\n/).slice(1);
  const map = new Map<string, BoardRoom>();
  for (const line of lines) {
    const cols = line.split(",");
    if (!cols[0]) continue;
    map.set(cols[0], {
      roomNumber: cols[0],
      status: cols[2] || "",
      guestStatus: cols[4] || cols[3] || "",
      notes: cols[8] || "",
    });
  }
  return map;
}

function mergeBoardWithCheckOff(board: BoardRoom[], checkOffText: string | null) {
  const checkOff = checkOffText ? parseCheckOffRooms(checkOffText) : new Map<string, BoardRoom>();
  const merged = new Map<string, BoardRoom>();

  for (const room of board) {
    const verify = checkOff.get(room.roomNumber);
    const notes = [...(room.notes ? [room.notes] : [])];
    if (verify) {
      // Board is primary. Check-off only fills gaps or notes a mismatch.
      if (verify.status && room.status && verify.status !== room.status) {
        notes.push(`Check-off shows ${verify.status}`);
      } else if (verify.status && !room.status) {
        room.status = verify.status;
      }
      if (verify.guestStatus && (!room.guestStatus || room.guestStatus === "Vacant")) {
        if (/\b(stayover|occupied|departing|arriving)\b/i.test(verify.guestStatus)) {
          room.guestStatus = verify.guestStatus;
        }
      }
      checkOff.delete(room.roomNumber);
    }
    if (!room.guestStatus) room.guestStatus = "Vacant";
    merged.set(room.roomNumber, { ...room, notes: notes.join(" · ") });
  }

  for (const [roomNumber, room] of checkOff) {
    merged.set(roomNumber, {
      ...room,
      guestStatus: room.guestStatus || "Vacant",
      status: room.status || "Dirty",
    });
  }

  const header =
    "Room,Room Type,Housekeeping Status,Occupancy Status,Guest Status,Housekeeper,Check-In,Check-Out,Notes";
  const lines = [...merged.values()].map((room) => {
    const hk = room.status || "Dirty";
    const guest = room.guestStatus || "Vacant";
    return [
      room.roomNumber,
      "STD",
      hk,
      occupancyFromGuest(guest),
      guest,
      "",
      "",
      "",
      room.notes.includes(",") ? `"${room.notes.replace(/"/g, '""')}"` : room.notes,
    ].join(",");
  });
  return `${header}\n${lines.join("\n")}`;
}

async function readCheckOffTextFromContext(
  context: import("playwright").BrowserContext,
  page: import("playwright").Page
) {
  const pages = context.pages().length ? context.pages() : [page];
  for (const current of pages) {
    for (const root of [current, ...current.frames()]) {
      const text = await extractOnScreenReportText(root);
      if (reportTextLooksUseful(text)) {
        return /housekeeping check-?off/i.test(text) ? text : `Housekeeping Check-Off List\n${text}`;
      }
    }
  }
  return null;
}

async function extractSkyTouchHomeFlash(root: DomRoot): Promise<Omit<PmsFlashStats, "collectedAt" | "sourceUrl"> | null> {
  return root
    .evaluate(() => {
      const num = (raw: string | null | undefined) => {
        if (raw == null) return null;
        const cleaned = String(raw).replace(/,/g, "").replace(/%/g, "").trim();
        if (!cleaned) return null;
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : null;
      };
      const textOf = (el: Element | null | undefined) =>
        (el?.textContent || "").replace(/\s+/g, " ").trim();
      const byId = (id: string) => document.getElementById(id);

      const valueBesideLabel = (label: RegExp) => {
        // Only true <label> nodes — parent divs concatenate many metrics and steal matches.
        const labels = Array.from(document.querySelectorAll("label"));
        for (const node of labels) {
          const labelText = textOf(node);
          if (!label.test(labelText)) continue;
          if (labelText.length > 60) continue;
          const row = node.closest("ul.CHI_Row, tr");
          if (!row) continue;
          // Prefer the value cell in the same row (usually the first CHI_Cell / link).
          const cells = Array.from(row.querySelectorAll(":scope > li.CHI_Cell, :scope > td"));
          for (const cell of cells) {
            if (cell.contains(node)) continue;
            const candidate = textOf(cell.querySelector("a.CHI_Link, a, p.CHI_Data") || cell);
            const n = num(candidate);
            if (n != null) return n;
          }
          const link = row.querySelector("a.CHI_Link, a");
          const data = row.querySelector("p.CHI_Data");
          const n = num(textOf(link) || textOf(data));
          if (n != null) return n;
        }
        return null;
      };

      const occupancyRaw = textOf(byId("smartwelcome_todays_occupancy"));
      const occupancyPercent = num(occupancyRaw);
      const expectedAdr = num(textOf(byId("expectedADR")));
      const totalArrivals = num(textOf(byId("smartwelcome_arrivals"))) ?? valueBesideLabel(/total arrivals today/i);
      const totalDepartures =
        num(textOf(byId("smartwelcome_departures"))) ?? valueBesideLabel(/total departures today/i);
      const totalRoomsAvailable =
        num(textOf(byId("smartwelcome_rooms_available"))) ?? valueBesideLabel(/total rooms available/i);
      const vacantDirtyRemaining = valueBesideLabel(/vacant\/?dirty rooms remaining/i);
      const checkInsCompleted = valueBesideLabel(/check\s*ins?\s*completed/i);
      const checkInsRemaining = valueBesideLabel(/check\s*ins?\s*remaining/i);

      // Status bar: check ins | stayovers | vacant | OOO
      let checkIns: number | null = null;
      let stayovers: number | null = null;
      let vacant: number | null = null;
      let ooo: number | null = null;
      const headers = Array.from(document.querySelectorAll("th label, tfoot label")).map((el) =>
        textOf(el).toLowerCase()
      );
      if (headers.some((h) => h === "stayovers") && headers.some((h) => /check\s*ins/.test(h))) {
        const bodyRow = Array.from(document.querySelectorAll("tbody tr")).find((tr) => {
          const links = tr.querySelectorAll("a.CHI_Link");
          return links.length >= 3;
        });
        if (bodyRow) {
          const vals = Array.from(bodyRow.querySelectorAll("td")).map((td) => num(textOf(td.querySelector("a") || td)));
          checkIns = vals[0] ?? null;
          stayovers = vals[1] ?? null;
          vacant = vals[2] ?? null;
          ooo = vals[3] ?? null;
        }
      }
      if (vacant == null) vacant = num(textOf(byId("smartwelcome_vacant_rooms")));

      const available = valueBesideLabel(/^\s*available\s*$/i);

      const hasAny = [
        occupancyPercent,
        expectedAdr,
        totalArrivals,
        checkInsCompleted,
        checkInsRemaining,
        totalDepartures,
        vacantDirtyRemaining,
        totalRoomsAvailable,
        checkIns,
        stayovers,
        vacant,
        ooo,
      ].some((v) => v != null);

      if (!hasAny) return null;
      return {
        occupancyPercent,
        expectedAdr,
        totalArrivals,
        checkInsCompleted,
        checkInsRemaining,
        totalDepartures,
        vacantDirtyRemaining,
        totalRoomsAvailable,
        checkIns,
        stayovers,
        vacant,
        ooo,
        available,
        preArrivals: null,
        dayUse: null,
        checkedOut: null,
        vacantClean: null,
        vacantDirty: null,
        occupiedClean: null,
        occupiedDirty: null,
        outOfInventory: null,
      };
    })
    .catch(() => null);
}

async function openSkyTouchHome(page: import("playwright").Page) {
  const clicked = await clickFirstMatching([
    page.getByRole("link", { name: /^\s*home\s*$/i }),
    page.locator('a[href*="Welcome"], a[href*="Home"]'),
  ]);
  if (!clicked || !/welcome|home/i.test(page.url())) {
    const target = new URL(page.url());
    for (const pathName of ["/pms/Welcome.init", "/pms/Home_start.init", "/pms/Home.init"]) {
      target.pathname = pathName;
      target.search = "";
      target.hash = "";
      await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (await page.locator("#smartwelcome_todays_occupancy, #expectedADR, #smartwelcome_arrivals").count()) break;
    }
  }
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

async function readHomeFlashFromContext(
  context: import("playwright").BrowserContext,
  page: import("playwright").Page
): Promise<PmsFlashStats | null> {
  const pages = context.pages().length ? context.pages() : [page];
  for (const current of pages) {
    for (const root of [current, ...current.frames()]) {
      const raw = await extractSkyTouchHomeFlash(root);
      if (!raw) continue;
      return {
        ...raw,
        collectedAt: new Date().toISOString(),
        sourceUrl: current.url(),
      };
    }
  }
  return null;
}

/**
 * Secure collect-only SkyTouch portal agent.
 * 1) Login
 * 2) Read Welcome/Home flash stats (occupancy, ADR, arrivals, …)
 * 3) Home → Housekeeping Center and read that board
 * 4) If the board is thin, Reports → Housekeeping Check-Off List → Submit, then read the report that opens
 * Does not write status back to the PMS.
 */
export async function collectSkyTouchHousekeepingReport(input: {
  loginUrl: string;
  username: string;
  password: string;
  selectorsJson?: string | null;
  timeoutMs?: number;
}): Promise<PortalCollectResult> {
  const loginUrl = normalizeSkyTouchLoginUrl(input.loginUrl);
  const { chromium } = await loadPlaywright();
  const selectors = mergeSelectors(input.selectorsJson);
  const timeout = input.timeoutMs ?? 60_000;
  const downloadDir = path.join(tmpdir(), `hk-pms-${randomUUID()}`);
  await mkdir(downloadDir, { recursive: true });

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

    try {
      await page.goto(loginUrl, { waitUntil: "commit", timeout });
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
    } catch (err) {
      throw new Error(
        `Could not open the SkyTouch login page at ${loginUrl} (${err instanceof Error ? err.message : "navigation failed"}). Open that URL in Chrome on this same computer. If Chrome works but Collect fails, SkyTouch may be blocking headless browsers.`
      );
    }

    if (/continuelogin\.do/i.test(page.url())) {
      await page.goto(normalizeSkyTouchLoginUrl(loginUrl), { waitUntil: "commit", timeout }).catch(() => undefined);
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
    }

    const user = page.locator(selectors.username).first();
    const pass = page.locator(selectors.password).first();
    try {
      await user.waitFor({ state: "visible", timeout: 25_000 });
    } catch {
      throw new Error(
        `Opened ${page.url()}, but no username field was found. Use https://www.skytouchhos.com/pms/Login.do?cleanSession=true (not ContinueLogin.do), or set portalSelectors for this hotel.`
      );
    }
    await user.fill(input.username);
    await pass.fill(input.password);

    await submitSkyTouchLogin(page, pass, selectors.submit);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);

    const stillOnLogin =
      (await page.locator(selectors.password).count()) > 0 &&
      (await page.locator(selectors.password).first().isVisible().catch(() => false));
    if (stillOnLogin) {
      throw new Error("SkyTouch login failed. Check the username, password, and login URL.");
    }

    // Home / Welcome flash stats for the dashboard.
    await openSkyTouchHome(page);
    let flash: PmsFlashStats | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      flash = await readHomeFlashFromContext(context, page);
      if (flash?.occupancyPercent != null || flash?.totalArrivals != null || flash?.expectedAdr != null) break;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    // Housekeeping Center board for room status updates.
    let boardError: string | undefined;
    let buffer: Buffer | null = null;
    let filename: string | null = null;
    try {
      await openHousekeepingCenter(page, selectors);
      let board: BoardRoom[] = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        board = await readBoardFromContext(context, page);
        if (board.length >= 3) break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      let checkOffText: string | null = null;
      if (board.length < 3) {
        try {
          const reportPage = await openSkyTouchCheckOffReport(page, context, selectors);
          checkOffText = await readCheckOffTextFromContext(context, reportPage);
        } catch {
          checkOffText = null;
        }
      }
      if (board.length >= 3 || checkOffText) {
        const csv = mergeBoardWithCheckOff(board, checkOffText);
        buffer = Buffer.from(csv, "utf8");
        filename = `skytouch-board-${Date.now()}.csv`;
      } else {
        const roomHits = await countRoomNumberHits(page);
        boardError =
          `Housekeeping Center parsed ${board.length} rooms (saw ${roomHits} room numbers), and Housekeeping Check-Off List did not open a report to read.`;
      }
    } catch (err) {
      boardError = err instanceof Error ? err.message : "Housekeeping Center collect failed";
    }

    await context.close();

    if (!flash && !buffer) {
      throw new Error(
        boardError ||
          "Logged in, but could not read the SkyTouch Home flash stats or Housekeeping Center board."
      );
    }

    return {
      buffer,
      filename,
      mime: buffer ? "text/csv" : null,
      flash,
      boardError,
    };
  } finally {
    await browser.close().catch(() => undefined);
    await rm(downloadDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export type SkyTouchBoardCondition = "READY" | "CLEAN" | "DIRTY";

export type SkyTouchBoardWriteResult = {
  rooms: Array<{ roomNumber: string; condition: SkyTouchBoardCondition; ok: boolean; error?: string }>;
  error?: string;
};

async function setBoardConditionOnPage(
  page: import("playwright").Page,
  updates: Array<{ roomNumber: string; condition: SkyTouchBoardCondition }>
) {
  const results: SkyTouchBoardWriteResult["rooms"] = [];

  const applyInRoot = async (root: DomRoot) => {
    return root.evaluate((batch) => {
      const out: Array<{ roomNumber: string; condition: string; ok: boolean; error?: string }> = [];
      for (const item of batch) {
        const roomNumber = item.roomNumber;
        const condition = item.condition;
        const link = Array.from(document.querySelectorAll("a[onclick*='showHistoricalRoomCondition']")).find((a) => {
          const onclick = a.getAttribute("onclick") || "";
          return onclick.includes(`'${roomNumber}'`) || (a.textContent || "").trim() === roomNumber;
        }) as HTMLElement | undefined;
        if (!link) {
          out.push({ roomNumber, condition, ok: false, error: "Room not found on board" });
          continue;
        }
        const tr = link.closest("tr");
        if (!tr) {
          out.push({ roomNumber, condition, ok: false, error: "Room row not found" });
          continue;
        }
        const targetId = condition === "READY" ? "rrInput" : condition === "CLEAN" ? "rcInput" : "rdInput";
        const control = tr.querySelector(`#${targetId}, [id="${targetId}"]`) as HTMLElement | null;
        if (!control) {
          out.push({ roomNumber, condition, ok: false, error: `Missing ${condition} control` });
          continue;
        }
        try {
          control.click();
          // Prefer calling SkyTouch handlers directly when present.
          const fnName =
            condition === "READY"
              ? "URCreadyReadOnlyClick"
              : condition === "CLEAN"
                ? "URCcleanReadOnlyClick"
                : "URCdirtyReadOnlyClick";
          const fn = (window as unknown as Record<string, unknown>)[fnName];
          if (typeof fn === "function") {
            (fn as (el: HTMLElement) => void)(control);
          }
          const activate = (window as unknown as { URCactivateSave?: () => void }).URCactivateSave;
          if (typeof activate === "function") activate();
          out.push({ roomNumber, condition, ok: true });
        } catch (err) {
          out.push({
            roomNumber,
            condition,
            ok: false,
            error: err instanceof Error ? err.message : "Click failed",
          });
        }
      }
      return out;
    }, updates);
  };

  // Prefer the frame that actually hosts the table.
  let applied = false;
  for (const root of [page, ...page.frames()] as DomRoot[]) {
    const hasTable = await root.locator("#updateRoomConditionDataTable tr[index]").count().catch(() => 0);
    if (hasTable < 1) continue;
    const batch = await applyInRoot(root);
    results.push(
      ...batch.map((row) => ({
        roomNumber: row.roomNumber,
        condition: row.condition as SkyTouchBoardCondition,
        ok: row.ok,
        error: row.error,
      }))
    );
    applied = true;
    break;
  }
  if (!applied) {
    return updates.map((u) => ({
      roomNumber: u.roomNumber,
      condition: u.condition,
      ok: false,
      error: "Housekeeping Center board table not found",
    }));
  }

  const saveClicked = await clickFirstMatching([
    page.getByRole("link", { name: /save changes/i }),
    page.getByRole("button", { name: /save changes/i }),
    page.locator('a[onclick*="updateRoomCondition_Save"]'),
    page.getByText(/^\s*save changes\s*$/i),
  ]);
  if (!saveClicked) {
    for (const frame of page.frames()) {
      const ok = await clickFirstMatching([
        frame.getByRole("link", { name: /save changes/i }),
        frame.locator('a[onclick*="updateRoomCondition_Save"]'),
        frame.getByText(/^\s*save changes\s*$/i),
      ]);
      if (ok) break;
    }
  }

  await page.evaluate(() => {
    const fn = (window as unknown as { updateRoomCondition_Save?: () => void }).updateRoomCondition_Save;
    if (typeof fn === "function") fn();
  }).catch(() => undefined);

  await new Promise((resolve) => setTimeout(resolve, 2500));
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);
  return results;
}

/**
 * Write room conditions back to SkyTouch Housekeeping Center (Update Room Condition).
 * Collect-only agent counterpart — uses the same secure portal login.
 */
export async function writeSkyTouchBoardConditions(input: {
  loginUrl: string;
  username: string;
  password: string;
  selectorsJson?: string | null;
  timeoutMs?: number;
  updates: Array<{ roomNumber: string; condition: SkyTouchBoardCondition }>;
}): Promise<SkyTouchBoardWriteResult> {
  if (!input.updates.length) return { rooms: [] };

  const loginUrl = normalizeSkyTouchLoginUrl(input.loginUrl);
  const roomsLabel = input.updates.map((row) => row.roomNumber).join(",");
  agentLog("step=write", `start rooms=${roomsLabel} url=${loginUrl}`);
  const { chromium } = await loadPlaywright();
  const selectors = mergeSelectors(input.selectorsJson);
  const timeout = input.timeoutMs ?? 60_000;
  const browser = await launchBrowser(chromium);

  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1400, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);

    await agentStep("open-login", async () => {
      await page.goto(loginUrl, { waitUntil: "commit", timeout });
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
      if (/continuelogin\.do/i.test(page.url())) {
        await page.goto(normalizeSkyTouchLoginUrl(loginUrl), { waitUntil: "commit", timeout }).catch(() => undefined);
      }
      agentLog("step=open-login", `url=${page.url()}`);
    });

    await agentStep("sign-in", async () => {
      const user = page.locator(selectors.username).first();
      const pass = page.locator(selectors.password).first();
      await user.waitFor({ state: "visible", timeout: 25_000 });
      await user.fill(input.username);
      await pass.fill(input.password);
      await submitSkyTouchLogin(page, pass, selectors.submit);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);

      const stillOnLogin =
        (await page.locator(selectors.password).count()) > 0 &&
        (await page.locator(selectors.password).first().isVisible().catch(() => false));
      if (stillOnLogin) {
        throw new Error("SkyTouch login failed during board write-back.");
      }
      agentLog("step=sign-in", `url=${page.url()}`);
    });

    await agentStep("housekeeping-center", () => openHousekeepingCenter(page, selectors));

    // Dedupe by room — last write wins.
    const byRoom = new Map<string, SkyTouchBoardCondition>();
    for (const u of input.updates) byRoom.set(u.roomNumber, u.condition);
    const unique = [...byRoom.entries()].map(([roomNumber, condition]) => ({ roomNumber, condition }));

    const rooms = await agentStep("set-ready", () => setBoardConditionOnPage(page, unique));
    const failed = rooms.filter((room) => !room.ok);
    agentLog(
      "step=set-ready",
      failed.length
        ? `FAIL rooms=${failed.map((room) => `${room.roomNumber}:${room.error || "not saved"}`).join(",")}`
        : `ok rooms=${rooms.map((room) => room.roomNumber).join(",")}`
    );
    await context.close();
    return { rooms };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/** Used by tests/diagnostics — list leftover temp dirs should be empty after success. */
export async function listTempCollectDirs() {
  const entries = await readdir(tmpdir());
  return entries.filter((name) => name.startsWith("hk-pms-"));
}
