/**
 * Trucks a dispatcher has marked available for a transfer station.
 * One crew-wide list per station (not per day). Batavia is the only
 * station turned on; the pool is keyed by stationOrderKey so another
 * station can be added without a schema change.
 */

import { sanitizeTruck } from "./truck";
import { stationOrderKey } from "./transferStationOrder";

export const STATION_TRUCK_SLOT_COUNT = 10;
export const STATION_TRUCK_POOL_KEY = "chitrader.load-tracker.station-truck-pool.v1";
export const STATION_TRUCK_POOL_META_KEY = "chitrader.load-tracker.station-truck-pool.meta.v1";
export const STATION_TRUCK_POOL_EVENT = "klt-station-truck-pool";
export const STATION_TRUCK_POOL_FLUSH_EVENT = "klt-station-truck-pool-flush";

/** Stations whose Today card shows the truck boxes. Keys, not labels. */
const ENABLED_STATION_KEYS = new Set(["batavia"]);

export type StationTruckPool = Record<string, string[]>;

type StoredPool = {
  slots: StationTruckPool;
  updatedAt: string;
};

let cachedRaw: string | null | undefined;
let cached: StoredPool | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: { key: string; slots: string[] } | null = null;

export function stationTruckPoolEnabled(labelOrKey: string): boolean {
  const key = stationOrderKey(labelOrKey);
  return key.length > 0 && ENABLED_STATION_KEYS.has(key);
}

export function emptyTruckSlots(): string[] {
  return Array.from({ length: STATION_TRUCK_SLOT_COUNT }, () => "");
}

/** Ten sanitized truck numbers. Blank boxes stay blank so they stay "empty". */
export function normalizeTruckSlots(raw: unknown): string[] {
  const out = emptyTruckSlots();
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < STATION_TRUCK_SLOT_COUNT; i++) {
    const value = raw[i];
    out[i] = typeof value === "string" ? sanitizeTruck(value) : "";
  }
  return out;
}

export function normalizeStationTruckPool(raw: unknown): StationTruckPool {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: StationTruckPool = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const station = stationOrderKey(key);
    if (!station) continue;
    out[station] = normalizeTruckSlots(value);
  }
  return out;
}

export function truckSlotFilled(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

/**
 * Index of the next empty box after `fromIndex`, wrapping to the start.
 * The current box is not a candidate. Null when every box is filled.
 */
export function nextEmptyTruckSlot(slots: readonly string[], fromIndex: number): number | null {
  const count = slots.length;
  if (count <= 0) return null;
  for (let step = 1; step <= count; step++) {
    const index = (fromIndex + step) % count;
    if (index === fromIndex) break;
    if (!truckSlotFilled(slots[index])) return index;
  }
  return null;
}

/** Previous box, or null on the first box. */
export function previousTruckSlot(fromIndex: number): number | null {
  return fromIndex > 0 ? fromIndex - 1 : null;
}

function readMeta(): string {
  try {
    const raw = localStorage.getItem(STATION_TRUCK_POOL_META_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { updatedAt?: unknown };
    return typeof parsed.updatedAt === "string" ? parsed.updatedAt : "";
  } catch {
    return "";
  }
}

function readToken(): string | null {
  try {
    const slots = localStorage.getItem(STATION_TRUCK_POOL_KEY);
    const meta = localStorage.getItem(STATION_TRUCK_POOL_META_KEY);
    if (slots == null && !meta) return null;
    return `${slots ?? ""}\u0000${meta ?? ""}`;
  } catch {
    return null;
  }
}

function readStored(): StoredPool | null {
  const token = readToken();
  if (cachedRaw === token) return cached;
  cachedRaw = token;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STATION_TRUCK_POOL_KEY);
  } catch {
    raw = null;
  }
  if (!raw) {
    cached = null;
    return null;
  }
  try {
    cached = { slots: normalizeStationTruckPool(JSON.parse(raw) as unknown), updatedAt: readMeta() };
  } catch {
    cached = null;
  }
  return cached;
}

function notifyPool(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STATION_TRUCK_POOL_EVENT));
}

export function flushStationTruckPool(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STATION_TRUCK_POOL_FLUSH_EVENT));
}

function writeStored(slots: StationTruckPool, updatedAt: string, flush: boolean): void {
  const normalized = normalizeStationTruckPool(slots);
  const payload = JSON.stringify(normalized);
  const meta = JSON.stringify({ updatedAt });
  const token = `${payload}\u0000${meta}`;
  if (cachedRaw === token) return;
  try {
    localStorage.setItem(STATION_TRUCK_POOL_KEY, payload);
  } catch {
    /* private mode */
  }
  try {
    localStorage.setItem(STATION_TRUCK_POOL_META_KEY, meta);
  } catch {
    /* private mode */
  }
  cachedRaw = token;
  cached = { slots: normalized, updatedAt };
  notifyPool();
  if (flush) flushStationTruckPool();
}

