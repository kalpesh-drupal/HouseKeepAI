/**
 * SkyTouch portal automation needs a real Chromium binary.
 * Vercel / most serverless hosts cannot run Playwright browsers.
 */
export function playwrightHostUnsupportedReason(): string | null {
  if (process.env.PLAYWRIGHT_ALLOW_SERVERLESS === "1") return null;

  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
    return (
      "SkyTouch Collect / Mark Clean write-back cannot run on Vercel (no Playwright browser). " +
      "Run them on your Mac or a VPS with: npm run pms:agent:loop " +
      "(uses the production database and Chromium locally)."
    );
  }

  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.FUNCTION_NAME) {
    return (
      "SkyTouch portal automation cannot run in this serverless environment. " +
      "Use npm run pms:agent:loop on a host with Chromium installed."
    );
  }

  return null;
}

export function assertPlaywrightHost() {
  const reason = playwrightHostUnsupportedReason();
  if (reason) throw new Error(reason);
}
