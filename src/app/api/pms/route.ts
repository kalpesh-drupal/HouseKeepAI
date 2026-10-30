import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PmsProvider } from "@prisma/client";
import { runPmsSync } from "@/lib/pms/sync";
import { encryptSecret } from "@/lib/crypto-secret";
import { runPortalCollect } from "@/lib/pms/portal-collect";
import { normalizeSkyTouchLoginUrl } from "@/lib/pms/skytouch-portal";

const VALID_PROVIDERS: PmsProvider[] = [
  "SKYTOUCH",
  "SYNXIS",
  "OPERA",
  "CLOUDBEDS",
  "MEWS",
  "STAYNTOUCH",
  "AUTOCLERK",
  "LITTLE_HOTELIER",
];

function publicConnection<
  T extends {
    portalPasswordEnc: string | null;
    portalSessionEnc?: string | null;
    portalImapPasswordEnc?: string | null;
    apiKey: string | null;
    apiSecret: string | null;
  },
>(connection: T) {
  const { portalPasswordEnc, portalSessionEnc, portalImapPasswordEnc, apiKey, apiSecret, ...rest } = connection;
  return {
    ...rest,
    hasPortalPassword: Boolean(portalPasswordEnc),
    hasPortalSession: Boolean(portalSessionEnc),
    hasImapPassword: Boolean(portalImapPasswordEnc),
    hasApiKey: Boolean(apiKey),
    hasApiSecret: Boolean(apiSecret),
    // Keep empty placeholders so existing forms still bind; never return secrets.
    apiKey: "",
    apiSecret: "",
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [connections, logs] = await Promise.all([
    prisma.pmsConnection.findMany({ where: { hotelId: session.user.hotelId } }),
    prisma.pmsSyncLog.findMany({
      where: { hotelId: session.user.hotelId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    connections: connections.map(publicConnection),
    logs,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["OWNER", "GENERAL_MANAGER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const provider = body.provider as PmsProvider;
  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  if (body.action === "save") {
    try {
      const existing = await prisma.pmsConnection.findUnique({
        where: { hotelId_provider: { hotelId: session.user.hotelId, provider } },
      });

      const portalPasswordRaw = typeof body.portalPassword === "string" ? body.portalPassword : "";
      let portalPasswordEnc = existing?.portalPasswordEnc ?? null;
      if (portalPasswordRaw.trim()) {
        portalPasswordEnc = encryptSecret(portalPasswordRaw);
      }
      if (body.clearPortalPassword) {
        portalPasswordEnc = null;
      }

      const imapPasswordRaw = typeof body.portalImapPassword === "string" ? body.portalImapPassword : "";
      let portalImapPasswordEnc = existing?.portalImapPasswordEnc ?? null;
      if (imapPasswordRaw.trim()) {
        portalImapPasswordEnc = encryptSecret(imapPasswordRaw);
      }
      if (body.clearImapPassword) {
        portalImapPasswordEnc = null;
      }

      let portalLoginUrl = typeof body.portalLoginUrl === "string" ? body.portalLoginUrl.trim() : "";
      if (provider === "SKYTOUCH" && portalLoginUrl) {
        try {
          portalLoginUrl = normalizeSkyTouchLoginUrl(portalLoginUrl);
        } catch (err) {
          return NextResponse.json(
            { error: err instanceof Error ? err.message : "Invalid SkyTouch login URL" },
            { status: 400 }
          );
        }
      }

      const portalImapHost =
        typeof body.portalImapHost === "string" ? body.portalImapHost.trim() || null : existing?.portalImapHost ?? null;
      const portalImapUser =
        typeof body.portalImapUser === "string" ? body.portalImapUser.trim() || null : existing?.portalImapUser ?? null;
      const portalImapMailbox =
        typeof body.portalImapMailbox === "string"
          ? body.portalImapMailbox.trim() || "INBOX"
          : existing?.portalImapMailbox ?? "INBOX";
      const portalImapPort = Number(body.portalImapPort) > 0 ? Number(body.portalImapPort) : existing?.portalImapPort ?? 993;

      const clearSession = Boolean(body.clearPortalSession);
      const sessionUpdate = clearSession
        ? { portalSessionEnc: null as string | null, portalSessionAt: null as Date | null }
        : {};

      const connection = await prisma.pmsConnection.upsert({
        where: { hotelId_provider: { hotelId: session.user.hotelId, provider } },
        create: {
          hotelId: session.user.hotelId,
          provider,
          propertyId: body.propertyId || null,
          apiKey: body.apiKey || null,
          apiSecret: body.apiSecret || null,
          baseUrl: body.baseUrl || null,
          enabled: Boolean(body.enabled),
          syncIntervalMinutes: Number(body.syncIntervalMinutes) || 10,
          conflictPolicy: body.conflictPolicy || "PMS_RESERVATIONS_ONLY",
          portalEnabled: Boolean(body.portalEnabled),
          portalLoginUrl: portalLoginUrl || null,
          portalUsername: body.portalUsername || null,
          portalPasswordEnc,
          portalSelectors: body.portalSelectors || null,
          portalImapHost,
          portalImapPort,
          portalImapUser,
          portalImapPasswordEnc,
          portalImapMailbox,
        },
        update: {
          propertyId: body.propertyId || null,
          ...(typeof body.apiKey === "string" && body.apiKey.trim() ? { apiKey: body.apiKey } : {}),
          ...(typeof body.apiSecret === "string" && body.apiSecret.trim() ? { apiSecret: body.apiSecret } : {}),
          baseUrl: body.baseUrl || null,
          enabled: Boolean(body.enabled),
          syncIntervalMinutes: Number(body.syncIntervalMinutes) || 10,
          conflictPolicy: body.conflictPolicy || "PMS_RESERVATIONS_ONLY",
          portalEnabled: Boolean(body.portalEnabled),
          portalLoginUrl: portalLoginUrl || null,
          portalUsername: body.portalUsername || null,
          portalPasswordEnc,
          portalSelectors: body.portalSelectors || null,
          portalImapHost,
          portalImapPort,
          portalImapUser,
          portalImapPasswordEnc,
          portalImapMailbox,
          ...sessionUpdate,
        },
      });
      return NextResponse.json({ success: true, connection: publicConnection(connection) });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not save PMS settings" },
        { status: 500 }
      );
    }
  }

  if (body.action === "portal_collect") {
    try {
      const { playwrightHostUnsupportedReason } = await import("@/lib/pms/playwright-host");
      const deferred = playwrightHostUnsupportedReason();
      if (deferred) {
        // Keep portal on so the Railway agent picks this hotel up on its next tick.
        await prisma.pmsConnection.updateMany({
          where: { hotelId: session.user.hotelId, provider },
          data: { portalEnabled: true },
        });
        return NextResponse.json({
          success: true,
          deferred: true,
          message: deferred,
          updated: 0,
          created: 0,
          skipped: 0,
          warnings: [],
        });
      }

      const result = await runPortalCollect(session.user.hotelId, provider);
      return NextResponse.json({
        success: true,
        filename: result.filename,
        updated: result.imported.updated,
        created: result.imported.created,
        skipped: result.imported.skipped,
        mode: result.imported.mode,
        preview: result.imported.preview,
        warnings: result.imported.warnings || [],
        statusMissing: result.imported.statusMissing,
        flash: result.flash,
        boardError: result.boardError || null,
        compareWarnings: result.compareWarnings || [],
        boardSummary: result.boardSummary || null,
      });
    } catch (err) {
      console.error("[api/pms] portal_collect failed:", err instanceof Error ? err.message : err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Portal collect failed" },
        { status: 500 }
      );
    }
  }

  if (body.action === "sync") {
    const connection = await prisma.pmsConnection.findUnique({
      where: { hotelId_provider: { hotelId: session.user.hotelId, provider } },
    });
    if (!connection) {
      await prisma.pmsConnection.create({
        data: {
          hotelId: session.user.hotelId,
          provider,
          enabled: true,
          propertyId: "DEMO-PROPERTY",
        },
      });
    } else if (!connection.enabled) {
      await prisma.pmsConnection.update({
        where: { id: connection.id },
        data: { enabled: true },
      });
    }

    try {
      const result = await runPmsSync(session.user.hotelId, provider);
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      await prisma.pmsSyncLog.create({
        data: {
          hotelId: session.user.hotelId,
          provider,
          action: "FULL_SYNC",
          status: "FAILED",
          message: err instanceof Error ? err.message : "Sync failed",
        },
      });
      return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
