"use client";

const DB_NAME = "housekeepai-offline";
const STORE = "rooms";
const DB_VERSION = 2;

export type CachedRoom = {
  id: string;
  number: string;
  floor: number;
  status: string;
  cleaningStatus: string;
  priority: number;
  estimatedMinutes: number;
  isVip: boolean;
  isRush: boolean;
  checklistItems: Array<{ id: string; label: string; completed: boolean }>;
  cachedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("queue")) {
        db.createObjectStore("queue", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheRooms(rooms: Omit<CachedRoom, "cachedAt">[]) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const now = Date.now();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.clear();
    for (const room of rooms) {
      store.put({ ...room, cachedAt: now });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedRooms(): Promise<CachedRoom[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as CachedRoom[]) || []);
    req.onerror = () => reject(req.error);
  });
}
