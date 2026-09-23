"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

export function NotificationToggle() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
      setEnabled(localStorage.getItem("hkai-notify") === "1" && Notification.permission === "granted");
    }
  }, []);

  async function enable() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      localStorage.setItem("hkai-notify", "1");
      setEnabled(true);
      new Notification("HouseKeepAI", { body: "Notifications enabled for this device." });
      // Store a lightweight subscription marker for server awareness
      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: `browser://${crypto.randomUUID()}`,
          keys: { p256dh: "browser", auth: "local" },
        }),
      }).catch(() => {});
    }
  }

  function disable() {
    localStorage.setItem("hkai-notify", "0");
    setEnabled(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {enabled ? (
        <button onClick={disable} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm">
          <BellOff className="h-4 w-4" /> Disable
        </button>
      ) : (
        <button onClick={enable} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white">
          <Bell className="h-4 w-4" /> Enable notifications
        </button>
      )}
      <span className="text-xs text-muted-foreground">Permission: {permission}</span>
    </div>
  );
}

export function notifyLocal(title: string, body: string) {
  if (typeof window === "undefined") return;
  if (localStorage.getItem("hkai-notify") !== "1") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification(title, { body, icon: "/icon-192.png" });
}
