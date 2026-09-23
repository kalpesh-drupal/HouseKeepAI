"use client";

const DB_NAME = "housekeepai-offline";
const STORE = "queue";

export type OfflineAction = {
  id: string;
  url: string;
  method: string;
  body?: string;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("rooms")) {
        db.createObjectStore("rooms", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOfflineAction(action: Omit<OfflineAction, "id" | "createdAt">) {
  const db = await openDb();
  const item: OfflineAction = {
    ...action,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return item;
}

export async function getOfflineQueue(): Promise<OfflineAction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as OfflineAction[]);
    req.onerror = () => reject(req.error);
  });
}

export async function clearOfflineAction(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function flushOfflineQueue(): Promise<number> {
  const queue = await getOfflineQueue();
  let synced = 0;
  for (const item of queue.sort((a, b) => a.createdAt - b.createdAt)) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        body: item.body,
      });
      if (res.ok) {
        await clearOfflineAction(item.id);
        synced += 1;
      }
    } catch {
      break; // still offline
    }
  }
  return synced;
}

/** Fetch wrapper that queues mutating requests when offline. */
export async function offlineAwareFetch(url: string, init?: RequestInit) {
  const method = (init?.method || "GET").toUpperCase();
  const isMutation = ["POST", "PATCH", "PUT", "DELETE"].includes(method);

  if (!navigator.onLine && isMutation) {
    await enqueueOfflineAction({
      url,
      method,
      body: typeof init?.body === "string" ? init.body : init?.body ? JSON.stringify(init.body) : undefined,
    });
    return new Response(JSON.stringify({ queued: true, offline: true }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    return await fetch(url, init);
  } catch (err) {
    if (isMutation) {
      await enqueueOfflineAction({
        url,
        method,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return new Response(JSON.stringify({ queued: true, offline: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw err;
  }
}
