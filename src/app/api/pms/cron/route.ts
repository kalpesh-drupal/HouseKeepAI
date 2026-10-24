import { NextRequest, NextResponse } from "next/server";
import { runDuePmsSyncs } from "@/lib/pms/sync";
import { rollAllHotels } from "@/lib/day-roll";

/**
 * Scheduled PMS sync / SkyTouch portal collect endpoint.
 * Intended every 10 minutes (see vercel.json + `npm run pms:cron:loop`):
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3006/api/pms/cron
 *
 * Note: SkyTouch portal collect uses Playwright. Prefer a long-running host
 * (`npm run pms:cron:loop` next to `npm run dev`) — Vercel serverless may time out.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.nextUrl.searchParams.get("secret");

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runDuePmsSyncs();
  let dayRoll: unknown = null;
  let dayRollError: string | null = null;
  try {
    dayRoll = await rollAllHotels();
  } catch (error) {
    dayRollError = error instanceof Error ? error.message : "Day roll failed";
  }
  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    results,
    dayRoll,
    dayRollError,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
