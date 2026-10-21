/**
 * Evanston load check-off, shared by every signed-in desk (1.1.45).
 * Other stations keep the local-only shade in loadCheckoff.ts.
 *
 * Local mirror + outbound queue (pending flag) in localStorage; cloud table
 * public.load_checkoffs (one row per load, last writer wins by updated_at).
 * Toggle-off is a row with checked=false, so it syncs too. If the table is
 * not created yet, the shade keeps working on this device and retries later.
 */
import { safeSetItem } from "./localStorageSafe";
import { getSupabase } from "./supabase";

export const EVANSTON_CHECKOFF_KEY = "chitrader.load-tracker.evanston-checkoff.v1";
export const LOAD_CHECKOFFS_TABLE = "load_checkoffs";
/** Rows re-read on every pull (today and back). */
export const CHECKOFF_PULL_DAYS = 4;
export const CHECKOFF_POLL_MS = 30_000;
const MISSING_TABLE_RETRY_MS = 10 * 60_000;

export type CheckoffEntry = {
  loadId: string;
  checked: boolean;
  checkedAt: string | null;
  checkedBy: string | null;
  updatedAt: string;
  /** Not yet confirmed by the cloud. */
  pending?: boolean;
};

export type CheckoffStore = Record<string, CheckoffEntry>;

type Row = {
  load_id: string;
  checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
  updated_at: string;
};

export function isEvanstonPickup(pickup: string, stationId?: string): boolean {
  if (stationId === "evanston") return true;
  return pickup.trim().toLowerCase().replace(/[^a-z]/g, "") === "evanston";
}

export function parseCheckoffStore(raw: string | null): CheckoffStore {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: CheckoffStore = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const e = value as Partial<CheckoffEntry> | null;
      if (!e || typeof e.updatedAt !== "string" || typeof e.checked !== "boolean") continue;
      out[id] = {
        loadId: id,
        checked: e.checked,
        checkedAt: typeof e.checkedAt === "string" ? e.checkedAt : null,
        checkedBy: typeof e.checkedBy === "string" ? e.checkedBy : null,
        updatedAt: e.updatedAt,
        pending: e.pending === true,
      };
    }
    return out;
  } catch {
    return {};
  }
}

/** Click: flip one load; the new entry is queued for upload. */
export function toggleCheckoff(
  store: CheckoffStore,
  loadId: string,
  currentlyChecked: boolean,
  by: string | null,
  now: string,
): CheckoffStore {
  const checked = !currentlyChecked;
  return {
    ...store,
    [loadId]: {
      loadId,
      checked,
      checkedAt: checked ? now : null,
      checkedBy: checked ? by : null,
      updatedAt: now,
      pending: true,
    },
  };
}

/** Apply pulled rows. A newer local pending click is never overwritten. */
export function mergeCheckoffRows(store: CheckoffStore, rows: readonly Row[]): CheckoffStore {
  const next = { ...store };
  for (const row of rows) {
    if (!row?.load_id || typeof row.updated_at !== "string") continue;
    const local = next[row.load_id];
    if (local?.pending && Date.parse(local.updatedAt) >= Date.parse(row.updated_at)) continue;
    if (local && !local.pending && Date.parse(local.updatedAt) > Date.parse(row.updated_at)) continue;
    next[row.load_id] = {
      loadId: row.load_id,
      checked: row.checked === true,
      checkedAt: row.checked_at ?? null,
      checkedBy: row.checked_by ?? null,
      updatedAt: row.updated_at,
      pending: false,
    };
  }
  return next;
}

export function pendingCheckoffs(store: CheckoffStore): CheckoffEntry[] {
  return Object.values(store).filter((e) => e.pending);
}

export function entryToRow(e: CheckoffEntry): Row {
  return {
    load_id: e.loadId,
    checked: e.checked,
    checked_at: e.checkedAt,
    checked_by: e.checkedBy,
    updated_at: e.updatedAt,
  };
}

export function isMissingCheckoffTable(error: unknown): boolean {
  const e = error as { code?: string; message?: string; status?: number } | null;
  if (!e) return false;
  if (e.code === "PGRST205" || e.code === "42P01" || e.status === 404) return true;
  return /load_checkoffs/i.test(e.message ?? "") && /(does not exist|could not find|schema cache)/i.test(e.message ?? "");
}

/* ---------- module store (shared by every popup) ---------- */

let store: CheckoffStore = (() => {
  try {
    return parseCheckoffStore(localStorage.getItem(EVANSTON_CHECKOFF_KEY));
  } catch {
    return {};
  }
})();
const listeners = new Set<() => void>();
let missingUntil = 0;
let inFlight: Promise<void> | null = null;

function setStore(next: CheckoffStore): void {
  store = next;
  safeSetItem(EVANSTON_CHECKOFF_KEY, JSON.stringify(next));
  for (const fn of listeners) fn();
}

export function getCheckoffStore(): CheckoffStore {
  return store;
}

export function subscribeCheckoffs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toggleEvanstonCheckoff(loadId: string, currentlyChecked: boolean, by: string | null): void {
  setStore(toggleCheckoff(store, loadId, currentlyChecked, by, new Date().toISOString()));
  void syncEvanstonCheckoffs();
}

/** Push queued clicks, then pull recent rows. Safe to call often. */
export function syncEvanstonCheckoffs(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const supabase = getSupabase();
    if (!supabase || Date.now() < missingUntil) return;
    const pending = pendingCheckoffs(store);
    if (pending.length) {
      const { error } = await supabase.from(LOAD_CHECKOFFS_TABLE).upsert(pending.map(entryToRow));
      if (error) {
        if (isMissingCheckoffTable(error)) missingUntil = Date.now() + MISSING_TABLE_RETRY_MS;
        else console.warn("[checkoff] upload failed", error.message);
        return;
      }
      const sent = new Map(pending.map((e) => [e.loadId, e.updatedAt]));
      const next = { ...store };
      for (const [id, at] of sent) {
        if (next[id]?.updatedAt === at) next[id] = { ...next[id], pending: false };
      }
      setStore(next);
    }
    const since = new Date(Date.now() - CHECKOFF_PULL_DAYS * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from(LOAD_CHECKOFFS_TABLE)
      .select("load_id,checked,checked_at,checked_by,updated_at")
      .gte("updated_at", since)
      .limit(5000);
    if (error) {
      if (isMissingCheckoffTable(error)) missingUntil = Date.now() + MISSING_TABLE_RETRY_MS;
      else console.warn("[checkoff] pull failed", error.message);
      return;
    }
    if (Array.isArray(data) && data.length) setStore(mergeCheckoffRows(store, data as Row[]));
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
