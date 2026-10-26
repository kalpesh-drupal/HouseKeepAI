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
