/**
 * Big load stores (device backup + cloud cache) live in IndexedDB, not
 * localStorage (1.1.42). localStorage caps at ~10 MB per origin; once full,
 * writes failed silently and the app kept showing a days-old copy (Oct 19:
 * web showed 58 of 378 loads; home desktop re-inserted 28 deleted loads).
 *
 * Reads/writes stay synchronous through an in-memory mirror; IndexedDB is
 * written behind it. Any failed write flips `loadStorageHealthy()` to false
 * and notifies listeners so the UI can show a loud error and pause refresh.
 */
import { safeSetItem } from "./localStorageSafe";

export const IDB_LOAD_KEYS: readonly string[] = [
  "chitrader.load-tracker.v1",
  "chitrader.load-tracker.cloud-cache.v1",
];

const DB_NAME = "chitrader-load-tracker";
const DB_STORE = "kv";

type Mode = "local" | "idb";
let mode: Mode = "local";
let db: IDBDatabase | null = null;
const mem = new Map<string, string | null>();
let healthy = true;
let lastError: string | null = null;
const listeners = new Set<() => void>();
const pendingWrite = new Map<string, string | null>();
let writeChain: Promise<void> = Promise.resolve();

export function isIdbLoadKey(key: string): boolean {
  return IDB_LOAD_KEYS.includes(key);
}

export function loadStorageHealthy(): boolean {
  return healthy;
}

export function loadStorageError(): string | null {
  return lastError;
}

export function onLoadStorageChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function loadStorageMode(): Mode {
  return mode;
}

function markFailed(message: string): void {
  const changed = healthy || lastError !== message;
  healthy = false;
  lastError = message;
  console.error("[load-storage]", message);
  if (changed) for (const fn of listeners) fn();
}

/** Test hook. */
export function __resetLoadStorageForTests(): void {
  mode = "local";
  db = null;
  mem.clear();
  pendingWrite.clear();
  healthy = true;
  lastError = null;
}

export function loadStoreGet(key: string): string | null {
  if (mode === "idb" && mem.has(key)) return mem.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns false when the write is known to have failed (sync must not advance). */
export function loadStoreSet(key: string, value: string): boolean {
  if (mode !== "idb" || !db) {
    const ok = safeSetItem(key, value);
    if (!ok) markFailed("This computer could not save the load list (browser storage is full).");
    return ok;
  }
  mem.set(key, value);
  pendingWrite.set(key, value);
  const handle = db;
  writeChain = writeChain.then(() => flushKey(handle, key));
  return healthy;
}

function flushKey(handle: IDBDatabase, key: string): Promise<void> {
  if (!pendingWrite.has(key)) return Promise.resolve();
  const value = pendingWrite.get(key) ?? null;
  pendingWrite.delete(key);
  return new Promise<void>((resolve) => {
    try {
      const tx = handle.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      if (value === null) store.delete(key);
      else store.put(value, key);
      tx.oncomplete = () => resolve();
      const fail = () => {
        markFailed(
          `This computer could not save the load list (${tx.error?.name ?? "IndexedDB error"}).`,
        );
        resolve();
      };
      tx.onerror = fail;
      tx.onabort = fail;
    } catch (error) {
      markFailed(`This computer could not save the load list (${String(error)}).`);
      resolve();
    }
  });
}

/** Resolves once every queued IndexedDB write has finished. */
export function loadStorageIdle(): Promise<void> {
  return writeChain;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    req.onblocked = () => reject(new Error("indexedDB open blocked"));
  });
}

function idbGet(handle: IDBDatabase, key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const req = handle.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
    req.onerror = () => reject(req.error ?? new Error("indexedDB get failed"));
  });
}

function idbPut(handle: IDBDatabase, key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = handle.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB put failed"));
    tx.onabort = () => reject(tx.error ?? new Error("indexedDB put aborted"));
  });
}

/**
 * Call once before rendering. Moves the two big keys from localStorage into
 * IndexedDB (copy, verify, then free localStorage). Falls back to
 * localStorage mode if IndexedDB is unavailable or slow.
 */
export async function hydrateLoadStorage(timeoutMs = 5000): Promise<Mode> {
  if (typeof indexedDB === "undefined") return mode;
  let timedOut = false;
  const work = (async () => {
    const handle = await openDb();
    const values = new Map<string, string | null>();
    for (const key of IDB_LOAD_KEYS) {
      let value = await idbGet(handle, key);
      if (value === null) {
        let legacy: string | null = null;
        try {
          legacy = localStorage.getItem(key);
        } catch {
          legacy = null;
        }
        if (legacy !== null) {
          await idbPut(handle, key, legacy);
          const check = await idbGet(handle, key);
          if (check !== legacy) throw new Error("indexedDB verify failed");
          value = legacy;
        }
      }
      values.set(key, value);
    }
    if (timedOut) return;
    for (const [key, value] of values) mem.set(key, value);
    db = handle;
    mode = "idb";
    // Copied and verified: free the localStorage quota for everything else.
    for (const key of IDB_LOAD_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  })();
  const timer = new Promise<void>((resolve) =>
    setTimeout(() => {
      timedOut = true;
      resolve();
    }, timeoutMs),
  );
  try {
    await Promise.race([work, timer]);
  } catch (error) {
    console.warn("[load-storage] IndexedDB unavailable, staying on localStorage", error);
  }
  return mode;
}
