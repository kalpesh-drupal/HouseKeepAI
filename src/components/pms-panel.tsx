"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";

const PROVIDERS = [
  "SKYTOUCH",
  "SYNXIS",
  "OPERA",
  "CLOUDBEDS",
  "MEWS",
  "STAYNTOUCH",
  "AUTOCLERK",
  "LITTLE_HOTELIER",
] as const;

type Provider = (typeof PROVIDERS)[number];

const PROVIDER_LABELS: Record<Provider, string> = {
  SKYTOUCH: "SkyTouch",
  SYNXIS: "SynXis",
  OPERA: "Oracle Opera",
  CLOUDBEDS: "Cloudbeds",
  MEWS: "Mews",
  STAYNTOUCH: "StayNTouch",
  AUTOCLERK: "AutoClerk",
  LITTLE_HOTELIER: "Little Hotelier",
};

type Connection = {
  id: string;
  provider: Provider;
  propertyId: string | null;
  apiKey: string | null;
  apiSecret: string | null;
  baseUrl: string | null;
  enabled: boolean;
  lastSyncAt: string | null;
  syncIntervalMinutes?: number;
  conflictPolicy?: string;
  portalEnabled?: boolean;
  portalLoginUrl?: string | null;
  portalUsername?: string | null;
  portalSelectors?: string | null;
  portalImapHost?: string | null;
  portalImapPort?: number | null;
  portalImapUser?: string | null;
  portalImapMailbox?: string | null;
  portalSessionAt?: string | null;
  hasPortalPassword?: boolean;
  hasPortalSession?: boolean;
  hasImapPassword?: boolean;
  hasApiKey?: boolean;
  hasApiSecret?: boolean;
};

type Log = {
  id: string;
  provider: string;
  action: string;
  records: number;
  status: string;
  message: string | null;
  createdAt: string;
};

type FormState = {
  propertyId: string;
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  enabled: boolean;
  syncIntervalMinutes: number;
  conflictPolicy: string;
  portalEnabled: boolean;
  portalLoginUrl: string;
  portalUsername: string;
  portalPassword: string;
  portalSelectors: string;
  portalImapHost: string;
  portalImapPort: number;
  portalImapUser: string;
  portalImapPassword: string;
  portalImapMailbox: string;
};

function emptyForm(): FormState {
  return {
    propertyId: "",
    apiKey: "",
    apiSecret: "",
    baseUrl: "",
    enabled: false,
    syncIntervalMinutes: 10,
    conflictPolicy: "PMS_RESERVATIONS_ONLY",
    portalEnabled: false,
    portalLoginUrl: "",
    portalUsername: "",
    portalPassword: "",
    portalSelectors: "",
    portalImapHost: "",
    portalImapPort: 993,
    portalImapUser: "",
    portalImapPassword: "",
    portalImapMailbox: "INBOX",
  };
}

function formFromConnection(c?: Connection): FormState {
  if (!c) return emptyForm();
  return {
    propertyId: c.propertyId || "",
    apiKey: "",
    apiSecret: "",
    baseUrl: c.baseUrl || "",
    enabled: c.enabled,
    syncIntervalMinutes: c.syncIntervalMinutes || 10,
    conflictPolicy: c.conflictPolicy || "PMS_RESERVATIONS_ONLY",
    portalEnabled: Boolean(c.portalEnabled),
    portalLoginUrl: c.portalLoginUrl || "",
    portalUsername: c.portalUsername || "",
    portalPassword: "",
    portalSelectors: c.portalSelectors || "",
    portalImapHost: c.portalImapHost || "",
    portalImapPort: c.portalImapPort || 993,
    portalImapUser: c.portalImapUser || "",
    portalImapPassword: "",
    portalImapMailbox: c.portalImapMailbox || "INBOX",
  };
}

