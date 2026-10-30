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
import { assertPlaywrightHost, playwrightLaunchExtras } from "@/lib/pms/playwright-host";
import { fetchEmailOtp, type ImapOtpConfig } from "@/lib/pms/email-otp";
import type { PmsFlashStats } from "@/lib/pms/flash-stats";

export type SynxisPortalSelectors = {
  username?: string;
  password?: string;
  submit?: string;
  homeLink?: string;
  propertyHubLink?: string;
  /**
   * SPH app shell after login. Control Center: https://…synxis.com/CC/default.aspx
   * (auto-derived from portal login URL when empty).
   */
  propertyHubUrl?: string;
  frontOfficeLink?: string;
  housekeepingLink?: string;
  boardUrl?: string;
  cleanControl?: string;
  saveButton?: string;
  downloadButton?: string;
  /** Checkbox / control for Remember me (defaults cover common labels). */
  rememberMe?: string;
  /** After password: click to send auth code to email (SynXis MFA step). */
  otpSendEmail?: string;
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
  // SynXis Control Center: LoginCntrl_UsernameTextBox (do NOT use [id*="user"] — matches hidden UserGuidHF)
  username:
    '#LoginCntrl_UsernameTextBox, input[name="LoginCntrl$UsernameTextBox"], input[id*="UsernameTextBox" i], input[name*="UsernameTextBox" i], input[name="username"]:not([type="hidden"]), input[name="userName"]:not([type="hidden"]), input[name="j_username"]:not([type="hidden"]), input[placeholder="Username"], input[type="email"]:not([type="hidden"]), input[type="text"][placeholder*="user" i]',
  password:
    '#LoginCntrl_PasswordTextBox, input[name="LoginCntrl$PasswordTextBox"], input[id*="PasswordTextBox" i], input[name="password"]:not([type="hidden"]), input[name="j_password"], input[type="password"]:visible',
  submit:
    '#LoginCntrl_LoginButton, input[name="LoginCntrl$LoginButton"], input[type="submit"][value*="Sign" i], button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login"), a:has-text("Login")',
  homeLink:
    'a:has-text("Home"), a:has-text("Dashboard"), a:has-text("Property Hub"), a[href*="Home" i], a[href*="Dashboard" i], a[href*="SPH" i]',
  /** Launch SynXis Property Hub from Control Center if needed. */
  propertyHubLink:
    'a:has-text("Property Hub"), a:has-text("SynXis Property Hub"), a:has-text("Open Property Hub"), button:has-text("Property Hub"), a[href*="propertyhub" i], a[href*="PropertyHub" i], a[href*="pms-web-ui" i], a[href*="sph.synxis" i], a[href*="/sph" i]',
  frontOfficeLink:
    'a:has-text("Front Office"), button:has-text("Front Office"), span:has-text("Front Office"), [role="menuitem"]:has-text("Front Office"), div[role="button"]:has-text("Front Office"), a[href*="FrontOffice" i], a[href*="front-office" i]',
  housekeepingLink:
    'a:has-text("Housekeeping"), a:has-text("Room Status"), a:has-text("Go to Room Status"), a:has-text("Go to Housekeeping"), button:has-text("Housekeeping"), button:has-text("Room Status"), [role="menuitem"]:has-text("Housekeeping"), [role="menuitem"]:has-text("Room Status")',
  boardUrl: "",
  /** Empty → derive https://{control-center-host}/CC/default.aspx from portal login URL. */
  propertyHubUrl: "",
  cleanControl:
    'input[type="radio"][value*="clean" i], input[type="radio"][id*="clean" i], label:has-text("Clean"), button:has-text("Clean"), a:has-text("Clean")',
  saveButton:
    'button:has-text("Save"), a:has-text("Save"), input[value*="Save" i], button:has-text("Update"), a:has-text("Update")',
  downloadButton:
    'button:has-text("Export"), a:has-text("Export"), button:has-text("Download"), a:has-text("Download"), button:has-text("PDF"), a:has-text("PDF"), button:has-text("Excel"), a:has-text("CSV"), input[value*="Export" i]',
  rememberMe:
    'input[type="checkbox"][name*="remember" i], input[type="checkbox"][id*="remember" i], label:has-text("Remember me") input, label:has-text("Remember") input, input[type="checkbox"][name*="trust" i], label:has-text("Trust this device") input, input[type="checkbox"][id*="trust" i]',
  /**
   * SynXis MFA after password:
   * PassCode Email + SEND PASSCODE → email arrives → enter PassCode → LOG IN (+ Remember me).
   */
  otpSendEmail:
    'button:has-text("SEND PASSCODE"), input[type="button"][value*="SEND PASSCODE" i], input[type="submit"][value*="SEND PASSCODE" i], a:has-text("SEND PASSCODE"), button:has-text("Send Passcode"), button:has-text("RESEND"), input[value*="RESEND" i]',
  otpInput:
    'input[placeholder*="PassCode" i], input[placeholder*="Passcode" i], input[aria-label*="PassCode" i], input[name*="passcode" i], input[id*="passcode" i], input[name*="PassCode" i], input[id*="PassCode" i], input[name*="otp" i], input[name*="code" i], input[autocomplete="one-time-code"], input[inputmode="numeric"]',
  otpSubmit:
    'button:has-text("LOG IN"), button:has-text("Log in"), button:has-text("Login"), input[type="button"][value*="LOG IN" i], input[type="submit"][value*="LOG IN" i], button:has-text("USE PASSCODE"), input[value*="USE PASSCODE" i], button:has-text("Sign in"), button[type="submit"], input[type="submit"]',
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

/** Prefer a visible match — SynXis login pages include hidden inputs that share "user" in the id. */
async function firstVisible(
  page: import("playwright").Page,
  selector: string,
  timeoutMs = 25_000
): Promise<import("playwright").Locator> {
  const loc = page.locator(selector);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      if (await el.isVisible().catch(() => false)) return el;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  // Fall through to Playwright's visible wait so the error call log stays useful
  const fallback = loc.first();
  await fallback.waitFor({ state: "visible", timeout: 1 });
  return fallback;
}

function normalizeLoginUrl(raw: string) {
  const trimmed = raw.trim();
  if (!/^https:\/\//i.test(trimmed)) {
    throw new Error("SynXis portal login URL must start with https://");
  }
  try {
    const u = new URL(trimmed);
    // Keep the configured login page; drop ReturnUrl noise from prior redirects.
    if (/login\.aspx/i.test(u.pathname)) {
      u.searchParams.delete("ReturnUrl");
      u.searchParams.delete("returnUrl");
    }
    return u.toString();
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
  const extras = playwrightLaunchExtras();
  const preferBundled =
    process.env.PLAYWRIGHT_DOCKER === "1" || process.env.PLAYWRIGHT_CHROMIUM_ONLY === "1";
  const launchBundled = () => chromium.launch({ ...extras, args });
  if (preferBundled) return launchBundled();
  try {
    return await chromium.launch({ ...extras, channel: "chrome", args });
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

function isLoginUrl(url: string) {
  return /login\.aspx|\/login(\?|$)/i.test(url);
}

/**
 * Legacy CRS no-access landing (older SynXis defaults). Hotels may now land on SPH Dashboard
 * after MFA instead — prefer looksLikeSphDashboard() and only use AccessDenied handling as fallback.
 */
function isAccessDeniedLanding(url: string) {
  return /AccessDenied|SecurityAccessDeniedException|HMS%2fError%2fAccessDenied|\/HMS\/Error\/AccessDenied/i.test(
    url
  );
}

function synxisLog(step: string, detail?: Record<string, unknown> | string) {
  const extra =
    detail == null ? "" : typeof detail === "string" ? ` ${detail}` : ` ${JSON.stringify(detail)}`;
  console.info(`[synxis-portal] ${step}${extra}`);
}

async function pageSnapshot(page: import("playwright").Page) {
  const title = await page.title().catch(() => "");
  const needsLogin = await pageNeedsLogin(page, DEFAULT_SELECTORS).catch(() => false);
  const onLogin = isLoginUrl(page.url());
  const hasHome = await page
    .getByText(/^\s*Home\s*$/i)
    .first()
    .isVisible()
    .catch(() => false);
  const hasFo = await page
    .getByText(/^\s*Front Office\s*$/i)
    .first()
    .isVisible()
    .catch(() => false);
  const roomStatus = await looksLikeRoomStatusPage(page).catch(() => false);
  const dash = await looksLikeSphDashboard(page).catch(() => false);
  const commandFailed = await pageShowsCommandFailed(page).catch(() => false);
  const mfa = await looksLikeSynxisPasscodePage(page).catch(() => false);
  return {
    url: page.url(),
    title: title.slice(0, 120),
    onLogin,
    needsLogin,
    hasHome,
    hasFo,
    roomStatus,
    dash,
    commandFailed,
    mfa,
    accessDeniedLanding: isAccessDeniedLanding(page.url()),
  };
}

async function pageNeedsLogin(page: import("playwright").Page, selectors: typeof DEFAULT_SELECTORS) {
  if (await pageLooksLikePasswordChange(page, selectors)) return false;
  // MFA PassCode card (often on login.aspx?ReturnUrl=...AccessDenied...)
  if (await looksLikeSynxisPasscodePage(page)) return true;
  const passVisible = await page.locator(selectors.password).first().isVisible().catch(() => false);
  if (passVisible) return true;
  const userVisible = await page.locator("#LoginCntrl_UsernameTextBox, " + selectors.username).first().isVisible().catch(() => false);
  if (userVisible) return true;
  // Logged-in AccessDenied landing — not a login form
  if (isAccessDeniedLanding(page.url()) && !isLoginUrl(page.url())) return false;
  if (isLoginUrl(page.url())) return true;
  const otpVisible = await page.locator(selectors.otpInput).first().isVisible().catch(() => false);
  return otpVisible;
}

/** Wait until MFA is done and SPH shell / SPH Dashboard is available. */
async function waitUntilLoggedIntoSph(
  page: import("playwright").Page,
  loginUrl: string,
  timeoutMs = 45_000
) {
  synxisLog("waitUntilLoggedIntoSph:start", await pageSnapshot(page));
  const deadline = Date.now() + timeoutMs;
  let ticks = 0;
  while (Date.now() < deadline) {
    // Preferred: hotel now lands on SPH Dashboard after MFA
    if (await looksLikeSphDashboard(page)) {
      synxisLog("waitUntilLoggedIntoSph:ok-sph-dashboard", await pageSnapshot(page));
      return true;
    }
    const needs = await pageNeedsLogin(page, DEFAULT_SELECTORS);
    if (!needs) {
      const hasNav = await page
        .getByText(/^\s*(Home|Front Office)\s*$/i)
        .first()
        .isVisible()
        .catch(() => false);
      const onApp =
        hasNav ||
        /\/CC\/default\.aspx/i.test(page.url()) ||
        isAccessDeniedLanding(page.url());
      if (onApp) {
        synxisLog("waitUntilLoggedIntoSph:ok", await pageSnapshot(page));
        return true;
      }
    }
    ticks += 1;
    if (ticks % 6 === 0) {
      synxisLog("waitUntilLoggedIntoSph:still-waiting", await pageSnapshot(page));
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  synxisLog("waitUntilLoggedIntoSph:timeout", await pageSnapshot(page));
  void loginUrl;
  return false;
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

async function readLoginPageMessages(page: import("playwright").Page) {
  return page
    .evaluate(() => {
      const raw = (id: string) => {
        const el = document.getElementById(id);
        if (!el) return { text: "", raw: "", visible: false };
        const style = window.getComputedStyle(el);
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        const visible =
          Boolean(text) &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          (el as HTMLElement).offsetParent !== null;
        return { text: visible ? text : "", raw: text, visible };
      };
      const pass = document.getElementById("LoginCntrl_PasswordTextBox") as HTMLInputElement | null;
      const user = document.getElementById("LoginCntrl_UsernameTextBox") as HTMLInputElement | null;
      const passStyle = pass ? window.getComputedStyle(pass) : null;
      // SynXis keeps password display:none until IsSabreOrSSOUser returns — normal for local login.
      const passwordVisible = Boolean(
        pass &&
          passStyle &&
          passStyle.display !== "none" &&
          passStyle.visibility !== "hidden" &&
          passStyle.opacity !== "0" &&
          !pass.disabled &&
          pass.offsetParent !== null
      );
      const spark = document.querySelector("#dvErrorMessage .spark-message__content") as HTMLElement | null;
      const sparkText = spark
        ? (spark.textContent || "").replace(/\s+/g, " ").trim()
        : "";
      const sparkVisible = Boolean(
        sparkText &&
          document.getElementById("dvErrorMessage") &&
          window.getComputedStyle(document.getElementById("dvErrorMessage")!).display !== "none"
      );
      const error =
        raw("LoginCntrl_LoginErrorLabelNG").text ||
        raw("LoginCntrl_LoginMsgLabelNG").text ||
        (sparkVisible ? sparkText : "") ||
        raw("txtErrorMsg").text;
      const ssoAven = raw("LoginCntrl_RedirectMessage");
      const ssoGeneric = raw("LoginCntrl_SSORedirectMessage");
      return {
        error,
        ssoAven: ssoAven.text,
        ssoGeneric: ssoGeneric.text,
        ssoAvenRaw: ssoAven.raw,
        ssoGenericRaw: ssoGeneric.raw,
        passwordVisible,
        usernameValue: user?.value ? `${user.value.slice(0, 3)}…` : "",
        passwordFilled: Boolean(pass?.value),
        signInPresent: Boolean(document.getElementById("LoginCntrl_LoginButton")),
        url: location.href,
      };
    })
    .catch(() => ({
      error: "",
      ssoAven: "",
      ssoGeneric: "",
      ssoAvenRaw: "",
      ssoGenericRaw: "",
      passwordVisible: false,
      usernameValue: "",
      passwordFilled: false,
      signInPresent: false,
      url: "",
    }));
}

function looksLikeExternalSsoUrl(url: string) {
  try {
    const u = new URL(url);
    if (/synxis\.com$/i.test(u.hostname) || /\.synxis\./i.test(u.hostname)) return false;
    return /okta|login\.microsoftonline|accounts\.google|auth0|onelogin|pingidentity|ssoproxy|saml|oauth/i.test(
      `${u.hostname}${u.pathname}`
    );
  } catch {
    return false;
  }
}

/**
 * After username blur, wait for the password field. Only treat as SSO if we
 * leave SynXis for an IdP — label text alone is unreliable (false positives).
 */
async function waitAfterUsernameForPasswordOrSso(page: import("playwright").Page) {
  const pass = page.locator(
    "#LoginCntrl_PasswordTextBox, input[name='LoginCntrl$PasswordTextBox'], input[type='password']:not([type='hidden'])"
  ).first();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (looksLikeExternalSsoUrl(url)) {
      return { kind: "sso" as const, msgs: await readLoginPageMessages(page) };
    }
    const msgs = await readLoginPageMessages(page);
    // Password wins over any redirect-label text on the same page.
    const visible =
      msgs.passwordVisible ||
      ((await pass.count()) > 0 && (await pass.isVisible().catch(() => false)));
    if (visible) {
      return { kind: "password" as const, msgs };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  const msgs = await readLoginPageMessages(page);
  if (looksLikeExternalSsoUrl(page.url())) {
    return { kind: "sso" as const, msgs };
  }
  // Last resort: still on login.aspx, password never shown, and a redirect label
  // is actually visible with redirect-ish wording.
  const ssoText = `${msgs.ssoAven} ${msgs.ssoGeneric}`.toLowerCase();
  if (
    !msgs.passwordVisible &&
    ssoText &&
    /redirect|sso|single sign|aven|federated|identity/i.test(ssoText)
  ) {
    return { kind: "sso" as const, msgs };
  }
  return { kind: "timeout" as const, msgs };
}

const SYNXIS_MFA_SHOT_DIR = path.join(process.cwd(), ".tmp", "synxis-mfa");

async function synxisMfaScreenshot(page: import("playwright").Page, label: string) {
  try {
    await mkdir(SYNXIS_MFA_SHOT_DIR, { recursive: true });
    const file = path.join(SYNXIS_MFA_SHOT_DIR, `${Date.now()}-${label}.png`);
    await page.screenshot({ path: file, fullPage: true }).catch(async () => {
      await page.screenshot({ path: file }).catch(() => undefined);
    });
    synxisLog("otp:screenshot", { file, label, url: page.url() });
    return file;
  } catch (err) {
    synxisLog("otp:screenshot-failed", String(err));
    return null;
  }
}

/** MFA UI lives in a Sabre/Aven web component (shadow DOM) — use a11y roles, not document.querySelector. */
function mfaRoots(page: import("playwright").Page) {
  return synxisDomRoots(page);
}

/** Main page + every iframe (SPH widgets/board live under /CC/default.aspx iframes). */
function synxisDomRoots(
  page: import("playwright").Page
): Array<import("playwright").Page | import("playwright").Frame> {
  const frames = page.frames();
  // page.frames() already includes mainFrame — prefer Frame handles for evaluate().
  return frames.length > 0 ? frames : [page];
}

async function dumpSphShellDebug(page: import("playwright").Page, label: string) {
  const frames = [];
  for (const frame of page.frames()) {
    const text = await frame
      .evaluate(() => (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1200))
      .catch(() => "");
    frames.push({ url: frame.url().slice(0, 180), text });
  }
  synxisLog(`debug:${label}`, { url: page.url(), frameCount: frames.length, frames });
  await synxisNavScreenshot(page, `debug-${label}`).catch(() => null);
}

async function looksLikeSynxisPasscodePage(page: import("playwright").Page) {
  for (const root of mfaRoots(page)) {
    const send = root.getByRole("button", { name: /^\s*SEND PASSCODE\s*$/i });
    const use = root.getByRole("button", { name: /^\s*USE PASSCODE\s*$/i });
    const box = root.getByRole("textbox", { name: /PassCode/i });
    if ((await send.count()) > 0 && (await send.first().isVisible().catch(() => false))) return true;
    if ((await use.count()) > 0 && (await use.first().isVisible().catch(() => false))) return true;
    if ((await box.count()) > 0 && (await box.first().isVisible().catch(() => false))) return true;
  }
  return page.getByText(/PassCode Email|SEND PASSCODE|USE PASSCODE/i).first().isVisible().catch(() => false);
}

/**
 * Spark MFA card: PassCode Email is often NOT a native <input> (custom host in shadow DOM).
 * Buttons USE/SEND PASSCODE are real <button>s at shadow depth 1 — use them as anchors.
 */
async function findPasscodeInput(page: import("playwright").Page, _selectors: typeof DEFAULT_SELECTORS) {
  for (const root of mfaRoots(page)) {
    for (const name of [/PassCode\s*Email/i, /^\s*PassCode\s*$/i, /PassCode/i, /Passcode/i]) {
      const box = root.getByRole("textbox", { name }).first();
      if ((await box.count()) > 0 && (await box.isVisible().catch(() => false))) return box;
    }
    const byPh = root.getByPlaceholder(/PassCode/i).first();
    if ((await byPh.count()) > 0 && (await byPh.isVisible().catch(() => false))) return byPh;
    // Native inputs deep in open shadow (Playwright pierces open roots)
    const deep = root.locator("input[type='text'], input[type='tel'], input[type='number'], input:not([type])");
    const n = await deep.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = deep.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const id = ((await el.getAttribute("id")) || "").toLowerCase();
      const name = ((await el.getAttribute("name")) || "").toLowerCase();
      const ph = ((await el.getAttribute("placeholder")) || "").toLowerCase();
      if (id.includes("error") || name.includes("error")) continue;
      if (/passcode|pass.?code|otp|code|token|verif|email/i.test(`${id} ${name} ${ph}`) || ph.length > 0) {
        return el;
      }
    }
  }
  return null;
}

async function findMfaButton(page: import("playwright").Page, name: RegExp) {
  for (const root of mfaRoots(page)) {
    const btn = root.getByRole("button", { name }).first();
    if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) return btn;
  }
  for (const root of mfaRoots(page)) {
    const loc = root.locator(`button, [role="button"], input[type="button"], input[type="submit"]`).filter({
      hasText: name,
    });
    if ((await loc.count()) > 0 && (await loc.first().isVisible().catch(() => false))) return loc.first();
  }
  // Shadow-piercing text click target
  const textBtn = page.getByText(name).first();
  if ((await textBtn.count()) > 0 && (await textBtn.isVisible().catch(() => false))) return textBtn;
  return null;
}

/** Click the PassCode field area to the left of USE PASSCODE / LOG IN / SEND PASSCODE, then type. */
async function focusPasscodeFieldByGeometry(page: import("playwright").Page) {
  const anchors = [
    await findMfaButton(page, /^\s*USE PASSCODE\s*$/i),
    await findMfaButton(page, /^\s*LOG IN\s*$/i),
    await findMfaButton(page, /^\s*SEND PASSCODE\s*$/i),
    await findMfaButton(page, /^\s*RESEND\s*$/i),
  ].filter(Boolean) as import("playwright").Locator[];

  for (const anchor of anchors) {
    const box = await anchor.boundingBox().catch(() => null);
    if (!box) continue;
    // Field sits immediately left of the button row on the MFA card
    const x = Math.max(8, box.x - 120);
    const y = box.y + box.height / 2;
    await page.mouse.click(x, y);
    synxisLog("otp:focus-passcode-by-geometry", { x, y, anchor: box });
    return true;
  }

  // Click visible "PassCode" / "PassCode Email" label text
  const label = page.getByText(/PassCode(\s*Email)?/i).first();
  if ((await label.count()) > 0 && (await label.isVisible().catch(() => false))) {
    await label.click({ timeout: 5_000 }).catch(() => undefined);
    return true;
  }
  return false;
}

async function typePasscodeIntoMfa(page: import("playwright").Page, code: string, selectors: typeof DEFAULT_SELECTORS) {
  let otp = await findPasscodeInput(page, selectors);
  if (otp) {
    await otp.click({ timeout: 5_000 }).catch(() => undefined);
    await otp.fill("");
    await otp.pressSequentially(code, { delay: 50 }).catch(async () => otp!.fill(code));
    const v = await otp.inputValue().catch(() => "");
    if (v.length >= Math.min(4, code.length)) return "locator";
  }

  // Custom Spark field: focus by geometry next to the buttons, then keyboard type
  const focused = await focusPasscodeFieldByGeometry(page);
  if (!focused) return null;
  await page.keyboard.press("Meta+A").catch(() => page.keyboard.press("Control+A"));
  await page.keyboard.press("Backspace").catch(() => undefined);
  await page.keyboard.type(code, { delay: 60 });
  return "geometry-keyboard";
}

async function dumpMfaDebug(page: import("playwright").Page) {
  const a11y = await page
    .evaluate(() => {
      const walk = (root: Document | ShadowRoot, depth: number): unknown[] => {
        if (depth > 8) return [];
        const out: unknown[] = [];
        root.querySelectorAll("*").forEach((el) => {
          const h = el as HTMLElement;
          const tag = h.tagName;
          const type = h.getAttribute("type");
          const ph = h.getAttribute("placeholder") || "";
          const aria = h.getAttribute("aria-label") || "";
          const text = (h.innerText || "").replace(/\s+/g, " ").trim().slice(0, 48);
          const interesting =
            /INPUT|BUTTON|TEXTAREA|SELECT/i.test(tag) ||
            /passcode|pass.?code|otp|spark|mds|text/i.test(`${tag} ${ph} ${aria} ${h.id}`) ||
            /PassCode|SEND PASSCODE|USE PASSCODE|LOG IN|RESEND/i.test(text);
          if (interesting) {
            out.push({
              tag,
              type,
              id: h.id,
              placeholder: ph || null,
              aria: aria || null,
              text,
              depth,
            });
          }
          const sr = h.shadowRoot;
          if (sr) out.push(...walk(sr, depth + 1));
        });
        return out;
      };
      return walk(document, 0).slice(0, 120);
    })
    .catch(() => []);
  return { url: page.url(), a11y, frames: page.frames().map((f) => f.url()) };
}

/**
 * SynXis MFA — same page the whole time:
 * PassCode field (always present) + SEND PASSCODE → email arrives → type code → LOG IN.
 */
async function completeEmailOtpIfPresent(
  page: import("playwright").Page,
  selectors: typeof DEFAULT_SELECTORS,
  imap: ImapOtpConfig | null | undefined
) {
  await new Promise((r) => setTimeout(r, 1500));
  synxisLog("otp:check-start", await pageSnapshot(page));

  if (!(await pageNeedsLogin(page, selectors)) && !isLoginUrl(page.url())) {
    if (!(await looksLikeSynxisPasscodePage(page))) return false;
  }

  for (let i = 0; i < 10 && !(await looksLikeSynxisPasscodePage(page)); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!(await looksLikeSynxisPasscodePage(page))) {
    synxisLog("otp:not-shown", await pageSnapshot(page));
    return false;
  }

  await synxisMfaScreenshot(page, "01-passcode-page");
  synxisLog("otp:passcode-page", {
    ...(await pageSnapshot(page)),
    ...(await dumpMfaDebug(page)),
  });
  if (!imap?.host || !imap.user || !imap.password) {
    throw new Error(
      "SynXis is on the PassCode page, but IMAP is not configured. Add the bot inbox on the PMS SynXis portal settings."
    );
  }

  // PassCode Email is a Spark custom control (not a native textbox) — do NOT block on finding <input>.
  // Flow: SEND PASSCODE → IMAP → click field left of buttons → type code → LOG IN / USE PASSCODE.
  synxisLog("otp:field-before-send", {
    found: Boolean(await findPasscodeInput(page, selectors)),
  });

  // 1) SEND PASSCODE
  const sendBtn = await findMfaButton(page, /^\s*SEND PASSCODE\s*$/i);
  let sentEmail = false;
  const codeStartedAt = Date.now();
  if (sendBtn) {
    await sendBtn.click({ timeout: 8_000, noWaitAfter: true });
    sentEmail = true;
    synxisLog("otp:clicked-SEND-PASSCODE", await pageSnapshot(page));
    await new Promise((r) => setTimeout(r, 1500));
    await synxisMfaScreenshot(page, "02-after-send-passcode");

    if (/authError=1/i.test(page.url()) || (await pageShowsAuthError(page))) {
      await synxisMfaScreenshot(page, "02b-authError-after-send");
      throw new Error(
        "SynXis MFA reset to username/password after SEND PASSCODE (authError=1). Retry Collect."
      );
    }

    for (let i = 0; i < 40; i++) {
      if (/authError=1/i.test(page.url())) break;
      const ok = await page
        .getByText(/Passcode emailed successfully|New Passcode emailed|emailed successfully/i)
        .first()
        .isVisible()
        .catch(() => false);
      const resend = await findMfaButton(page, /^\s*RESEND\s*$/i);
      const logIn = await findMfaButton(page, /^\s*LOG IN\s*$/i);
      if (ok || resend || logIn) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    synxisLog("otp:after-send", { ...(await pageSnapshot(page)), ...(await dumpMfaDebug(page)) });
  } else {
    synxisLog("otp:send-button-missing-maybe-already-sent", await pageSnapshot(page));
    await synxisMfaScreenshot(page, "02-no-send-button");
  }

  if (/authError=1/i.test(page.url()) || (await pageShowsAuthError(page))) {
    await synxisMfaScreenshot(page, "02c-authError");
    throw new Error(
      "SynXis left the PassCode page (authError=1) before the code could be entered. Retry Collect."
    );
  }

  // 2) IMAP → focus PassCode (locator or click left of buttons) → type → LOG IN
  await new Promise((r) => setTimeout(r, sentEmail ? 3000 : 1500));
  synxisLog("otp:fetching-from-imap", { host: imap.host, user: imap.user, sentEmail });
  const code = await fetchEmailOtp({
    ...imap,
    maxAgeMs: Math.max(imap.maxAgeMs ?? 0, Date.now() - codeStartedAt + 90_000),
    waitMs: imap.waitMs ?? 120_000,
  });
  synxisLog("otp:code-received", { length: code?.length ?? 0 });

  if (/authError=1/i.test(page.url()) || !(await looksLikeSynxisPasscodePage(page))) {
    await synxisMfaScreenshot(page, "03-lost-mfa-during-imap");
    throw new Error(
      "SynXis PassCode page disappeared while waiting for the email. Retry Collect."
    );
  }

  const typed = await typePasscodeIntoMfa(page, String(code), selectors);
  if (!typed) {
    const shot = await synxisMfaScreenshot(page, "03-passcode-field-missing");
    synxisLog("otp:PASSCODE-FIELD-MISSING", { shot, ...(await dumpMfaDebug(page)) });
    throw new Error(
      `Could not focus SynXis PassCode field to type the code. Screenshot: ${shot || "none"}`
    );
  }
  synxisLog("otp:code-typed", { via: typed });
  await checkRememberMe(page, selectors);
  // Spark checkbox is in shadow DOM
  const remember = page.getByText(/Remember me/i).first();
  if ((await remember.count()) > 0) {
    await remember.click({ timeout: 3_000 }).catch(() => undefined);
  }
  await synxisMfaScreenshot(page, "04-code-filled");
  synxisLog("otp:code-filled", await pageSnapshot(page));

  const loginBtn = await findMfaButton(page, /^\s*LOG IN\s*$/i);
  const useBtn = await findMfaButton(page, /^\s*USE PASSCODE\s*$/i);
  let clicked = false;
  for (const btn of [loginBtn, useBtn]) {
    if (!btn) continue;
    for (let i = 0; i < 20; i++) {
      if (!(await btn.isDisabled().catch(() => false))) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    await btn.click({ timeout: 8_000, noWaitAfter: true });
    clicked = true;
    synxisLog("otp:clicked-login", await pageSnapshot(page));
    break;
  }
  if (!clicked) await page.keyboard.press("Enter");

  await new Promise((r) => setTimeout(r, 3000));
  await synxisMfaScreenshot(page, "05-after-login-click");
  await checkRememberMe(page, selectors);
  synxisLog("otp:submitted", await pageSnapshot(page));
  return true;
}

async function pageShowsAuthError(page: import("playwright").Page) {
  if (/authError=1/i.test(page.url())) return true;
  // Red prohibited icon / auth error on login card after MFA widget failure
  const userBack = await page.locator("#LoginCntrl_UsernameTextBox").isVisible().catch(() => false);
  const mfaGone = !(await looksLikeSynxisPasscodePage(page));
  return userBack && mfaGone;
}

async function clickFirstVisible(
  page: import("playwright").Page,
  selector: string,
  timeoutMs = 8_000
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // Re-read frames each tick — SPH iframes appear after shell load.
    for (const root of synxisDomRoots(page)) {
      const loc = root.locator(selector);
      const n = await loc.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        const el = loc.nth(i);
        if (!(await el.isVisible().catch(() => false))) continue;
        await el.scrollIntoViewIfNeeded().catch(() => undefined);
        await el.hover({ timeout: 2_000 }).catch(() => undefined);
        await el.click({ timeout: 5_000 }).catch(() => undefined);
        return true;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/**
 * SPH Dashboard content (often inside an iframe on /CC/default.aspx).
 * Do NOT match the "SPH Dashboard" menu label alone — that caused false positives.
 */
async function looksLikeSphDashboard(page: import("playwright").Page) {
  if (await pageShowsCommandFailed(page)) return false;
  const contentRe =
    /Occupancy\s*Tonight|Pre-?arrival|Vacant\s*\/\s*Clean|Occupied\s*\/\s*Clean|Occupied\s*\/\s*Dirty|Go to Room Status|Expected\s*ADR|Total\s*Dirty\s*Rooms?/i;
  for (const root of [page, ...page.frames()]) {
    const hit = await root.getByText(contentRe).first().isVisible().catch(() => false);
    if (hit) return true;
  }
  return false;
}

/** Control Center often lands HK users on CRS with "Command failed" (no CRS access). */
async function pageShowsCommandFailed(page: import("playwright").Page) {
  return page
    .getByText(/Command failed/i)
    .first()
    .isVisible()
    .catch(() => false);
}

/** After Control Center login, SPH runs inside /CC/default.aspx (same host). */
function controlCenterDefaultAspxUrl(loginOrAnyUrl: string): string {
  try {
    const u = new URL(loginOrAnyUrl);
    if (/controlcenter/i.test(u.hostname)) {
      u.pathname = "/CC/default.aspx";
      u.search = "";
      u.hash = "";
      return u.toString();
    }
  } catch {
    // fall through
  }
  return "https://controlcenter-p2.synxis.com/CC/default.aspx";
}

function resolvePropertyHubUrl(loginUrl: string, selectors: typeof DEFAULT_SELECTORS): string {
  const override = selectors.propertyHubUrl?.trim() || selectors.boardUrl?.trim();
  if (override && /^https:\/\//i.test(override)) return override;
  return controlCenterDefaultAspxUrl(loginUrl);
}

async function synxisNavScreenshot(page: import("playwright").Page, label: string) {
  try {
    await mkdir(path.join(process.cwd(), ".tmp", "synxis-nav"), { recursive: true });
    const file = path.join(process.cwd(), ".tmp", "synxis-nav", `${Date.now()}-${label}.png`);
    await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
    synxisLog("nav:screenshot", { file, label });
    return file;
  } catch {
    return null;
  }
}

/** Click an exact top-nav / menu label — never broad div:has-text (matches whole shell). */
async function clickExactMenuLabel(page: import("playwright").Page, label: RegExp) {
  for (const root of [page, ...page.frames()]) {
    const roleTries = [
      root.getByRole("menuitem", { name: label }),
      root.getByRole("link", { name: label }),
      root.getByRole("button", { name: label }),
      root.getByRole("tab", { name: label }),
    ];
    for (const loc of roleTries) {
      const el = loc.first();
      if ((await el.count()) > 0 && (await el.isVisible().catch(() => false))) {
        await el.click({ timeout: 5_000 });
        return true;
      }
    }
    const text = root.getByText(label).first();
    if ((await text.count()) > 0 && (await text.isVisible().catch(() => false))) {
      await text.click({ timeout: 5_000 });
      return true;
    }
  }
  return false;
}

/**
 * Ensure SPH Dashboard is showing. SynXis may now land here after MFA; otherwise
 * navigate Home → SPH Dashboard on /CC/default.aspx (widgets often in an iframe).
 */
async function openSynxisHome(
  page: import("playwright").Page,
  loginUrl: string,
  selectors: typeof DEFAULT_SELECTORS,
  timeout: number
): Promise<import("playwright").Page> {
  synxisLog("openSynxisHome:start", await pageSnapshot(page));
  // Give SPA/iframe a moment when SynXis lands directly on SPH Dashboard
  for (let i = 0; i < 10; i++) {
    if (await looksLikeSphDashboard(page)) {
      synxisLog("openSynxisHome:already-sph-dashboard", await pageSnapshot(page));
      return page;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const current = await ensureOnPropertyHub(page, loginUrl, selectors, timeout);

  if (await looksLikeSphDashboard(current)) {
    synxisLog("openSynxisHome:already-sph-dashboard", await pageSnapshot(current));
    return current;
  }

  synxisLog("openSynxisHome:pre-nav", {
    ...(await pageSnapshot(current)),
    frames: current.frames().map((f) => f.url()).slice(0, 12),
  });
  await synxisNavScreenshot(current, "01-before-home");

  // 1) Home (top nav) — opens submenu or the dashboard itself
  let homeClicked = await clickExactMenuLabel(current, /^\s*Home\s*$/i);
  synxisLog("openSynxisHome:home-click", { homeClicked, ...(await pageSnapshot(current)) });
  await new Promise((r) => setTimeout(r, 1500));
  await synxisNavScreenshot(current, "02-after-home");

  if (await looksLikeSphDashboard(current)) {
    synxisLog("openSynxisHome:dashboard-via-home", await pageSnapshot(current));
    return current;
  }

  // 2) SPH Dashboard — exact label only (submenu / tile)
  let sphClicked = await clickExactMenuLabel(current, /^\s*SPH Dashboard\s*$/i);
  if (!sphClicked) {
    // Hover Home to reveal flyout, then click
    await current.getByText(/^\s*Home\s*$/i).first().hover({ timeout: 3_000 }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 700));
    sphClicked = await clickExactMenuLabel(current, /^\s*SPH Dashboard\s*$/i);
  }
  if (!sphClicked) {
    // Some builds label it "Dashboard" under Home
    sphClicked = await clickExactMenuLabel(current, /^\s*Dashboard\s*$/i);
  }
  synxisLog("openSynxisHome:sph-dashboard-click", {
    sphClicked,
    ...(await pageSnapshot(current)),
    frames: current.frames().map((f) => f.url()).slice(0, 12),
  });
  await synxisNavScreenshot(current, "03-after-sph-dashboard-click");

  // Wait for dashboard widgets (main page or iframes)
  const deadline = Date.now() + Math.max(timeout, 45_000);
  let ticks = 0;
  while (Date.now() < deadline) {
    if (await looksLikeSphDashboard(current)) {
      synxisLog("openSynxisHome:done", await pageSnapshot(current));
      await synxisNavScreenshot(current, "04-dashboard-ok");
      return current;
    }
    ticks += 1;
    if (ticks % 8 === 0) {
      synxisLog("openSynxisHome:waiting-content", {
        ...(await pageSnapshot(current)),
        frames: current.frames().map((f) => f.url()).slice(0, 12),
      });
      // Retry menu path periodically
      await clickExactMenuLabel(current, /^\s*Home\s*$/i);
      await new Promise((r) => setTimeout(r, 600));
      await clickExactMenuLabel(current, /^\s*SPH Dashboard\s*$/i);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const shot = await synxisNavScreenshot(current, "04-FAILED-not-dashboard");
  synxisLog("openSynxisHome:FAILED-not-dashboard", {
    ...(await pageSnapshot(current)),
    shot,
    frames: current.frames().map((f) => f.url()).slice(0, 20),
    bodyHint: await current
      .locator("body")
      .innerText()
      .then((t) => t.replace(/\s+/g, " ").trim().slice(0, 800))
      .catch(() => ""),
  });
  return current;
}

function isSphAppUrl(url: string) {
  return /sph\.synxis\.com|pms-web-ui|propertyhub|\/CC\/default\.aspx/i.test(url);
}

function isControlCenterUrl(url: string) {
  return /controlcenter[^/]*\.synxis\.com/i.test(url);
}

/**
 * True when the Front Office → Housekeeping → Room Status *grid* is on screen.
 * Do NOT treat the SPH Dashboard "Room Status" widget title as the board —
 * that caused Collect to scrape 1 false room and skip FO navigation.
 */
async function looksLikeRoomStatusPage(page: import("playwright").Page) {
  const path = (() => {
    try {
      return new URL(page.url()).pathname;
    } catch {
      return "";
    }
  })();
  if (/^\/Housekeeping\/?$/i.test(path)) return false;

  for (const root of synxisDomRoots(page)) {
    // Strong signal: "26 of 51 Rooms" pager banner on the board
    const hasRoomCount = await root
      .getByText(/\d+\s+of\s+\d+\s+Rooms?/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (hasRoomCount) return true;

    // Column header + at least one room-number link in a table/grid row
    const hkHeader = root
      .locator("th, [role='columnheader']")
      .filter({ hasText: /Housekeeping\s*Status/i })
      .first();
    if ((await hkHeader.count()) > 0 && (await hkHeader.isVisible().catch(() => false))) {
      const roomLinks = root.locator(
        "table tbody tr a, [role='row'] a, .k-grid-content tr a, .dx-data-row a"
      );
      const n = await roomLinks.count().catch(() => 0);
      let roomHits = 0;
      for (let i = 0; i < Math.min(n, 12); i++) {
        const t = ((await roomLinks.nth(i).innerText().catch(() => "")) || "").trim();
        if (/^[A-Za-z]{0,3}\d{1,5}[A-Za-z]?$/.test(t) && /\d/.test(t) && t.length <= 6) {
          roomHits += 1;
        }
      }
      if (roomHits >= 2) return true;
    }
  }
  return false;
}

async function waitForRoomStatusGrid(page: import("playwright").Page, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await looksLikeRoomStatusPage(page)) {
      for (const root of synxisDomRoots(page)) {
        const hasRow = await root
          .locator("table tbody tr a, table tr a, [role='row'] a")
          .first()
          .isVisible()
          .catch(() => false);
        if (hasRow) return true;
        const dirtyBanner = await root
          .getByText(/Total\s*Dirty\s*Rooms?/i)
          .first()
          .isVisible()
          .catch(() => false);
        if (dirtyBanner) return true;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return looksLikeRoomStatusPage(page);
}

/** Open SPH shell: Control Center /CC/default.aspx (or override URL). */
async function ensureOnPropertyHub(
  page: import("playwright").Page,
  loginUrl: string,
  selectors: typeof DEFAULT_SELECTORS,
  timeout: number
): Promise<import("playwright").Page> {
  let current = page;
  const target = resolvePropertyHubUrl(loginUrl, selectors);
  synxisLog("ensureOnPropertyHub:start", { target, ...(await pageSnapshot(current)) });

  if (/\/CC\/default\.aspx/i.test(current.url()) && !isLoginUrl(current.url())) {
    synxisLog("ensureOnPropertyHub:already-on-shell");
    await new Promise((r) => setTimeout(r, 1000));
    return current;
  }

  const context = current.context();
  const popupPromise = context.waitForEvent("page", { timeout: 8_000 }).catch(() => null);
  const hubClicked = await clickFirstVisible(current, selectors.propertyHubLink, 5_000);
  synxisLog("ensureOnPropertyHub:propertyHub-click", { hubClicked });
  if (hubClicked) {
    const popup = await popupPromise;
    if (popup) {
      synxisLog("ensureOnPropertyHub:opened-popup", { url: popup.url() });
      await popup.waitForLoadState("domcontentloaded", { timeout }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 2000));
      current = popup;
    } else {
      await new Promise((r) => setTimeout(r, 2000));
      const pages = context.pages();
      const shell = [...pages].reverse().find((p) => /\/CC\/default\.aspx|sph\.synxis|pms-web-ui/i.test(p.url()));
      if (shell) {
        synxisLog("ensureOnPropertyHub:found-shell-tab", { url: shell.url() });
        current = shell;
      }
    }
  }

  if (!/\/CC\/default\.aspx/i.test(current.url()) || isLoginUrl(current.url())) {
    synxisLog("ensureOnPropertyHub:goto", { target });
    await current.goto(target, { waitUntil: "domcontentloaded", timeout }).catch((err) => {
      synxisLog("ensureOnPropertyHub:goto-failed", String(err));
    });
    await new Promise((r) => setTimeout(r, 2500));
  }
  synxisLog("ensureOnPropertyHub:done", await pageSnapshot(current));
  return current;
}

/**
 * SPH SPA navigation (URL does NOT change with page):
 * Dashboard → click Front Office → click Housekeeping → land on "Room Status".
 */
async function openFrontOfficeHousekeeping(
  page: import("playwright").Page,
  loginUrl: string,
  selectors: typeof DEFAULT_SELECTORS,
  timeout: number
): Promise<import("playwright").Page> {
  let current = page;
  synxisLog("openFrontOfficeHousekeeping:start", await pageSnapshot(current));

  if (selectors.boardUrl?.trim()) {
    const board = selectors.boardUrl.trim();
    const target = /^https?:\/\//i.test(board) ? board : new URL(board, loginUrl).toString();
    synxisLog("openFrontOfficeHousekeeping:boardUrl", { target });
    await current.goto(target, { waitUntil: "domcontentloaded", timeout }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 2500));
  }

  current = await ensureOnPropertyHub(current, loginUrl, selectors, timeout);

  if (await waitForRoomStatusGrid(current, 3_000)) {
    synxisLog("openFrontOfficeHousekeeping:already-room-status");
    return current;
  }

  if (
    await clickFirstVisible(
      current,
      'a:has-text("Go to Room Status"), text=/Go to Room Status/i',
      3_000
    )
  ) {
    synxisLog("openFrontOfficeHousekeeping:clicked-go-to-room-status");
    await new Promise((r) => setTimeout(r, 2000));
    if (await waitForRoomStatusGrid(current, 12_000)) {
      synxisLog("openFrontOfficeHousekeeping:room-status-via-shortcut");
      return current;
    }
  }

  let foClicked = await clickExactMenuLabel(current, /^\s*Front Office\s*$/i);
  if (!foClicked) {
    foClicked = await clickFirstVisible(current, selectors.frontOfficeLink, 20_000);
  }
  synxisLog("openFrontOfficeHousekeeping:front-office-click", { foClicked, ...(await pageSnapshot(current)) });
  if (!foClicked) {
    await current.getByText(/^\s*Front Office\s*$/i).first().hover({ timeout: 5_000 }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 700));
    foClicked = await clickExactMenuLabel(current, /^\s*Front Office\s*$/i);
    synxisLog("openFrontOfficeHousekeeping:front-office-retry", { foClicked });
  }
  await new Promise((r) => setTimeout(r, 1500));

  let hkClicked = await clickExactMenuLabel(current, /^\s*Housekeeping\s*$/i);
  if (!hkClicked) {
    hkClicked = await clickExactMenuLabel(current, /^\s*Room Status\s*$/i);
  }
  if (!hkClicked) {
    hkClicked = await clickFirstVisible(
      current,
      'a:has-text("Housekeeping"), button:has-text("Housekeeping"), [role="menuitem"]:has-text("Housekeeping"), span:has-text("Housekeeping"), li:has-text("Housekeeping") a',
      15_000
    );
  }
  synxisLog("openFrontOfficeHousekeeping:housekeeping-click", { hkClicked, ...(await pageSnapshot(current)) });

  await new Promise((r) => setTimeout(r, 2500));
  const ok = await waitForRoomStatusGrid(current, 35_000);
  synxisLog("openFrontOfficeHousekeeping:wait-grid", { ok, ...(await pageSnapshot(current)) });
  if (!ok) {
    synxisLog("openFrontOfficeHousekeeping:retry-fo-hk");
    await dumpSphShellDebug(current, "fo-hk-before-retry");
    await clickExactMenuLabel(current, /^\s*Front Office\s*$/i);
    await new Promise((r) => setTimeout(r, 800));
    await clickExactMenuLabel(current, /^\s*Housekeeping\s*$/i);
    await new Promise((r) => setTimeout(r, 2500));
    const ok2 = await waitForRoomStatusGrid(current, 20_000);
    synxisLog("openFrontOfficeHousekeeping:retry-result", { ok2, ...(await pageSnapshot(current)) });
    if (!ok2) await dumpSphShellDebug(current, "fo-hk-failed");
  }

  synxisLog("openFrontOfficeHousekeeping:done", await pageSnapshot(current));
  return current;
}

async function openHousekeepingBoard(
  page: import("playwright").Page,
  loginUrl: string,
  selectors: typeof DEFAULT_SELECTORS,
  timeout: number
) {
  return openFrontOfficeHousekeeping(page, loginUrl, selectors, timeout);
}

async function activeSynxisBoardPage(
  context: import("playwright").BrowserContext,
  fallback: import("playwright").Page
) {
  const pages = context.pages();
  if (!pages.length) return fallback;
  for (const p of [...pages].reverse()) {
    if (await looksLikeRoomStatusPage(p)) return p;
  }
  return (
    [...pages].reverse().find((p) => /\/CC\/default\.aspx/i.test(p.url())) ||
    [...pages].reverse().find((p) => isSphAppUrl(p.url())) ||
    fallback
  );
}

const READ_FLASH_FN = () => {
  const num = (raw: string | null | undefined) => {
    if (raw == null) return null;
    const cleaned = String(raw)
      .replace(/USD|EUR|GBP/gi, "")
      .replace(/[,$]/g, "")
      .replace(/%/g, "")
      .trim();
    if (!cleaned || cleaned === "-" || cleaned === "—") return null;
    // Take first number if leftover words remain (e.g. "88.30 ADR")
    const m = cleaned.match(/[-+]?\d[\d,]*(?:\.\d+)?/);
    const n = m ? Number(m[0].replace(/,/g, "")) : Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };
  const textOf = (el: Element | null | undefined) =>
    (el?.textContent || "").replace(/\s+/g, " ").trim();
  // SPH uses "• 23 ›" bullets beside stay counts — normalize before matching.
  const body = (document.body?.innerText || "")
    .replace(/[•·›>]+/g, " ")
    .replace(/\s+/g, " ");

  const valueNearLabel = (labelRe: RegExp): number | null => {
    // Prefer body "Label 12" / "ADR USD 88.30" — avoid sibling metrics in a shared parent.
    const bodyHit = body.match(
      new RegExp(
        "(?:^|\\s)(" +
          labelRe.source +
          ")\\s*[:#]?\\s*(?:USD|EUR|GBP|\\$)?\\s*([-+]?\\d[\\d,]*(?:\\.\\d+)?)",
        "i"
      )
    );
    if (bodyHit) {
      const n = num(bodyHit[2]);
      if (n != null) return n;
    }

    const nodes = Array.from(
      document.querySelectorAll("label, span, div, td, th, li, p, a, strong, h1, h2, h3, h4, dt, dd")
    );
    for (const node of nodes) {
      const labelText = textOf(node);
      if (!labelText || labelText.length > 60) continue;
      if (!labelRe.test(labelText)) continue;
      // Skip large containers that mention the label among other metrics
      if (labelText.length > 28 && /\d/.test(labelText) && !new RegExp("^\\s*" + labelRe.source, "i").test(labelText)) {
        continue;
      }

      // Same node: "Vacant/Dirty 12"
      const selfMatch = labelText.match(labelRe);
      if (selfMatch) {
        const after = labelText.slice(selfMatch.index! + selfMatch[0].length);
        const n = num(after.match(/[-+]?\d[\d,]*(?:\.\d+)?/)?.[0]);
        if (n != null) return n;
      }

      // Only the immediate next sibling (not every sibling under a shared parent)
      const next = node.nextElementSibling;
      if (next) {
        const n = num(textOf(next).match(/[-+]?\d[\d,]*(?:\.\d+)?/)?.[0] || textOf(next));
        if (n != null) return n;
      }
    }

    return null;
  };

  const occupancyPercent =
    valueNearLabel(/occupancy\s*(tonight|today)?/i) ?? valueNearLabel(/^\s*occupancy\s*$/i);
  const expectedAdr = valueNearLabel(/\bADR\b/i) ?? valueNearLabel(/average\s*daily\s*rate/i);
  const preArrivals = valueNearLabel(/pre[-\s]?arrivals?/i);
  const totalArrivals =
    valueNearLabel(/^\s*arriving\s*$/i) ??
    valueNearLabel(/\barriving\b/i) ??
    valueNearLabel(/total\s*arrivals?/i);
  const totalDepartures =
    valueNearLabel(/^\s*departing\s*$/i) ??
    valueNearLabel(/\bdeparting\b/i) ??
    valueNearLabel(/total\s*departures?/i);
  const stayovers = valueNearLabel(/stay\s*overs?/i);
  const dayUse = valueNearLabel(/day\s*use/i);
  const checkedOut = valueNearLabel(/checked[-\s]?outs?/i);
  // Room Status widget: header number is TOTAL DIRTY (e.g. "Room Status 27"),
  // not Occupied/Dirty — never assign that banner to occupiedDirty.
  const roomStatusTotalDirty =
    num(body.match(/Room\s*Status\s*(\d{1,4})/i)?.[1]) ??
    valueNearLabel(/total\s*dirty\s*rooms?/i);

  const statusCount = (label: RegExp) => {
    // Prefer "Vacant/Dirty 17" / "Vacant/Dirty\n17" in body (label then number).
    const m = body.match(
      new RegExp(label.source + "\\s*[:#]?\\s*(\\d{1,4})(?!\\d)", "i")
    );
    if (m) return num(m[1]);
    return valueNearLabel(label);
  };

  const vacantClean = statusCount(/Vacant\s*\/?\s*Clean/i);
  const vacantDirty = statusCount(/Vacant\s*\/?\s*Dirty/i);
  const occupiedClean = statusCount(/Occupied\s*\/?\s*Clean/i);
  let occupiedDirty = statusCount(/Occupied\s*\/?\s*Dirty/i);
  // If Occupied/Dirty swallowed the Room Status banner (same number), recompute.
  if (
    occupiedDirty != null &&
    roomStatusTotalDirty != null &&
    occupiedDirty === roomStatusTotalDirty &&
    vacantDirty != null &&
    vacantDirty < roomStatusTotalDirty
  ) {
    occupiedDirty = Math.max(0, roomStatusTotalDirty - vacantDirty);
  }
  // Banner present but Occupied/Dirty missing → derive from total dirty − vacant dirty.
  if (occupiedDirty == null && roomStatusTotalDirty != null && vacantDirty != null) {
    occupiedDirty = Math.max(0, roomStatusTotalDirty - vacantDirty);
  }

  const ooo = statusCount(/Out\s*of\s*Order/i) ?? valueNearLabel(/^\s*OOO\s*$/i);
  const outOfInventory =
    statusCount(/Out\s*of\s*Inventory/i) ?? valueNearLabel(/^\s*OOI\s*$/i);
  const vacant =
    vacantClean != null || vacantDirty != null
      ? (vacantClean ?? 0) + (vacantDirty ?? 0)
      : valueNearLabel(/^\s*vacant\s*$/i);
  const available = valueNearLabel(/^\s*available\s*$/i) ?? valueNearLabel(/rooms?\s*available/i);

  // Prefer Room Status banner as vacantDirtyRemaining when present
  const vacantDirtyRemaining =
    roomStatusTotalDirty ?? vacantDirty ?? null;

  const hasAny = [
    occupancyPercent,
    expectedAdr,
    preArrivals,
    totalArrivals,
    totalDepartures,
    stayovers,
    dayUse,
    checkedOut,
    vacantClean,
    vacantDirty,
    occupiedClean,
    occupiedDirty,
    ooo,
    outOfInventory,
    vacant,
  ].some((v) => v != null);

  if (!hasAny) return null;
  return {
    occupancyPercent,
    expectedAdr,
    totalArrivals,
    checkInsCompleted: null as number | null,
    checkInsRemaining: null as number | null,
    totalDepartures,
    vacantDirtyRemaining,
    totalRoomsAvailable: available,
    checkIns: totalArrivals,
    stayovers,
    vacant,
    ooo,
    available,
    preArrivals,
    dayUse,
    checkedOut,
    vacantClean,
    vacantDirty,
    occupiedClean,
    occupiedDirty,
    outOfInventory,
  };
};

type FlashRaw = NonNullable<ReturnType<typeof READ_FLASH_FN>>;

/** Scrape SPH / Control Center home dashboard metrics (main page + iframes). */
async function readSynxisHomeFlash(page: import("playwright").Page): Promise<PmsFlashStats | null> {
  const merged: Partial<FlashRaw> = {};
  let found = false;

  for (const root of synxisDomRoots(page)) {
    const raw = await root.evaluate(READ_FLASH_FN).catch(() => null);
    if (!raw) continue;
    found = true;
    for (const [key, value] of Object.entries(raw) as Array<[keyof FlashRaw, FlashRaw[keyof FlashRaw]]>) {
      if (value != null && merged[key] == null) {
        (merged as Record<string, unknown>)[key as string] = value;
      }
    }
  }

  if (!found) return null;
  return {
    occupancyPercent: merged.occupancyPercent ?? null,
    expectedAdr: merged.expectedAdr ?? null,
    totalArrivals: merged.totalArrivals ?? null,
    checkInsCompleted: merged.checkInsCompleted ?? null,
    checkInsRemaining: merged.checkInsRemaining ?? null,
    totalDepartures: merged.totalDepartures ?? null,
    vacantDirtyRemaining: merged.vacantDirtyRemaining ?? null,
    totalRoomsAvailable: merged.totalRoomsAvailable ?? null,
    checkIns: merged.checkIns ?? null,
    stayovers: merged.stayovers ?? null,
    vacant: merged.vacant ?? null,
    ooo: merged.ooo ?? null,
    available: merged.available ?? null,
    preArrivals: merged.preArrivals ?? null,
    dayUse: merged.dayUse ?? null,
    checkedOut: merged.checkedOut ?? null,
    vacantClean: merged.vacantClean ?? null,
    vacantDirty: merged.vacantDirty ?? null,
    occupiedClean: merged.occupiedClean ?? null,
    occupiedDirty: merged.occupiedDirty ?? null,
    outOfInventory: merged.outOfInventory ?? null,
    collectedAt: new Date().toISOString(),
    sourceUrl: page.url(),
  };
}

type BoardRow = {
  roomNumber: string;
  roomType: string;
  housekeeping: string;
  occupancy: string;
  guestStatus: string;
};

function aggregateBoardStatusCounts(rows: BoardRow[]) {
  const counts = {
    vacantClean: 0,
    vacantDirty: 0,
    occupiedClean: 0,
    occupiedDirty: 0,
    ooo: 0,
    outOfInventory: 0,
    stayovers: 0,
    checkedOut: 0,
    dayUse: 0,
    arriving: 0,
    departing: 0,
  };

  for (const row of rows) {
    const hk = (row.housekeeping || "").toLowerCase();
    const occ = (row.occupancy || "").toLowerCase();
    const guest = (row.guestStatus || "").toLowerCase();
    const blob = `${hk} ${occ} ${guest}`;

    if (/out\s*of\s*inventory|\booi\b/.test(blob)) {
      counts.outOfInventory += 1;
      continue;
    }
    if (/out\s*of\s*order|\booo\b/.test(blob)) {
      counts.ooo += 1;
      continue;
    }

    const isClean = /\bclean\b|\bready\b|\binspected\b/.test(hk);
    const isDirty = /\bdirty\b|\bpickup\b/.test(hk) || (!isClean && Boolean(hk));
    const isVacant = /\bvacant\b/.test(occ);
    const isOccupied = /\boccupied\b/.test(occ);

    if (isVacant && isClean) counts.vacantClean += 1;
    else if (isVacant && isDirty) counts.vacantDirty += 1;
    else if (isOccupied && isClean) counts.occupiedClean += 1;
    else if (isOccupied && isDirty) counts.occupiedDirty += 1;
    else if (isVacant) counts.vacantDirty += 1;
    else if (isOccupied) counts.occupiedDirty += 1;

    if (/stay\s*over/.test(guest)) counts.stayovers += 1;
    if (/checked\s*out/.test(guest)) counts.checkedOut += 1;
    if (/day\s*use/.test(guest) || /day\s*use/.test(blob)) counts.dayUse += 1;
    if (/arriv/.test(guest)) counts.arriving += 1;
    if (/due\s*out|depart/.test(guest)) counts.departing += 1;
  }

  return counts;
}

function countDirtyRooms(rows: BoardRow[]) {
  return rows.filter((r) => /\bdirty\b|\bpickup\b/i.test(r.housekeeping || "")).length;
}

/** Build HouseKeepAI dashboard flash from Room Status board rows (not SPH Home widgets). */
function flashFromBoardRows(rows: BoardRow[], sourceUrl?: string): PmsFlashStats {
  const counts = aggregateBoardStatusCounts(rows);
  const vacantDirty = counts.vacantDirty;
  const vacantClean = counts.vacantClean;
  return {
    occupancyPercent: null,
    expectedAdr: null,
    totalArrivals: counts.arriving || null,
    checkInsCompleted: null,
    checkInsRemaining: null,
    totalDepartures: counts.departing || null,
    vacantDirtyRemaining: vacantDirty,
    totalRoomsAvailable: null,
    checkIns: counts.arriving || null,
    stayovers: counts.stayovers || null,
    vacant: vacantClean + vacantDirty,
    ooo: counts.ooo || null,
    available: null,
    preArrivals: null,
    dayUse: counts.dayUse || null,
    checkedOut: counts.checkedOut || null,
    vacantClean,
    vacantDirty,
    occupiedClean: counts.occupiedClean,
    occupiedDirty: counts.occupiedDirty,
    outOfInventory: counts.outOfInventory || null,
    collectedAt: new Date().toISOString(),
    sourceUrl,
  };
}

/**
 * Compare SPH Dashboard + Room Status page banner to the scraped table.
 * Focus: Occupied/Clean, Occupied/Dirty, Vacant/Clean, Vacant/Dirty — never miss dirty rooms.
 */
export function compareFlashToBoard(
  flash: PmsFlashStats | null,
  rows: BoardRow[],
  pageMeta?: RoomStatusPageMeta | null
): string[] {
  if (rows.length === 0) return [];
  const board = aggregateBoardStatusCounts(rows);
  const mismatches: string[] = [];
  const check = (label: string, expected: number | null | undefined, actual: number) => {
    if (expected == null) return;
    if (expected !== actual) mismatches.push(`${label}: expected ${expected} vs scraped ${actual}`);
  };

  if (flash) {
    check("Vacant/Clean", flash.vacantClean, board.vacantClean);
    check("Vacant/Dirty", flash.vacantDirty ?? flash.vacantDirtyRemaining, board.vacantDirty);
    check("Occupied/Clean", flash.occupiedClean, board.occupiedClean);
    check("Occupied/Dirty", flash.occupiedDirty, board.occupiedDirty);
    check("Out of Order", flash.ooo, board.ooo);
    check("Out Of Inventory", flash.outOfInventory, board.outOfInventory);

    const dashRoomTotal =
      (flash.vacantClean ?? 0) +
      (flash.vacantDirty ?? flash.vacantDirtyRemaining ?? 0) +
      (flash.occupiedClean ?? 0) +
      (flash.occupiedDirty ?? 0) +
      (flash.ooo ?? 0) +
      (flash.outOfInventory ?? 0);
    const hasDashRoomCounts =
      flash.vacantClean != null ||
      flash.vacantDirty != null ||
      flash.vacantDirtyRemaining != null ||
      flash.occupiedClean != null ||
      flash.occupiedDirty != null ||
      flash.ooo != null ||
      flash.outOfInventory != null;
    if (hasDashRoomCounts && dashRoomTotal > 0 && rows.length !== dashRoomTotal) {
      mismatches.push(`Total rooms: dashboard ${dashRoomTotal} vs scraped ${rows.length}`);
    }
  }

  // Room Status page banner: "51 of 51 Rooms" / "Total Dirty Rooms 24"
  if (pageMeta?.totalRooms != null && rows.length !== pageMeta.totalRooms) {
    mismatches.push(`Total rooms: page ${pageMeta.totalRooms} vs scraped ${rows.length}`);
  }
  const scrapedDirty = countDirtyRooms(rows);
  if (pageMeta?.totalDirtyRooms != null && scrapedDirty !== pageMeta.totalDirtyRooms) {
    mismatches.push(`Total Dirty Rooms: page ${pageMeta.totalDirtyRooms} vs scraped ${scrapedDirty}`);
  }

  return mismatches;
}

/**
 * Reset Room Status so we see the full inventory (e.g. "51 of 51 Rooms").
 * IMPORTANT: do NOT uncheck Vacant/Dirty/… chips — those are "include" filters;
 * unchecking them emptied the board (0 rooms) on AmericInn.
 */
async function clearRoomStatusFilters(page: import("playwright").Page) {
  for (const root of synxisDomRoots(page)) {
    // Explicit clear/reset only (avoid generic aria-label=clear which can wipe the grid)
    const clearBtns = root.locator(
      'button:has-text("Clear All"), button:has-text("Clear Filters"), a:has-text("Clear Filters"), button:has-text("Reset Filters"), button:has-text("Reset"), button:has-text("Clear")'
    );
    const n = await clearBtns.count().catch(() => 0);
    for (let i = 0; i < Math.min(n, 3); i++) {
      const btn = clearBtns.nth(i);
      if (!(await btn.isVisible().catch(() => false))) continue;
      const text = ((await btn.innerText().catch(() => "")) || "").trim();
      // Skip destructive / unrelated Clear buttons
      if (/clear\s*selection|clear\s*cart/i.test(text)) continue;
      await btn.click({ timeout: 3_000 }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Ensure status "include" checkboxes are ON (checked), never turn them off
    const statusLabels =
      /vacant\s*\/?\s*clean|vacant\s*\/?\s*dirty|occupied\s*\/?\s*clean|occupied\s*\/?\s*dirty|out\s*of\s*order|out\s*of\s*inventory/i;
    const boxes = root.locator('input[type="checkbox"], [role="checkbox"]');
    const boxCount = await boxes.count().catch(() => 0);
    if (boxCount > 0 && boxCount <= 16) {
      for (let i = 0; i < boxCount; i++) {
        const box = boxes.nth(i);
        if (!(await box.isVisible().catch(() => false))) continue;
        const near = await box
          .evaluate((el) => {
            const row = el.closest("label, li, div, span, td") || el.parentElement;
            return (row?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
          })
          .catch(() => "");
        if (!statusLabels.test(near)) continue;
        const checked =
          (await box.getAttribute("aria-checked").catch(() => null)) === "true" ||
          (await box.isChecked().catch(() => false));
        if (!checked) {
          await box.click({ timeout: 2_000 }).catch(() => undefined);
        }
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  }
}

async function maximizeRoomStatusPageSize(page: import("playwright").Page) {
  // Try "show all" / largest page-size so we need fewer pager clicks (grid is often in an iframe)
  for (const root of synxisDomRoots(page)) {
    const sizeSelect = root
      .locator(
        'select[aria-label*="page size" i], select.k-pager-sizes, .k-pager-sizes select, select[name*="pageSize" i], .dx-page-size select'
      )
      .first();
    if ((await sizeSelect.count()) === 0 || !(await sizeSelect.isVisible().catch(() => false))) continue;
    const options = await sizeSelect.locator("option").allTextContents().catch(() => [] as string[]);
    const preferred =
      options.find((o) => /all|999|500|200|100/i.test(o)) ||
      options.sort((a, b) => (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0))[0];
    if (preferred) {
      await sizeSelect.selectOption({ label: preferred }).catch(async () => {
        await sizeSelect.selectOption({ value: preferred }).catch(() => undefined);
      });
      await new Promise((r) => setTimeout(r, 1500));
      return;
    }
  }
}

async function goToRoomStatusFirstPage(page: import("playwright").Page) {
  for (const root of synxisDomRoots(page)) {
    const first = root
      .locator(
        'a[title*="first" i], button[title*="first" i], .k-pager-first, .dx-navigate-button.dx-prev-button, [aria-label*="first page" i], a:has-text("«"), button:has-text("«")'
      )
      .first();
    if ((await first.count()) === 0 || !(await first.isVisible().catch(() => false))) continue;
    const disabled =
      (await first.getAttribute("aria-disabled").catch(() => null)) === "true" ||
      (await first.getAttribute("disabled").catch(() => null)) != null ||
      (await first
        .evaluate((el) => el.classList.contains("k-state-disabled") || el.classList.contains("dx-button-disable"))
        .catch(() => false));
    if (!disabled) {
      await first.click({ timeout: 5_000 }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 1200));
      return;
    }
  }
}

async function clickRoomStatusNextPage(page: import("playwright").Page): Promise<boolean> {
  const before = await scrapeBoardRows(page);
  const beforeKey = before.map((r) => r.roomNumber).sort().join(",");

  for (const root of synxisDomRoots(page)) {
    const next = root
      .locator(
        'a[title*="next" i], button[title*="next" i], .k-pager-next, [aria-label*="next page" i], a:has-text("›"), button:has-text("›"), a:has-text(">"), button:has-text("Next")'
      )
      .first();
    if ((await next.count()) === 0 || !(await next.isVisible().catch(() => false))) continue;
    const disabled =
      (await next.getAttribute("aria-disabled").catch(() => null)) === "true" ||
      (await next.getAttribute("disabled").catch(() => null)) != null ||
      (await next
        .evaluate(
          (el) =>
            el.classList.contains("k-state-disabled") ||
            el.classList.contains("k-disabled") ||
            el.classList.contains("dx-button-disable") ||
            el.classList.contains("disabled")
        )
        .catch(() => false));
    if (disabled) continue;

    await next.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 1500));
    const after = await scrapeBoardRows(page);
    const afterKey = after.map((r) => r.roomNumber).sort().join(",");
    if (afterKey && afterKey === beforeKey) return false;
    return true;
  }
  return false;
}

/** Scrape Room Status across every pager page until we have all rooms (e.g. 195 of 195). */
async function scrapeAllRoomStatusPages(page: import("playwright").Page): Promise<{
  rows: BoardRow[];
  meta: RoomStatusPageMeta;
}> {
  await clearRoomStatusFilters(page);
  await maximizeRoomStatusPageSize(page);
  await goToRoomStatusFirstPage(page);

  const meta = await readRoomStatusPageMeta(page);
  const merged: BoardRow[] = [];
  const seen = new Set<string>();
  const maxPages = 40;
  const targetTotal = meta.totalRooms;
  synxisLog("scrapeAllRoomStatusPages:start", {
    shown: meta.shownRooms,
    total: meta.totalRooms,
    dirtyBanner: meta.totalDirtyRooms,
  });

  for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
    let pageRows: BoardRow[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      pageRows = await scrapeBoardRows(page);
      if (pageRows.length > 0) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    for (const row of pageRows) {
      if (!row.roomNumber || seen.has(row.roomNumber)) continue;
      seen.add(row.roomNumber);
      merged.push(row);
    }
    synxisLog("scrapeAllRoomStatusPages:page", {
      pageIdx,
      pageRows: pageRows.length,
      merged: merged.length,
      targetTotal,
    });

    // "51 of 51 Rooms" — stop early when we have the full inventory
    if (targetTotal != null && merged.length >= targetTotal) break;

    const moved = await clickRoomStatusNextPage(page);
    if (!moved) break;
  }

  const finalMeta = (await readRoomStatusPageMeta(page)) || meta;
  synxisLog("scrapeAllRoomStatusPages:done", { rooms: merged.length, meta: finalMeta });
  return { rows: merged, meta: finalMeta };
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
    /** When true (write-back), open Front Office → Housekeeping after auth. Collect opens Home first. */
    openBoardAfterAuth?: boolean;
    /** Only true when Playwright was launched with a fresh storageState. */
    trySavedSession?: boolean;
  }
): Promise<SynxisSessionResult> {
  const loginUrl = normalizeLoginUrl(input.loginUrl);
  const appUrl = controlCenterDefaultAspxUrl(loginUrl);
  let password = input.password;
  let rotatedPassword: string | null = null;
  const openBoard = input.openBoardAfterAuth !== false;
  const trySavedSession = Boolean(input.trySavedSession);
  synxisLog("ensureSynxisSession:start", { loginUrl, appUrl, openBoard, trySavedSession });

  // Reuse cookies only when the browser context was started with storageState.
  // Without that, /CC/default.aspx just redirects to login.aspx?ReturnUrl=… and wastes time.
  if (trySavedSession) {
    synxisLog("ensureSynxisSession:try-saved-session", { appUrl });
    await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: input.timeout }).catch((err) => {
      synxisLog("ensureSynxisSession:goto-app-failed", String(err));
    });
    await new Promise((r) => setTimeout(r, 1500));
    synxisLog("ensureSynxisSession:after-app-goto", await pageSnapshot(page));

    if (!(await pageNeedsLogin(page, input.selectors)) && !isLoginUrl(page.url())) {
      synxisLog("ensureSynxisSession:saved-session-ok");
      const rotated = await completePasswordChangeIfPresent(page, input.selectors, password);
      if (rotated) {
        rotatedPassword = rotated;
        password = rotated;
      }
      if (openBoard) {
        await openHousekeepingBoard(page, loginUrl, input.selectors, input.timeout);
      }
      if (!(await pageNeedsLogin(page, input.selectors)) && !isLoginUrl(page.url())) {
        synxisLog("ensureSynxisSession:done-via-session", await pageSnapshot(page));
        return {
          storageStateJson: JSON.stringify(await context.storageState()),
          rotatedPassword,
        };
      }
    }
  }

  // Use the configured login URL as-is (e.g. …/cc/login.aspx) — do not invent ReturnUrl.
  synxisLog("ensureSynxisSession:full-login", { loginUrl });
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: input.timeout });
  await new Promise((r) => setTimeout(r, 1000));
  synxisLog("ensureSynxisSession:login-page", await pageSnapshot(page));

  const user = await firstVisible(page, input.selectors.username, 25_000);
  await user.click({ timeout: 5_000 }).catch(() => undefined);
  await user.fill("");
  await user.pressSequentially(input.username, { delay: 30 }).catch(async () => {
    await user.fill(input.username);
  });
  // Trigger SynXis IsSabreOrSSOUser AJAX on blur — password often stays
  // display:none until that call returns; that is normal for local accounts.
  await user.press("Tab").catch(() => user.blur().catch(() => undefined));
  const afterUser = await waitAfterUsernameForPasswordOrSso(page);
  synxisLog("ensureSynxisSession:after-username", afterUser);
  if (afterUser.kind === "sso") {
    throw new Error(
      `SynXis username "${input.username}" is configured for SSO (password login is disabled). Use a local SynXis/Property Hub username+password account (not Aven SSO), or complete SSO once in a browser and we can reuse Remember-me session.`
    );
  }
  if (afterUser.kind === "timeout") {
    synxisLog("ensureSynxisSession:password-timeout", afterUser.msgs);
    throw new Error(
      `SynXis password field did not appear after username "${input.username}". Check the username, or try again — the portal may still be loading.`
    );
  }

  const pass = page
    .locator(
      "#LoginCntrl_PasswordTextBox, input[name='LoginCntrl$PasswordTextBox'], " + input.selectors.password
    )
    .first();
  await pass.waitFor({ state: "visible", timeout: 10_000 });
  await pass.click({ timeout: 5_000 }).catch(() => undefined);
  await pass.fill("");
  await pass.pressSequentially(password, { delay: 20 }).catch(async () => {
    await pass.fill(password);
  });
  // Confirm the password actually stuck (SynXis sometimes clears the field).
  const filledLen = await pass.inputValue().then((v) => v.length).catch(() => 0);
  if (filledLen < 1) {
    await pass.fill(password);
  }
  await checkRememberMe(page, input.selectors);
  synxisLog("ensureSynxisSession:credentials-filled", {
    passwordLen: await pass.inputValue().then((v) => v.length).catch(() => -1),
    ...(await readLoginPageMessages(page)),
  });

  // Exact ASP.NET Sign In button (avoids clicking wrong submit)
  const signIn = page.locator("#LoginCntrl_LoginButton, input[name='LoginCntrl$LoginButton']").first();
  const clickSignIn = async () => {
    if ((await signIn.count()) > 0) {
      await signIn.click({ timeout: 8_000 });
    } else {
      const submit = page.locator(input.selectors.submit).first();
      await submit.click({ timeout: 8_000 }).catch(() => pass.press("Enter"));
    }
  };
  await Promise.all([
    page
      .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 })
      .catch(() => null),
    clickSignIn(),
  ]);
  await new Promise((r) => setTimeout(r, 2500));
  synxisLog("ensureSynxisSession:after-submit", {
    ...(await pageSnapshot(page)),
    ...(await readLoginPageMessages(page)),
    accessDeniedLanding: isAccessDeniedLanding(page.url()),
  });

  // Expected: login.aspx?ReturnUrl=...AccessDenied... with PassCode MFA card (not username/password).
  for (let i = 0; i < 40 && !(await looksLikeSynxisPasscodePage(page)); i++) {
    if (await page.locator("#LoginCntrl_UsernameTextBox").isVisible().catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  synxisLog("ensureSynxisSession:await-mfa-card", await pageSnapshot(page));

  const postMsgs = await readLoginPageMessages(page);
  // Ignore AccessDenied noise; only fail on real login rejection while username form is still up
  if (
    postMsgs.error &&
    (await page.locator("#LoginCntrl_UsernameTextBox").isVisible().catch(() => false)) &&
    !(await looksLikeSynxisPasscodePage(page))
  ) {
    synxisLog("ensureSynxisSession:login-error-label", postMsgs.error);
    throw new Error(`SynXis rejected login: ${postMsgs.error}`);
  }

  synxisLog("ensureSynxisSession:otp-check");
  let didOtp = await completeEmailOtpIfPresent(page, input.selectors, input.auth?.imap);
  await checkRememberMe(page, input.selectors);
  synxisLog("ensureSynxisSession:after-otp", { didOtp, ...(await pageSnapshot(page)) });

  if ((await looksLikeSynxisPasscodePage(page)) || (await pageNeedsLogin(page, input.selectors))) {
    synxisLog("ensureSynxisSession:still-on-mfa-retry-otp");
    didOtp = (await completeEmailOtpIfPresent(page, input.selectors, input.auth?.imap)) || didOtp;
  }

  const rotated = await completePasswordChangeIfPresent(page, input.selectors, password);
  if (rotated) {
    rotatedPassword = rotated;
    password = rotated;
    synxisLog("ensureSynxisSession:password-rotated");
  }

  const loggedIn = await waitUntilLoggedIntoSph(page, loginUrl, Math.max(input.timeout, 45_000));
  if (!loggedIn || (await pageNeedsLogin(page, input.selectors))) {
    const failMsgs = await readLoginPageMessages(page);
    const snap = await pageSnapshot(page);
    synxisLog("ensureSynxisSession:LOGIN-FAILED", {
      ...snap,
      ...failMsgs,
      didOtp,
      hasImap: Boolean(input.auth?.imap?.host && input.auth?.imap?.user),
      configuredLoginUrl: loginUrl,
    });
    const hint = failMsgs.error
      ? ` SynXis says: ${failMsgs.error}`
      : didOtp
        ? " OTP was submitted but the session still did not open."
        : (await looksLikeSynxisPasscodePage(page))
          ? " Still on PassCode MFA (SEND PASSCODE → type code → LOG IN)."
          : input.auth?.imap?.host
            ? " After Sign In, PassCode MFA was not completed. Confirm IMAP receives the SynXis passcode."
            : " After Sign In, MFA was not completed. Configure IMAP OTP on the PMS SynXis settings.";
    throw new Error(
      `SynXis could not finish login (now at ${page.url()}).${hint}`
    );
  }

  // Preferred: SynXis now lands on SPH Dashboard after MFA. Only fall back to
  // Home → SPH Dashboard if we're on AccessDenied / empty CRS shell.
  if (await looksLikeSphDashboard(page)) {
    synxisLog("ensureSynxisSession:landed-on-sph-dashboard", await pageSnapshot(page));
  } else if (!openBoard) {
    synxisLog("ensureSynxisSession:ensure-sph-dashboard", {
      appUrl,
      url: page.url(),
      accessDenied: isAccessDeniedLanding(page.url()),
    });
    if (!/\/CC\/default\.aspx/i.test(page.url()) && isAccessDeniedLanding(page.url())) {
      await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: input.timeout }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 2000));
    }
    await openSynxisHome(page, loginUrl, input.selectors, input.timeout);
  }

  if (openBoard) {
    await openHousekeepingBoard(page, loginUrl, input.selectors, input.timeout);
  }
  synxisLog("ensureSynxisSession:done", await pageSnapshot(page));
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

/**
 * SPH Room Status table scraper (column-aware).
 * Columns: ROOM | ROOM TYPE | HOUSEKEEPING STATUS (Clean/Dirty) | OCCUPANCY (Occupied/Vacant) | GUEST STATUS
 */
const SCRAPE_BOARD_FN = () => {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const out: Array<{
    roomNumber: string;
    roomType: string;
    housekeeping: string;
    occupancy: string;
    guestStatus: string;
  }> = [];
  const seen = new Set<string>();
  const roomRe = /^[A-Za-z]{0,3}\d{1,5}[A-Za-z]?$/;

  /** Visible cell text only. textContent includes hidden dropdown options ("Clean Dirty") and marks every room Dirty. */
  const cellLabel = (el: HTMLElement) => {
    const select = el.querySelector("select") as HTMLSelectElement | null;
    if (select?.selectedOptions?.[0]) return normalize(select.selectedOptions[0].textContent || "");
    const titled = el.querySelector("[title]") as HTMLElement | null;
    const title = (el.getAttribute("title") || titled?.getAttribute("title") || "").trim();
    const visible = normalize((el as HTMLElement).innerText || "");
    if (title && title.length <= 40 && !visible) return normalize(title);
    return visible || normalize(title);
  };

  const parseHk = (raw: string) => {
    const t = normalize(raw);
    if (!t || t.length > 40) return "";
    const dirty = /\bdirty\b|\bpick\s*up\b|\bpickup\b/i.test(t);
    const clean = /\bclean\b|\bready\b/i.test(t);
    const inspected = /\binspected\b/i.test(t);
    // Dropdowns list several statuses — don't guess.
    if ([dirty, clean, inspected].filter(Boolean).length !== 1) return "";
    if (dirty) return "Dirty";
    if (inspected) return "Inspected";
    if (clean) return "Clean";
    return "";
  };
  const parseOcc = (raw: string) => {
    const t = normalize(raw);
    if (!t || t.length > 40) return "";
    const occ = /\boccupied\b/i.test(t);
    const vac = /\bvacant\b/i.test(t);
    if (occ === vac) return "";
    if (occ) return "Occupied";
    if (vac) return "Vacant";
    return "";
  };
  const parseGuest = (raw: string) => {
    const t = normalize(raw);
    if (/\bstay\s*overs?\b|\bstay-overs?\b/i.test(t)) return "Stay Over";
    if (/\bchecked[-\s]?outs?\b/i.test(t)) return "Checked-out";
    if (/\bchecked[-\s]?ins?\b/i.test(t)) return "Checked-in";
    if (/\bdue\s*out\b|\bdeparting\b|\bdeparture\b/i.test(t)) return "Departing";
    if (/\barriving\b|\barrivals?\b|\bdue\s*in\b/i.test(t)) return "Arriving";
    if (/\bday\s*use\b/i.test(t)) return "Day Use";
    return "";
  };
  const parseOrder = (raw: string) => {
    const t = normalize(raw);
    if (/out\s*of\s*inventory|\booi\b/i.test(t)) return "Out of Inventory";
    if (/out\s*of\s*order|\booo\b/i.test(t)) return "Out of Order";
    return "";
  };

  const headerRow = Array.from(
    document.querySelectorAll("table thead tr, table tr, [role='row']")
  ).find((tr) => {
    const text = normalize((tr as HTMLElement).innerText || "");
    return /housekeeping\s*status/i.test(text) && /occupancy/i.test(text) && /\broom\b/i.test(text);
  }) as HTMLElement | undefined;

  let idxRoom = -1;
  let idxType = -1;
  let idxHk = -1;
  let idxOcc = -1;
  let idxGuest = -1;
  let idxOrder = -1;

  if (headerRow) {
    const headers = Array.from(
      headerRow.querySelectorAll("th, td, [role='columnheader'], [role='cell']")
    ).map((c) => normalize((c as HTMLElement).innerText || c.textContent || "").toLowerCase());
    headers.forEach((h, i) => {
      if (idxRoom < 0 && /^room$/.test(h)) idxRoom = i;
      if (idxType < 0 && /room\s*type/.test(h)) idxType = i;
      if (idxHk < 0 && /housekeeping/.test(h)) idxHk = i;
      if (idxOcc < 0 && /^occupancy$/.test(h)) idxOcc = i;
      if (idxGuest < 0 && /guest\s*status/.test(h)) idxGuest = i;
      if (idxOrder < 0 && /order\s*status/.test(h)) idxOrder = i;
    });
  }

  // Only fall back to SPH column positions when the header row was found but a label was missed.
  // Blind defaults mis-read Clean as Dirty.

  const rowEls = Array.from(
    document.querySelectorAll(
      "table tbody tr, table tr, [role='row'], .k-grid-content tr, .k-master-row, .dx-data-row, .ag-row"
    )
  ) as HTMLElement[];

  for (const tr of rowEls) {
    if (tr === headerRow) continue;
    const cellEls = Array.from(
      tr.querySelectorAll("td, th, [role='cell'], [role='gridcell'], [col-id]")
    ) as HTMLElement[];
    if (cellEls.length < 3) continue;
    const cells = cellEls.map((c) => cellLabel(c));
    const joined = cells.join(" | ");
    if (/housekeeping\s*status/i.test(joined) && /occupancy/i.test(joined) && !/\b\d{2,4}\b/.test(joined)) {
      continue; // header
    }

    let roomNumber = "";
    // Blue room number link in ROOM column (SPH)
    const roomCell = idxRoom >= 0 && idxRoom < cellEls.length ? cellEls[idxRoom] : null;
    const roomLink =
      (roomCell?.querySelector("a") as HTMLAnchorElement | null) ||
      (tr.querySelector("a") as HTMLAnchorElement | null);
    if (roomLink) {
      const linkText = normalize(roomLink.textContent || "");
      if (roomRe.test(linkText) && /\d/.test(linkText)) roomNumber = linkText;
    }
    if (!roomNumber && idxRoom >= 0 && idxRoom < cells.length && roomRe.test(cells[idxRoom])) {
      roomNumber = cells[idxRoom];
    }
    if (!roomNumber) {
      for (const cell of cells) {
        if (roomRe.test(cell) && /\d/.test(cell) && cell.length <= 6) {
          roomNumber = cell;
          break;
        }
      }
    }
    if (!roomNumber || seen.has(roomNumber)) continue;

    const roomType = idxType >= 0 && idxType < cells.length ? cells[idxType] : "";
    let hk = idxHk >= 0 && idxHk < cells.length ? parseHk(cells[idxHk]) : "";
    let occ = idxOcc >= 0 && idxOcc < cells.length ? parseOcc(cells[idxOcc]) : "";
    let guest = idxGuest >= 0 && idxGuest < cells.length ? parseGuest(cells[idxGuest]) : "";
    if (!hk) {
      for (const cell of cells) {
        const parsed = parseHk(cell);
        if (parsed) {
          hk = parsed;
          break;
        }
      }
    }
    if (!occ) {
      for (const cell of cells) {
        const parsed = parseOcc(cell);
        if (parsed) {
          occ = parsed;
          break;
        }
      }
    }
    if (!guest) {
      for (const cell of cells) {
        const parsed = parseGuest(cell);
        if (parsed) {
          guest = parsed;
          break;
        }
      }
    }
    // Only trust Order Status from a real header column — never from full-row text
    // (page chrome / filters often contain "Out of Order" and poison every row).
    const order =
      idxOrder >= 0 && idxOrder < cells.length ? parseOrder(cells[idxOrder]) : "";

    // Do not scan the whole row — hidden menus repeat "Dirty" and "Clean" and poison every room.
    if (order === "Out of Order" || order === "Out of Inventory") {
      guest = order;
    }

    // Skip the room if Housekeeping Status was not a single visible Clean/Dirty value.
    if (!hk) continue;

    seen.add(roomNumber);
    out.push({
      roomNumber,
      roomType: /^[A-Za-z0-9]{1,8}$/.test(roomType) ? roomType : "",
      housekeeping: hk,
      occupancy: occ,
      guestStatus: guest || order,
    });
  }

  return out;
};

type RoomStatusPageMeta = {
  shownRooms: number | null;
  totalRooms: number | null;
  totalDirtyRooms: number | null;
};

async function readRoomStatusPageMeta(page: import("playwright").Page): Promise<RoomStatusPageMeta> {
  for (const root of synxisDomRoots(page)) {
    const meta = await root
      .evaluate(() => {
        const text = (document.body?.innerText || "").replace(/\s+/g, " ");
        const ofMatch = text.match(/(\d+)\s*of\s*(\d+)\s*Rooms?/i);
        const dirtyMatch = text.match(/Total\s*Dirty\s*Rooms?\s*(\d+)/i);
        return {
          shownRooms: ofMatch ? Number(ofMatch[1]) : null,
          totalRooms: ofMatch ? Number(ofMatch[2]) : null,
          totalDirtyRooms: dirtyMatch ? Number(dirtyMatch[1]) : null,
        };
      })
      .catch(() => null);
    if (meta && (meta.shownRooms != null || meta.totalRooms != null || meta.totalDirtyRooms != null)) {
      return meta;
    }
  }
  return { shownRooms: null, totalRooms: null, totalDirtyRooms: null };
}

async function scrapeBoardRows(page: import("playwright").Page): Promise<BoardRow[]> {
  const merged: BoardRow[] = [];
  const seen = new Set<string>();

  for (const root of synxisDomRoots(page)) {
    const rows = await root.evaluate(SCRAPE_BOARD_FN).catch(() => [] as BoardRow[]);
    for (const row of rows) {
      if (!row.roomNumber || seen.has(row.roomNumber)) continue;
      seen.add(row.roomNumber);
      merged.push(row);
    }
  }
  return merged;
}

/** Scrape room numbers from whatever list/filter view the dashboard metric opened. */
async function scrapeRoomNumbersFromCurrentView(page: import("playwright").Page): Promise<string[]> {
  const fromBoard = await scrapeBoardRows(page);
  if (fromBoard.length > 0) return fromBoard.map((r) => r.roomNumber);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const root of synxisDomRoots(page)) {
    const rooms = await root
      .evaluate(() => {
        const roomRe = /^[A-Za-z]{0,3}\d{1,5}[A-Za-z]?$/;
        const localSeen = new Set<string>();
        const localOut: string[] = [];
        const nodes = Array.from(document.querySelectorAll("a, td, [role='gridcell'], [role='cell'], span"));
        for (const el of nodes) {
          const t = (el.textContent || "").replace(/\s+/g, " ").trim();
          if (!roomRe.test(t) || !/\d/.test(t) || t.length > 6) continue;
          if (localSeen.has(t)) continue;
          localSeen.add(t);
          localOut.push(t);
        }
        return localOut;
      })
      .catch(() => [] as string[]);
    for (const room of rooms) {
      if (seen.has(room)) continue;
      seen.add(room);
      out.push(room);
    }
  }
  return out;
}

type DashboardDrillStatus = {
  label: RegExp;
  housekeeping: string;
  occupancy: string;
  guestStatus?: string;
};

const DASHBOARD_DRILL_STATUSES: DashboardDrillStatus[] = [
  { label: /Vacant\s*\/?\s*Clean/i, housekeeping: "Clean", occupancy: "Vacant" },
  { label: /Vacant\s*\/?\s*Dirty/i, housekeeping: "Dirty", occupancy: "Vacant" },
  { label: /Occupied\s*\/?\s*Clean/i, housekeeping: "Clean", occupancy: "Occupied" },
  { label: /Occupied\s*\/?\s*Dirty/i, housekeeping: "Dirty", occupancy: "Occupied" },
  {
    label: /Out\s*of\s*Order/i,
    housekeeping: "Dirty",
    occupancy: "Vacant",
    guestStatus: "Out of Order",
  },
  {
    label: /Out\s*[Oo]f\s*Inventory/i,
    housekeeping: "Dirty",
    occupancy: "Vacant",
    guestStatus: "Out of Inventory",
  },
];

const CLICK_DASHBOARD_STATUS_FN = (source: string) => {
  const re = new RegExp(source, "i");
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const candidates = Array.from(
    document.querySelectorAll("a, button, span, div, td, li, label, p, strong")
  ) as HTMLElement[];

  for (const node of candidates) {
    const text = normalize(node.textContent || "");
    if (!text || text.length > 80) continue;
    if (!re.test(text)) continue;

    // Same node: "Vacant/Clean 12" with a nested link
    const nested = node.querySelector("a, button, [role='link']") as HTMLElement | null;
    if (nested) {
      nested.click();
      return true;
    }

    // Sibling / parent row count link
    const row = node.closest("a, li, tr, div, section, article") || node.parentElement;
    if (row) {
      const links = Array.from(row.querySelectorAll("a, button, [role='link']")) as HTMLElement[];
      for (const link of links) {
        const lt = normalize(link.textContent || "");
        if (/^\d+$/.test(lt) || re.test(lt)) {
          link.click();
          return true;
        }
      }
      // Clickable number sibling
      for (const child of Array.from(row.querySelectorAll("*")) as HTMLElement[]) {
        const ct = normalize(child.textContent || "");
        if (/^\d{1,4}$/.test(ct) && child !== node && !re.test(ct)) {
          child.click();
          return true;
        }
      }
    }

    // Label itself may be the link wrapping the count
    if (node.tagName === "A" || node.getAttribute("role") === "link" || node.onclick) {
      node.click();
      return true;
    }
  }
  return false;
};

/** Click the numeric count beside a dashboard Room Status label (counts are hyperlinks). */
async function clickDashboardStatusCount(
  page: import("playwright").Page,
  labelRe: RegExp
): Promise<boolean> {
  for (const root of synxisDomRoots(page)) {
    const clicked = await root.evaluate(CLICK_DASHBOARD_STATUS_FN, labelRe.source).catch(() => false);
    if (clicked) return true;
  }

  // Locator fallback (works across open shadow / odd markup Playwright can see)
  for (const root of synxisDomRoots(page)) {
    const label = root.getByText(labelRe).first();
    if ((await label.count()) === 0 || !(await label.isVisible().catch(() => false))) continue;

    const nearbyLink = label
      .locator(
        "xpath=ancestor::*[self::a or self::li or self::tr or self::div or self::section][1]//a[normalize-space(text())!='']"
      )
      .filter({ hasText: /^\d{1,4}$/ })
      .first();
    if ((await nearbyLink.count()) > 0 && (await nearbyLink.isVisible().catch(() => false))) {
      await nearbyLink.click({ timeout: 5_000 }).catch(() => undefined);
      return true;
    }

    await label.click({ timeout: 5_000 }).catch(() => undefined);
    return true;
  }

  return false;
}

/** True when SPH metric tiles are showing and the Room Status grid is not. */
async function onSphDashboardHome(page: import("playwright").Page) {
  if (!(await looksLikeSphDashboard(page))) return false;
  // Room Status grid still open → not back on the dashboard home tiles
  for (const root of synxisDomRoots(page)) {
    const hit = await root
      .getByText(/Housekeeping Status/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (hit) return false;
  }
  return true;
}

async function returnToSphDashboard(page: import("playwright").Page) {
  if (await onSphDashboardHome(page)) return;

  // Close drill-down modal / panel if present
  for (const root of synxisDomRoots(page)) {
    const close = root
      .locator(
        'button:has-text("Close"), button:has-text("Cancel"), [aria-label*="close" i], .modal button.close, button.k-window-action'
      )
      .first();
    if ((await close.count()) > 0 && (await close.isVisible().catch(() => false))) {
      await close.click({ timeout: 3_000 }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  await clickExactMenuLabel(page, /^\s*Home\s*$/i);
  await new Promise((r) => setTimeout(r, 1000));
  if (!(await onSphDashboardHome(page))) {
    await clickExactMenuLabel(page, /^\s*SPH Dashboard\s*$/i);
    await new Promise((r) => setTimeout(r, 1200));
  }

  const deadline = Date.now() + 14_000;
  while (Date.now() < deadline) {
    if (await onSphDashboardHome(page)) return;
    await clickExactMenuLabel(page, /^\s*Home\s*$/i);
    await new Promise((r) => setTimeout(r, 600));
    await clickExactMenuLabel(page, /^\s*SPH Dashboard\s*$/i);
    await new Promise((r) => setTimeout(r, 800));
  }
  synxisLog("returnToSphDashboard:still-not-home", await pageSnapshot(page));
}

/**
 * Primary room collect when FO→Housekeeping is unreliable:
 * On SPH Dashboard, each Room Status count (Vacant/Clean, …) is clickable —
 * open it, scrape rooms, return Home, repeat.
 *
 * When the Room Status grid is scraped, keep the grid's own HK/occupancy —
 * never re-label the same open grid as OOO/OOI (that caused false Out of Inventory).
 */
async function collectRoomsFromDashboardDrilldowns(
  page: import("playwright").Page
): Promise<BoardRow[]> {
  const merged = new Map<string, BoardRow>();
  let lastFingerprint = "";
  synxisLog("dashboard-drilldown:start", await pageSnapshot(page));

  for (const status of DASHBOARD_DRILL_STATUSES) {
    const label = status.label.source;
    synxisLog("dashboard-drilldown:status", { label, before: await pageSnapshot(page) });
    await returnToSphDashboard(page);
    if (!(await onSphDashboardHome(page))) {
      synxisLog("dashboard-drilldown:skip-not-on-dashboard", { label });
      continue;
    }
    await new Promise((r) => setTimeout(r, 800));

    const ok = await clickDashboardStatusCount(page, status.label);
    synxisLog("dashboard-drilldown:click", { label, ok, afterClick: await pageSnapshot(page) });
    if (!ok) {
      synxisLog("dashboard-drilldown:skip-no-click", { label });
      continue;
    }

    await new Promise((r) => setTimeout(r, 2000));

    if (await looksLikeRoomStatusPage(page)) {
      const scraped = await scrapeAllRoomStatusPages(page);
      const fingerprint = scraped.rows
        .map((r) => r.roomNumber)
        .sort()
        .join(",");
      synxisLog("dashboard-drilldown:scraped-room-status", {
        label,
        rooms: scraped.rows.length,
        sameAsPrevious: fingerprint === lastFingerprint && fingerprint.length > 0,
      });
      // Same room list as the previous drill → click did not change the filter; skip.
      if (fingerprint && fingerprint === lastFingerprint) {
        synxisLog("dashboard-drilldown:skip-stale-grid", { label });
        continue;
      }
      lastFingerprint = fingerprint;

      for (const row of scraped.rows) {
        const hasGridStatus = Boolean(row.housekeeping || row.occupancy || row.guestStatus);
        // Prefer real grid columns; only fall back to the clicked metric for bare room lists.
        merged.set(row.roomNumber, {
          roomNumber: row.roomNumber,
          roomType: row.roomType || merged.get(row.roomNumber)?.roomType || "",
          housekeeping: hasGridStatus
            ? row.housekeeping || status.housekeeping
            : status.housekeeping,
          occupancy: hasGridStatus ? row.occupancy || status.occupancy : status.occupancy,
          guestStatus: hasGridStatus
            ? row.guestStatus || ""
            : status.guestStatus || row.guestStatus || "",
        });
      }
    } else {
      const rooms = await scrapeRoomNumbersFromCurrentView(page);
      const fingerprint = [...rooms].sort().join(",");
      synxisLog("dashboard-drilldown:scraped-list", {
        label,
        rooms: rooms.length,
        sample: rooms.slice(0, 8),
        sameAsPrevious: fingerprint === lastFingerprint && fingerprint.length > 0,
        ...(await pageSnapshot(page)),
      });
      if (!rooms.length) continue;
      if (fingerprint === lastFingerprint) {
        synxisLog("dashboard-drilldown:skip-stale-list", { label });
        continue;
      }
      lastFingerprint = fingerprint;
      for (const roomNumber of rooms) {
        merged.set(roomNumber, {
          roomNumber,
          roomType: merged.get(roomNumber)?.roomType || "",
          housekeeping: status.housekeeping,
          occupancy: status.occupancy,
          guestStatus: status.guestStatus || "",
        });
      }
    }
  }

  await returnToSphDashboard(page);
  synxisLog("dashboard-drilldown:done", { totalRooms: merged.size });
  return [...merged.values()].sort((a, b) =>
    a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
  );
}

export type SynxisBoardSummary = {
  roomTotal: number;
  dirtyTotal: number;
  vacantClean: number;
  vacantDirty: number;
  occupiedClean: number;
  occupiedDirty: number;
  ooo: number;
  outOfInventory: number;
  pageDirtyBanner: number | null;
  pageRoomTotal: number | null;
};

export type SynxisCollectResult = {
  buffer: Buffer | null;
  filename: string | null;
  mime: string | null;
  flash: PmsFlashStats | null;
  boardError?: string;
  /** Soft mismatches between SPH dashboard counts and housekeeping board aggregates. */
  compareWarnings?: string[];
  boardSummary?: SynxisBoardSummary | null;
  /** Persist this encrypted on PmsConnection for Remember-me reuse. */
  storageStateJson?: string | null;
  /** New portal password if SynXis forced a ~45-day change and we rotated it. */
  rotatedPassword?: string | null;
};

/**
 * Login → Front Office → Housekeeping → Room Status.
 * Scrapes Clean/Dirty + Occupancy (Vacant/Occupied) + Guest Status (Stayover/Departing/Checked-out).
 * Does NOT read SPH Dashboard flash (occupancy %, pre-arrival, arrivals, ADR, …).
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

    const loginUrl = normalizeLoginUrl(input.loginUrl);
    synxisLog("collect:start", { loginUrl, timeout, mode: "fo-housekeeping-room-status" });
    const session = await ensureSynxisSession(context, page, {
      loginUrl,
      username: input.username,
      password: input.password,
      selectors,
      timeout,
      auth: input.auth,
      // Don't open board in ensure — we always navigate FO→HK below (avoids false "already on board").
      openBoardAfterAuth: false,
      trySavedSession: useSession,
    });
    storageStateJson = session.storageStateJson;
    rotatedPassword = session.rotatedPassword || null;
    synxisLog("collect:after-session", await pageSnapshot(page));

    if (isLoginUrl(page.url()) || (await pageNeedsLogin(page, selectors))) {
      synxisLog("collect:STUCK-ON-LOGIN", await pageSnapshot(page));
      throw new Error(
        `SynXis session is on the login page (${page.url()}). Re-save portal password / IMAP OTP and Collect again.`
      );
    }

    let buffer: Buffer | null = null;
    let filename: string | null = null;
    let mime: string | null = null;
    let boardError: string | undefined;
    let boardRows: BoardRow[] = [];
    let pageMeta: RoomStatusPageMeta | null = null;

    try {
      synxisLog("collect:fo-housekeeping-start");
      // Always navigate Front Office → Housekeeping (dashboard "Room Status" is not the grid).
      let boardPage = await openFrontOfficeHousekeeping(page, loginUrl, selectors, timeout);
      boardPage = await activeSynxisBoardPage(context, boardPage);
      synxisLog("collect:fo-housekeeping-page", await pageSnapshot(boardPage));

      if (!(await looksLikeRoomStatusPage(boardPage))) {
        const goTo =
          (await clickExactMenuLabel(boardPage, /^\s*GO TO ROOM STATUS\s*$/i)) ||
          (await clickFirstVisible(
            boardPage,
            'a:has-text("GO TO ROOM STATUS"), a:has-text("Go to Room Status"), button:has-text("Go to Room Status")',
            8_000
          ));
        synxisLog("collect:go-to-room-status-fallback", { goTo });
        if (goTo) {
          await new Promise((r) => setTimeout(r, 2500));
          await waitForRoomStatusGrid(boardPage, 30_000);
        }
        boardPage = await activeSynxisBoardPage(context, boardPage);
      }

      if (!(await looksLikeRoomStatusPage(boardPage))) {
        boardError = `Could not open Front Office → Housekeeping → Room Status (at ${boardPage.url()}).`;
        synxisLog("collect:STUCK-NOT-ROOM-STATUS", await pageSnapshot(boardPage));
        await dumpSphShellDebug(boardPage, "not-room-status");
      } else {
        await waitForRoomStatusGrid(boardPage, 15_000);
        let scraped = await scrapeAllRoomStatusPages(boardPage);
        synxisLog("collect:fo-scrape", {
          rooms: scraped.rows.length,
          meta: scraped.meta,
          sample: scraped.rows.slice(0, 5).map((r) => ({
            room: r.roomNumber,
            hk: r.housekeeping,
            occ: r.occupancy,
            guest: r.guestStatus,
          })),
        });

        if (
          scraped.meta?.totalRooms != null &&
          scraped.rows.length > 0 &&
          scraped.rows.length < scraped.meta.totalRooms * 0.9
        ) {
          synxisLog("collect:PARTIAL-BOARD-retry", {
            scraped: scraped.rows.length,
            total: scraped.meta.totalRooms,
          });
          await clearRoomStatusFilters(boardPage);
          await maximizeRoomStatusPageSize(boardPage);
          await new Promise((r) => setTimeout(r, 1500));
          const again = await scrapeAllRoomStatusPages(boardPage);
          if (again.rows.length > scraped.rows.length) {
            scraped = again;
            synxisLog("collect:fo-scrape-retry", { rooms: scraped.rows.length, meta: scraped.meta });
          }
        }

        boardRows = scraped.rows;
        pageMeta = scraped.meta;
        // Reject tiny scrapes — almost always means we scraped the wrong screen
        if (boardRows.length > 0 && boardRows.length < 5 && (pageMeta?.totalRooms == null || pageMeta.totalRooms > 10)) {
          boardError = `Room Status scrape returned only ${boardRows.length} room(s) — expected the full board.`;
          synxisLog("collect:TOO-FEW-ROOMS", { rooms: boardRows.length, meta: pageMeta });
          boardRows = [];
        }
        if (boardRows.length >= 1) {
          const csv = boardRowsToSynxisCsv(boardRows);
          buffer = Buffer.from(csv, "utf8");
          filename = `synxis-room-status-${Date.now()}.csv`;
          mime = "text/csv";
          boardError = undefined;
        } else if (!boardError) {
          boardError = `Room Status opened but no rooms were scraped (at ${boardPage.url()}).`;
        }
        if (
          pageMeta?.totalRooms != null &&
          boardRows.length > 0 &&
          boardRows.length < pageMeta.totalRooms * 0.9
        ) {
          boardError = `Room Status shows ${pageMeta.totalRooms} rooms but only scraped ${boardRows.length}.`;
          synxisLog("collect:PARTIAL-BOARD", { scraped: boardRows.length, total: pageMeta.totalRooms });
        }
      }
    } catch (err) {
      boardError = err instanceof Error ? err.message : "Front Office → Housekeeping scrape failed";
      synxisLog("collect:fo-housekeeping-error", boardError);
    }

    if (!buffer && boardRows.length < 1) {
      boardError =
        boardError ||
        `Could not collect rooms from Front Office → Housekeeping → Room Status (at ${page.url()}).`;
      synxisLog("collect:FAILED-NO-ROOMS", { boardError, ...(await pageSnapshot(page)) });
    } else {
      const dirty = countDirtyRooms(boardRows);
      const clean = boardRows.filter((r) => /\bclean\b|\binspected\b/i.test(r.housekeeping || "")).length;
      synxisLog("collect:success", {
        rooms: boardRows.length,
        dirty,
        clean,
        filename,
        pageTotal: pageMeta?.totalRooms ?? null,
      });
    }

    const counts = aggregateBoardStatusCounts(boardRows);
    const boardSummary: SynxisBoardSummary | null = boardRows.length
      ? {
          roomTotal: boardRows.length,
          dirtyTotal: countDirtyRooms(boardRows),
          vacantClean: counts.vacantClean,
          vacantDirty: counts.vacantDirty,
          occupiedClean: counts.occupiedClean,
          occupiedDirty: counts.occupiedDirty,
          ooo: counts.ooo,
          outOfInventory: counts.outOfInventory,
          pageDirtyBanner: pageMeta?.totalDirtyRooms ?? null,
          pageRoomTotal: pageMeta?.totalRooms ?? null,
        }
      : null;

    // Dashboard tiles: derive Clean/Dirty/Vacant/Occupied from the board (not SPH Home).
    const flash = boardRows.length >= 5 ? flashFromBoardRows(boardRows, page.url()) : null;

    storageStateJson = JSON.stringify(await context.storageState());
    await context.close();

    if (!buffer) {
      throw new Error(
        boardError || "Logged in to SynXis, but could not scrape Front Office → Housekeeping → Room Status."
      );
    }

    return {
      buffer,
      filename,
      mime,
      flash,
      boardError,
      compareWarnings: undefined,
      boardSummary,
      storageStateJson,
      rotatedPassword,
    };
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
      openBoardAfterAuth: false,
      trySavedSession: useSession,
    });
    storageStateJson = session.storageStateJson;
    rotatedPassword = session.rotatedPassword || null;

    let boardPage = await openHousekeepingBoard(
      page,
      normalizeLoginUrl(input.loginUrl),
      selectors,
      timeout
    );
    boardPage = await activeSynxisBoardPage(context, boardPage);

    for (const roomNumber of uniqueRooms) {
      try {
        const ok = await boardPage.evaluate(
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

    const save = boardPage.locator(selectors.saveButton).first();
    if ((await save.count()) > 0 && results.some((r) => r.ok)) {
      await save.click({ timeout: 8_000 }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 2000));
    }

    storageStateJson = JSON.stringify(await context.storageState());
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