export function readStationTruckPool(): StationTruckPool {
  return readStored()?.slots ?? {};
}

export function readStationTruckPoolUpdatedAt(): string {
  return readStored()?.updatedAt || readMeta();
}

export function readStationTruckSlots(labelOrKey: string): string[] {
  const key = stationOrderKey(labelOrKey);
  return readStationTruckPool()[key] ?? emptyTruckSlots();
}

/** Replace the local crew pool from a cloud row. Does not push. */
export function applyStationTruckPoolRemote(incoming: unknown, updatedAt: string): StationTruckPool {
  const slots = normalizeStationTruckPool(incoming);
  writeStored(slots, updatedAt || new Date().toISOString(), false);
  return slots;
}

export function poolHasTrucks(slots: StationTruckPool): boolean {
  return Object.values(slots).some((row) => row.some((value) => truckSlotFilled(value)));
}

/**
 * Newer updated_at wins the whole crew row. A missing local stamp yields
 * to any remote row. Equal stamps keep the remote copy on pull.
 */
export function stationTruckPoolWinner(
  local: { slots: StationTruckPool; updatedAt: string },
  remote: { slots: unknown; updatedAt: string } | null,
): { slots: StationTruckPool; updatedAt: string; source: "local" | "remote" } {
  if (!remote?.updatedAt) return { slots: local.slots, updatedAt: local.updatedAt, source: "local" };
  const remoteSlots = normalizeStationTruckPool(remote.slots);
  if (!local.updatedAt || Date.parse(local.updatedAt) <= Date.parse(remote.updatedAt)) {
    return { slots: remoteSlots, updatedAt: remote.updatedAt, source: "remote" };
  }
  return { slots: local.slots, updatedAt: local.updatedAt, source: "local" };
}

function commitSlots(stationKey: string, slots: readonly string[]): void {
  const key = stationOrderKey(stationKey);
  if (!key) return;
  const next = { ...readStationTruckPool(), [key]: normalizeTruckSlots(slots) };
  writeStored(next, new Date().toISOString(), true);
}

function cancelScheduledSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  pendingSave = null;
}

/** Blank one box. Other boxes are left as they are. */
export function clearStationTruckSlotAt(slots: readonly string[], index: number): string[] {
  const next = normalizeTruckSlots(slots);
  if (index >= 0 && index < next.length) next[index] = "";
  return next;
}

/** Select the whole truck number. Used on focus so one Delete clears it. */
export function selectTruckInputText(input: {
  value: string;
  setSelectionRange?: (start: number, end: number) => void;
  select?: () => void;
}): void {
  if (typeof input.setSelectionRange === "function") {
    input.setSelectionRange(0, input.value.length);
    return;
  }
  input.select?.();
}

/**
 * Write these boxes now and drop any save still waiting. An empty list is a
 * real crew row (ten blanks plus a new stamp), not missing data.
 */
export function saveStationTruckSlotsNow(labelOrKey: string, slots: readonly string[]): string[] {
  cancelScheduledSave();
  const normalized = normalizeTruckSlots(slots);
  commitSlots(labelOrKey, normalized);
  return readStationTruckSlots(labelOrKey);
}

/**
 * Wipe one station's boxes now. The ten blanks stay on the crew row with a
 * new stamp so an older filled cloud copy cannot fill them back in.
 * A save that was still waiting (typed trucks not yet flushed) is dropped.
 */
export function clearStationTruckSlots(labelOrKey: string): string[] {
  return saveStationTruckSlotsNow(labelOrKey, emptyTruckSlots());
}

function runPendingSave(): void {
  const job = pendingSave;
  pendingSave = null;
  if (job) commitSlots(job.key, job.slots);
}

/** Enter/blur persistence. Keystrokes update the field; this writes the crew row. */
export function scheduleStationTruckSave(
  labelOrKey: string,
  slots: readonly string[],
  delayMs = 400,
): void {
  const key = stationOrderKey(labelOrKey);
  if (!key) return;
  pendingSave = { key, slots: normalizeTruckSlots(slots) };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    runPendingSave();
  }, delayMs);
}

/** Run a pending debounced save immediately. */
export function flushScheduledStationTruckSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  runPendingSave();
}

export function subscribeStationTruckPool(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STATION_TRUCK_POOL_KEY && event.key !== STATION_TRUCK_POOL_META_KEY) return;
    cachedRaw = undefined;
    listener();
  };
  window.addEventListener(STATION_TRUCK_POOL_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STATION_TRUCK_POOL_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