export function PmsPanel({ connections, logs }: { connections: Connection[]; logs: Log[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [forms, setForms] = useState<Record<string, FormState>>(
    Object.fromEntries(PROVIDERS.map((provider) => [provider, formFromConnection(connections.find((x) => x.provider === provider))]))
  );
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [portalStatus, setPortalStatus] = useState<string | null>(null);

  async function readJson(res: Response) {
    const text = await res.text();
    if (!text) return { error: res.ok ? "Empty response" : `Request failed (${res.status})` };
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { error: `Server returned a non-JSON response (${res.status}). Restart the local app and try again.` };
    }
  }

  async function saveProvider(provider: Provider, overrides: Partial<FormState> = {}) {
    const f = { ...forms[provider], ...overrides };
    const res = await fetch("/api/pms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", provider, ...f }),
    });
    return readJson(res);
  }

  async function save(provider: Provider) {
    setLoading(`save-${provider}`);
    setMessage(null);
    setPortalStatus(null);
    try {
      const shouldEnablePortal =
        provider === "SKYTOUCH" &&
        Boolean(forms[provider].portalLoginUrl.trim() && forms[provider].portalUsername.trim());
      const data = await saveProvider(provider, shouldEnablePortal ? { portalEnabled: true } : {});
      if (data.success) {
        setForms((prev) => ({
          ...prev,
          [provider]: {
            ...prev[provider],
            portalPassword: "",
            portalImapPassword: "",
            apiKey: "",
            apiSecret: "",
            ...(shouldEnablePortal ? { portalEnabled: true } : {}),
          },
        }));
        const text = `${PROVIDER_LABELS[provider]} settings saved`;
        setMessage(text);
        if (provider === "SKYTOUCH" || provider === "SYNXIS") setPortalStatus(text);
      } else {
        const text = String(data.error || "Save failed");
        setMessage(text);
        if (provider === "SKYTOUCH" || provider === "SYNXIS") setPortalStatus(text);
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : "Save failed";
      setMessage(text);
      if (provider === "SKYTOUCH" || provider === "SYNXIS") setPortalStatus(text);
    } finally {
      setLoading(null);
      router.refresh();
    }
  }

  async function sync(provider: Provider) {
    setLoading(`sync-${provider}`);
    setMessage(null);
    try {
      const res = await fetch("/api/pms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", provider }),
      });
      const data = await readJson(res);
      setMessage(
        data.success
          ? `${PROVIDER_LABELS[provider]} synced — ${data.updated} updated, ${data.skipped ?? 0} skipped (${data.policy || "policy"})`
          : String(data.error || "Sync failed")
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(null);
      router.refresh();
    }
  }

  async function portalCollect(provider: Provider) {
    setLoading(`portal-${provider}`);
    setMessage(null);
    setPortalStatus(
      "Saving login, then reading Housekeeping Center and verifying with Check-Off List… this can take up to 2 minutes."
    );
    try {
      const saveData = await saveProvider(provider, { portalEnabled: true });
      if (!saveData.success) {
        const text = String(saveData.error || "Could not save portal login before collect");
        setMessage(text);
        setPortalStatus(text);
        return;
      }
      setForms((prev) => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          portalEnabled: true,
          portalPassword: "",
          apiKey: "",
          apiSecret: "",
        },
      }));

      const res = await fetch("/api/pms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "portal_collect", provider }),
      });
      const data = await readJson(res);
      const warnings = Array.isArray(data.warnings) ? data.warnings.map(String) : [];
      const preview = Array.isArray(data.preview)
        ? data.preview
            .slice(0, 5)
            .map((row) => {
              const item = row as { room?: string; housekeeping?: string; guestStay?: string };
              return `${item.room || "?"}${item.housekeeping ? ` ${item.housekeeping}` : ""}`;
            })
            .join(", ")
        : "";
      const flash = data.flash as
        | {
            occupancyPercent?: number | null;
            expectedAdr?: number | null;
            totalArrivals?: number | null;
            totalDepartures?: number | null;
            stayovers?: number | null;
            vacantClean?: number | null;
            vacantDirty?: number | null;
            occupiedClean?: number | null;
            occupiedDirty?: number | null;
          }
        | null
        | undefined;
      const compareWarnings = Array.isArray(data.compareWarnings)
        ? data.compareWarnings.map(String)
        : [];
      const flashPart = flash
        ? ` Dashboard: occupancy ${flash.occupancyPercent ?? "—"}%, ADR ${flash.expectedAdr ?? "—"}, arrivals ${flash.totalArrivals ?? "—"}, departures ${flash.totalDepartures ?? "—"}, stayovers ${flash.stayovers ?? "—"}${
            flash.vacantDirty != null || flash.vacantClean != null
              ? `, V/C ${flash.vacantClean ?? "—"} V/D ${flash.vacantDirty ?? "—"} O/C ${flash.occupiedClean ?? "—"} O/D ${flash.occupiedDirty ?? "—"}`
              : ""
          }.`
        : "";
      const boardSummary = data.boardSummary as
        | {
            roomTotal?: number;
            dirtyTotal?: number;
            vacantClean?: number;
            vacantDirty?: number;
            occupiedClean?: number;
            occupiedDirty?: number;
          }
        | null
        | undefined;
      const summaryPart = boardSummary
        ? ` Status mix: ${boardSummary.roomTotal ?? "—"} rooms, Dirty ${boardSummary.dirtyTotal ?? "—"} (V/C ${boardSummary.vacantClean ?? "—"} V/D ${boardSummary.vacantDirty ?? "—"} O/C ${boardSummary.occupiedClean ?? "—"} O/D ${boardSummary.occupiedDirty ?? "—"}).`
        : "";
      const comparePart = compareWarnings.length
        ? ` Discrepancy vs SPH Dashboard: ${compareWarnings.slice(0, 4).join("; ")}${
            compareWarnings.length > 4 ? "…" : ""
          }.`
        : data.filename
          ? " Matches SPH Dashboard / Total Dirty Rooms."
          : "";
      const boardPart = data.filename
        ? ` Room Status imported (${data.updated} updated, ${data.created} created, ${data.skipped} skipped)${
            warnings.length ? `. ${warnings[0]}` : ""
          }${preview ? ` · ${preview}` : ""}.`
        : data.boardError
          ? ` Room Status: ${String(data.boardError)}`
          : "";
      const text = data.success
        ? data.deferred
          ? String(
              data.message ||
                "Portal sync is enabled. The Railway PMS agent will collect from SkyTouch automatically (about every 10 minutes)."
            )
          : `${flashPart || "Collect finished."}${summaryPart}${boardPart}${comparePart}`.trim()
        : String(data.error || "Portal collect failed");
      setMessage(text);
      setPortalStatus(text);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Portal collect failed";
      setMessage(text);
      setPortalStatus(text);
    } finally {
      setLoading(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{message}</div>
      )}

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Portal automation (opt-in per PMS)</p>
        <p className="mt-1">
          <strong>SkyTouch:</strong> Collect + Mark Clean → Ready. <strong>SynXis:</strong> Collect room board + Mark
          Clean → Clean when portal is enabled (Playwright on Railway pms-agent; no API required). Turn portal off if
          the hotel does not want PMS automation. Passwords are encrypted; tune selector JSON (
          <code className="rounded bg-white px-1">boardUrl</code>,{" "}
          <code className="rounded bg-white px-1">downloadButton</code>) if the SynXis layout differs.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Scheduled sync</p>
        <p className="mt-1">
          Call <code className="rounded bg-white px-1">GET /api/pms/cron</code> with{" "}
          <code className="rounded bg-white px-1">Authorization: Bearer $CRON_SECRET</code> every 5–15 minutes. Only
          enabled connectors past their interval will run.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const conn = connections.find((c) => c.provider === provider);
          const f = forms[provider] || emptyForm();
          const isSkyTouch = provider === "SKYTOUCH";
          const isSynxis = provider === "SYNXIS";
          const showPortal = isSkyTouch || isSynxis;
          return (
            <div key={provider} className="space-y-4 rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{PROVIDER_LABELS[provider]}</h2>
                  <p className="text-xs text-muted-foreground">
                    {conn?.enabled || conn?.portalEnabled ? t("connected") : t("disconnected")}
                    {conn?.lastSyncAt ? ` · Last sync ${new Date(conn.lastSyncAt).toLocaleString()}` : ""}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    onChange={(e) =>
                      setForms((prev) => ({ ...prev, [provider]: { ...prev[provider], enabled: e.target.checked } }))
                    }
                  />
                  API enable
                </label>
              </div>

              {showPortal && (
                <div
                  className={`space-y-3 rounded-xl border p-4 ${
                    isSynxis
                      ? "border-indigo-200 bg-indigo-50/60"
                      : "border-emerald-200 bg-emerald-50/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p
                        className={`text-sm font-semibold ${isSynxis ? "text-indigo-950" : "text-emerald-950"}`}
                      >
                        {isSynxis ? "Portal collect + Mark Clean write-back" : "Portal login collect"}
                      </p>
                      <p className={`text-xs ${isSynxis ? "text-indigo-900" : "text-emerald-900"}`}>
                        {isSynxis
                          ? "Optional. Enable to collect SynXis room status into HouseKeepAI and to write Mark Clean back as Clean. Leave password blank when saving to keep the current one."
                          : "Use the hotel&apos;s SkyTouch web login. Leave password blank when saving to keep the current one."}
                      </p>
                    </div>
                    <label
                      className={`flex items-center gap-2 text-sm ${isSynxis ? "text-indigo-950" : "text-emerald-950"}`}
                    >
                      <input
                        type="checkbox"
                        checked={f.portalEnabled}
                        onChange={(e) =>
                          setForms((prev) => ({
                            ...prev,
                            [provider]: { ...prev[provider], portalEnabled: e.target.checked },
                          }))
                        }
                      />
                      Enable
                    </label>
                  </div>
                  <input
                    placeholder={
                      isSynxis
                        ? "https://… SynXis / Property Hub login URL"
                        : "https://www.skytouchhos.com/pms/Login.do?cleanSession=true"
                    }
                    value={f.portalLoginUrl}
                    onChange={(e) =>
                      setForms((p) => ({ ...p, [provider]: { ...p[provider], portalLoginUrl: e.target.value } }))
                    }
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                  />
                  {isSkyTouch && (
                    <p className="text-xs text-emerald-900">
                      Use the Login.do URL, not ContinueLogin.do (that page is a mid-login redirect and times out).
                    </p>
                  )}
                  {isSynxis && (
                    <p className="text-xs text-indigo-900">
                      SynXis email OTP + Remember me (~3 days), and automatic password rotation when SynXis forces a
                      ~45-day change (new password stored encrypted). Optional selectors:{" "}
                      <code className="rounded bg-white px-1">boardUrl</code>,{" "}
                      <code className="rounded bg-white px-1">downloadButton</code>,{" "}
                      <code className="rounded bg-white px-1">cleanControl</code>.
                    </p>
                  )}
                  <input
                    placeholder="Portal username"
                    value={f.portalUsername}
                    autoComplete="off"
                    onChange={(e) =>
                      setForms((p) => ({ ...p, [provider]: { ...p[provider], portalUsername: e.target.value } }))
                    }
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                  />
                  <input
                    type="password"
                    placeholder={
                      conn?.hasPortalPassword ? "Portal password (saved — enter new to replace)" : "Portal password"
                    }
                    value={f.portalPassword}
                    autoComplete="new-password"
                    onChange={(e) =>
                      setForms((p) => ({ ...p, [provider]: { ...p[provider], portalPassword: e.target.value } }))
                    }
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                  />
                  {isSynxis && (
                    <div className="space-y-2 rounded-lg border border-indigo-200 bg-white/80 p-3">
                      <p className="text-xs font-semibold text-indigo-950">Email OTP inbox (IMAP)</p>
                      <p className="text-[11px] text-indigo-900">
                        Dedicated mailbox that receives SynXis verification codes. Session remembered ~3 days
                        {conn?.hasPortalSession && conn.portalSessionAt
                          ? ` · last session ${new Date(conn.portalSessionAt).toLocaleString()}`
                          : conn?.hasPortalSession
                            ? " · session saved"
                            : " · no session yet"}
                        .
                      </p>
                      <input
                        placeholder="IMAP host (e.g. outlook.office365.com)"
                        value={f.portalImapHost}
                        onChange={(e) =>
                          setForms((p) => ({ ...p, [provider]: { ...p[provider], portalImapHost: e.target.value } }))
                        }
                        className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          placeholder="Port"
                          value={f.portalImapPort}
                          onChange={(e) =>
                            setForms((p) => ({
                              ...p,
                              [provider]: { ...p[provider], portalImapPort: Number(e.target.value) || 993 },
                            }))
                          }
                          className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                        />
                        <input
                          placeholder="Mailbox"
                          value={f.portalImapMailbox}
                          onChange={(e) =>
                            setForms((p) => ({
                              ...p,
                              [provider]: { ...p[provider], portalImapMailbox: e.target.value },
                            }))
                          }
                          className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                        />
                      </div>
                      <input
                        placeholder="IMAP username (email)"
                        value={f.portalImapUser}
                        autoComplete="off"
                        onChange={(e) =>
                          setForms((p) => ({ ...p, [provider]: { ...p[provider], portalImapUser: e.target.value } }))
                        }
                        className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="password"
                        placeholder={
                          conn?.hasImapPassword
                            ? "IMAP password / app password (saved — enter new to replace)"
                            : "IMAP password / app password"
                        }
                        value={f.portalImapPassword}
                        autoComplete="new-password"
                        onChange={(e) =>
                          setForms((p) => ({
                            ...p,
                            [provider]: { ...p[provider], portalImapPassword: e.target.value },
                          }))
                        }
                        className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                  <textarea
                    placeholder={
                      isSynxis
                        ? 'Optional selector JSON, e.g. {"boardUrl":"/path/to/rooms","cleanControl":"button:has-text(\\"Clean\\")"}'
                        : 'Optional selector JSON, e.g. {"downloadButton":"button:has-text(\\"Export\\")"}'
                    }
                    value={f.portalSelectors}
                    onChange={(e) =>
                      setForms((p) => ({ ...p, [provider]: { ...p[provider], portalSelectors: e.target.value } }))
                    }
                    rows={2}
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => save(provider)}
                      disabled={loading !== null}
                      className={`rounded-xl border bg-white px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                        isSynxis
                          ? "border-indigo-700 text-indigo-900 hover:bg-indigo-100"
                          : "border-emerald-700 text-emerald-900 hover:bg-emerald-100"
                      }`}
                    >
                      {loading === `save-${provider}` ? "Saving…" : "Save portal login"}
                    </button>
                    {isSynxis && (
                      <button
                        onClick={async () => {
                          setLoading(`clear-session-${provider}`);
                          setMessage(null);
                          try {
                            const res = await fetch("/api/pms", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "save",
                                provider,
                                ...forms[provider],
                                clearPortalSession: true,
                              }),
                            });
                            const cleared = await readJson(res);
                            setMessage(
                              cleared.success
                                ? "SynXis remembered session cleared — next collect will request a new email code."
                                : String(cleared.error || "Could not clear session")
                            );
                          } finally {
                            setLoading(null);
                            router.refresh();
                          }
                        }}
                        disabled={loading !== null || !conn?.hasPortalSession}
                        className="rounded-xl border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-50 disabled:opacity-50"
                      >
                        Clear saved session
                      </button>
                    )}
                    <button
                      onClick={() => portalCollect(provider)}
                      disabled={loading !== null}
                      className={`rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                        isSynxis
                          ? "bg-indigo-700 hover:bg-indigo-800"
                          : "bg-emerald-700 hover:bg-emerald-800"
                      }`}
                    >
                      {loading === `portal-${provider}`
                        ? "Collecting…"
                        : isSynxis
                          ? "Collect from SynXis login"
                          : "Collect from SkyTouch login"}
                    </button>
                  </div>
                  {portalStatus && (isSkyTouch || isSynxis) && (
                    <p
                      className={`rounded-lg border bg-white px-3 py-2 text-sm ${
                        isSynxis
                          ? "border-indigo-300 text-indigo-950"
                          : "border-emerald-300 text-emerald-950"
                      }`}
                    >
                      {portalStatus}
                    </p>
                  )}
                </div>
              )}

              <input
                placeholder="Property ID"
                value={f.propertyId}
                onChange={(e) => setForms((p) => ({ ...p, [provider]: { ...p[provider], propertyId: e.target.value } }))}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
              <input
                placeholder="API Base URL (required for live API sync)"
                value={f.baseUrl}
                onChange={(e) => setForms((p) => ({ ...p, [provider]: { ...p[provider], baseUrl: e.target.value } }))}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
              <input
                placeholder={conn?.hasApiKey ? "API Key (saved — enter new to replace)" : "API Key"}
                value={f.apiKey}
                onChange={(e) => setForms((p) => ({ ...p, [provider]: { ...p[provider], apiKey: e.target.value } }))}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
              <input
                placeholder={conn?.hasApiSecret ? "API Secret (saved — enter new to replace)" : "API Secret (if required)"}
                value={f.apiSecret}
                onChange={(e) => setForms((p) => ({ ...p, [provider]: { ...p[provider], apiSecret: e.target.value } }))}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />

              <p className="text-xs text-muted-foreground">
                Auto-collect runs every sync interval when{" "}
                <code className="rounded bg-muted px-1">npm run pms:cron:loop</code> is running next to the app
                (or production cron hits <code className="rounded bg-muted px-1">/api/pms/cron</code>).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Sync interval (min)</label>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={f.syncIntervalMinutes}
                    onChange={(e) =>
                      setForms((p) => ({
                        ...p,
                        [provider]: { ...p[provider], syncIntervalMinutes: Number(e.target.value) },
                      }))
                    }
                    className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Conflict policy</label>
                  <select
                    value={f.conflictPolicy}
                    onChange={(e) =>
                      setForms((p) => ({ ...p, [provider]: { ...p[provider], conflictPolicy: e.target.value } }))
                    }
                    className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <option value="PMS_RESERVATIONS_ONLY">PMS reservations; protect HK work</option>
                    <option value="PMS_WINS">PMS wins (overwrite status)</option>
                    <option value="MANUAL_WINS">Manual wins (guest/VIP only)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => save(provider)}
                  disabled={loading !== null}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  {loading === `save-${provider}` ? "..." : t("save")}
                </button>
                <button
                  onClick={() => sync(provider)}
                  disabled={loading !== null}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {loading === `sync-${provider}` ? "..." : t("syncNow")}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                API Sync without live credentials uses a demo payload. Portal collect uses the real SkyTouch login and
                your existing report importer.
              </p>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold">Sync History</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No syncs yet</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-4 py-3 text-sm">
                <span>
                  <strong>{log.provider}</strong> · {log.action} · {log.records} updates · {log.status}
                </span>
                <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                {log.message && <p className="w-full text-xs text-muted-foreground">{log.message}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
