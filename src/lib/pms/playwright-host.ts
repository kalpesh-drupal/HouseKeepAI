/**
 * SkyTouch portal automation needs a real Chromium binary.
 * Vercel / most serverless hosts cannot run Playwright browsers.
 */
export function playwrightHostUnsupportedReason(): string | null {
  if (process.env.PLAYWRIGHT_ALLOW_SERVERLESS === "1") return null;

  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
    return (
      "SkyTouch Collect does not run inside Vercel. " +
      "Your Railway PMS agent collects automatically when portal sync is enabled — " +
      "check agent logs for collect hotel=… (usually within ~10 minutes). " +
      "Mark Clean still works here; write-back is processed by the same agent."
    );
  }

  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.FUNCTION_NAME) {
    return (
      "SkyTouch portal automation cannot run in this serverless environment. " +
      "Use the hosted Railway PMS agent (see docs/PMS-AGENT.md)."
    );
  }

  return null;
}

export function assertPlaywrightHost() {
  const reason = playwrightHostUnsupportedReason();
  if (reason) throw new Error(reason);
}

/** Local debug: set PLAYWRIGHT_HEADED=1 to watch Chromium during Collect. */
export function playwrightHeadless(): boolean {
  return process.env.PLAYWRIGHT_HEADED !== "1";
}

/**
 * Residential proxy for SkyTouch. Railway's own address never receives Login.do.
 * PLAYWRIGHT_PROXY_SERVER=http://host:port
 * or http://user:pass@host:port
 * Username and password can also be PLAYWRIGHT_PROXY_USERNAME / PLAYWRIGHT_PROXY_PASSWORD.
 */
export function playwrightProxy():
  | { server: string; username?: string; password?: string }
  | undefined {
  const raw = process.env.PLAYWRIGHT_PROXY_SERVER?.trim();
  if (!raw) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const url = new URL(withScheme);
    const username = process.env.PLAYWRIGHT_PROXY_USERNAME?.trim() || decodeURIComponent(url.username || "");
    const password = process.env.PLAYWRIGHT_PROXY_PASSWORD?.trim() || decodeURIComponent(url.password || "");
    return {
      server: `${url.protocol}//${url.host}`,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
    };
  } catch {
    return { server: raw };
  }
}

export function playwrightProxyLabel(): string {
  const proxy = playwrightProxy();
  return proxy ? proxy.server : "off";
}

export function playwrightLaunchExtras(): { headless: boolean; slowMo?: number } {
  const headless = playwrightHeadless();
  if (headless) return { headless: true };
  const slowMoRaw = process.env.PLAYWRIGHT_SLOW_MO;
  const slowMo = slowMoRaw ? Number(slowMoRaw) : 150;
  return {
    headless: false,
    ...(Number.isFinite(slowMo) && slowMo > 0 ? { slowMo } : {}),
  };
}
