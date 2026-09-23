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
};

function emptyForm(): FormState {
  return {
    propertyId: "",
    apiKey: "",
    apiSecret: "",
    baseUrl: "",
    enabled: false,
    syncIntervalMinutes: 15,
    conflictPolicy: "PMS_RESERVATIONS_ONLY",
  };
}

export function PmsPanel({ connections, logs }: { connections: Connection[]; logs: Log[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [forms, setForms] = useState<Record<string, FormState>>(
    Object.fromEntries(
      PROVIDERS.map((provider) => {
        const c = connections.find((x) => x.provider === provider);
        return [
          provider,
          c
            ? {
                propertyId: c.propertyId || "",
                apiKey: c.apiKey || "",
                apiSecret: c.apiSecret || "",
                baseUrl: c.baseUrl || "",
                enabled: c.enabled,
                syncIntervalMinutes: c.syncIntervalMinutes || 15,
                conflictPolicy: c.conflictPolicy || "PMS_RESERVATIONS_ONLY",
              }
            : emptyForm(),
        ];
      })
    )
  );
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save(provider: Provider) {
    setLoading(`save-${provider}`);
    setMessage(null);
    const f = forms[provider];
    const res = await fetch("/api/pms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", provider, ...f }),
    });
    const data = await res.json();
    setLoading(null);
    setMessage(data.success ? `${PROVIDER_LABELS[provider]} settings saved` : data.error);
    router.refresh();
  }

  async function sync(provider: Provider) {
    setLoading(`sync-${provider}`);
    setMessage(null);
    const res = await fetch("/api/pms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync", provider }),
    });
    const data = await res.json();
    setLoading(null);
    setMessage(
      data.success
        ? `${PROVIDER_LABELS[provider]} synced — ${data.updated} updated, ${data.skipped ?? 0} skipped (${data.policy || "policy"})`
        : data.error || "Sync failed"
    );
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{message}</div>
      )}

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Scheduled sync</p>
        <p className="mt-1">
          Call <code className="rounded bg-white px-1">GET /api/pms/cron</code> with{" "}
          <code className="rounded bg-white px-1">Authorization: Bearer $CRON_SECRET</code> every 5–15 minutes.
          Only enabled connectors past their interval will run.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const conn = connections.find((c) => c.provider === provider);
          const f = forms[provider] || emptyForm();
          return (
            <div key={provider} className="space-y-4 rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{PROVIDER_LABELS[provider]}</h2>
                  <p className="text-xs text-muted-foreground">
                    {conn?.enabled ? t("connected") : t("disconnected")}
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
                  Enable
                </label>
              </div>

              <input
                placeholder="Property ID"
                value={f.propertyId}
                onChange={(e) => setForms((p) => ({ ...p, [provider]: { ...p[provider], propertyId: e.target.value } }))}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
              <input
                placeholder="API Base URL (required for live sync)"
                value={f.baseUrl}
                onChange={(e) => setForms((p) => ({ ...p, [provider]: { ...p[provider], baseUrl: e.target.value } }))}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
              <input
                placeholder="API Key"
                value={f.apiKey}
                onChange={(e) => setForms((p) => ({ ...p, [provider]: { ...p[provider], apiKey: e.target.value } }))}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
              <input
                placeholder="API Secret (if required)"
                value={f.apiSecret}
                onChange={(e) => setForms((p) => ({ ...p, [provider]: { ...p[provider], apiSecret: e.target.value } }))}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />

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
                Without live credentials, Sync uses a demo PMS payload. Active cleaning rooms are protected under the default policy.
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
                  <strong>{log.provider}</strong> · {log.records} updates · {log.status}
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
