/**
 * One-off diagnostic: login to SkyTouch, open HK Center, dump frame URLs + sample HTML.
 * Usage: npx tsx scripts/dump-skytouch-board.ts
 */
import { PrismaClient } from "@prisma/client";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { decryptSecret } from "@/lib/crypto-secret";
import { normalizeSkyTouchLoginUrl } from "@/lib/pms/skytouch-portal";

async function main() {
  const prisma = new PrismaClient();
  const conn = await prisma.pmsConnection.findFirst({
    where: { portalEnabled: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!conn?.portalLoginUrl || !conn.portalUsername || !conn.portalPasswordEnc) {
    throw new Error("No portal-enabled PMS connection with credentials found");
  }
  const password = decryptSecret(conn.portalPasswordEnc);
  const loginUrl = normalizeSkyTouchLoginUrl(conn.portalLoginUrl);

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--disable-dev-shm-usage", "--disable-http2"],
  }).catch(() =>
    chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--disable-http2"] })
  );

  const outDir = path.join(process.cwd(), ".tmp-skytouch-dump");
  await mkdir(outDir, { recursive: true });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);

  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="password"]').first().waitFor({ state: "visible", timeout: 25_000 });
  await page.locator('input[name="username"], input[name="userName"], input[name="j_username"], input[type="email"], input[id*="user" i]').first().fill(conn.portalUsername);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /^\s*log\s*in\s*$/i }).click().catch(async () => {
    await page.getByText(/^\s*login\s*$/i).click();
  });
  await page.waitForLoadState("domcontentloaded");
  await new Promise((r) => setTimeout(r, 4000));

  // Click HK Center if present
  await page.getByRole("link", { name: /housekeeping center/i }).first().click({ timeout: 5_000 }).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 5000));
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);

  const summary: Array<Record<string, unknown>> = [];
  const pages = context.pages();
  for (const [pi, p] of pages.entries()) {
    await p.screenshot({ path: path.join(outDir, `page-${pi}.png`), fullPage: true }).catch(() => undefined);
    const frames = p.frames();
    for (const [fi, frame] of frames.entries()) {
      const url = frame.url();
      const name = frame.name();
      const text = await frame.locator("body").innerText().catch(() => "");
      const html = await frame.content().catch(() => "");
      const roomHits = [...new Set((text.match(/\b\d{3,4}\b/g) || []))];
      const statusHits = (text.match(/\b(dirty|clean|ready|vacant|occupied|stayover|inspected)\b/gi) || []).slice(0, 20);
      summary.push({
        page: pi,
        frame: fi,
        name,
        url,
        textLen: text.length,
        htmlLen: html.length,
        roomCount: roomHits.length,
        sampleRooms: roomHits.slice(0, 15),
        statusHits,
        textSample: text.replace(/\s+/g, " ").trim().slice(0, 500),
      });
      await writeFile(path.join(outDir, `frame-${pi}-${fi}.html`), html.slice(0, 500_000));
      await writeFile(path.join(outDir, `frame-${pi}-${fi}.txt`), text.slice(0, 100_000));
    }
  }

  await writeFile(path.join(outDir, "summary.json"), JSON.stringify({ finalUrl: page.url(), summary }, null, 2));
  console.log(JSON.stringify({ finalUrl: page.url(), outDir, frames: summary.length, summary }, null, 2));

  await browser.close();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
