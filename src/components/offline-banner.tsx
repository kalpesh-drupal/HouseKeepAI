"use client";

import { useEffect, useState } from "react";
import { flushOfflineQueue, getOfflineQueue } from "@/lib/offline/queue";
import { useI18n } from "@/lib/i18n/context";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export function OfflineBanner() {
  const { t } = useI18n();
  const [online, setOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshQueue() {
    try {
      const q = await getOfflineQueue();
      setQueueCount(q.length);
    } catch {
      setQueueCount(0);
    }
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    refreshQueue();

    const onOnline = async () => {
      setOnline(true);
      setMessage(t("syncing"));
      const synced = await flushOfflineQueue();
      await refreshQueue();
      setMessage(synced > 0 ? t("syncDone") : null);
      setTimeout(() => setMessage(null), 3000);
    };
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [t]);

  if (online && !message && queueCount === 0) return null;

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 text-sm ${
        online ? "bg-blue-50 text-blue-900" : "bg-amber-100 text-amber-900"
      }`}
    >
      <div className="flex items-center gap-2">
        {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
        <span>
          {message || (online ? t("online") : t("offline"))}
          {queueCount > 0 ? ` · ${queueCount} queued` : ""}
        </span>
      </div>
      {online && queueCount > 0 && (
        <button
          onClick={async () => {
            setMessage(t("syncing"));
            await flushOfflineQueue();
            await refreshQueue();
            setMessage(t("syncDone"));
            setTimeout(() => setMessage(null), 2500);
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-white/80 px-2 py-1 text-xs font-medium"
        >
          <RefreshCw className="h-3 w-3" /> {t("syncNow")}
        </button>
      )}
    </div>
  );
}
