/**
 * Extra "Asking" counters on Today (Yard Desk left column), one per customer,
 * added with "+ Add counter" below Hooker Street. Same behavior as Evanston /
 * Hooker: a manual per-day asking tally with −/+ and "N dispatched today".
 *
 * - Counters (which customers have a card) sync through
 *   `dispatch_tally_counters`. Removing is a soft delete (`removed = true`)
 *   so a desk that hasn't synced yet can't bring a card back.
 * - Per-day tallies sync through `day_customer_tallies`, one row per
 *   (date, customer_key), last-write-wins by updated_at.
 * - If those tables aren't in Supabase yet, everything still works on this
 *   desk and uploads once the tables exist.
 */

import type { Load } from "../types";
import { isValidISODate } from "./chicagoDate";
import { fetchAllPaged, pagedErrorMessage } from "./cloud";
import {
  currentLanesByCustomer,
  isLaneStub,
  normalizePlaceName,
  type CustomerLaneStore,
} from "./customerLanes";
import { safeSetItem } from "./localStorageSafe";
import { getSupabase } from "./supabase";

export const CUSTOMER_TALLIES_STORE_KEY = "chitrader.load-tracker.customer-tallies.v1";
export const TALLY_COUNTERS_TABLE = "dispatch_tally_counters";
export const CUSTOMER_DAY_TALLIES_TABLE = "day_customer_tallies";

/** Cards that already exist on Today and never get an extra counter. */
const BUILT_IN_COUNTER_PLACES = ["Batavia", "Evanston", "Hooker Street", "Hooker"];

const MSW = "Trash (MSW)";

export type TallyCounter = {
  key: string;
  customer: string;
  position: number;
  removed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerDayTally = {
  date: string;
  key: string;
  asking: number;
  updatedAt: string;
};

export type CustomerTalliesState = {
  counters: Record<string, TallyCounter>;
  /** Keyed by `${date}|${key}`. */
  tallies: Record<string, CustomerDayTally>;
};

export type CustomerTalliesPersisted = { version: 1 } & CustomerTalliesState;

export function emptyCustomerTallies(): CustomerTalliesState {
  return { counters: {}, tallies: {} };
}

export function counterKey(customer: string): string {
  return normalizePlaceName(customer);
}

export function dayTallyKey(date: string, key: string): string {
  return `${date}|${key}`;
}

function isoOr(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && raw.trim() && !Number.isNaN(Date.parse(raw))) return raw.trim();
  return fallback;
}

function count(raw: unknown): number {
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function cleanCounter(raw: unknown): TallyCounter | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const customer = typeof r.customer === "string" ? r.customer.replace(/\s+/g, " ").trim() : "";
  const key = typeof r.key === "string" && r.key ? r.key : typeof r.customer_key === "string" ? r.customer_key : counterKey(customer);
  if (!customer || !key) return null;
  const epoch = new Date(0).toISOString();
  return {
    key,
    customer,
    position: count(r.position),
    removed: r.removed === true,
    createdAt: isoOr(r.createdAt ?? r.created_at, epoch),
    updatedAt: isoOr(r.updatedAt ?? r.updated_at, epoch),
  };
}

export function cleanDayTally(raw: unknown): CustomerDayTally | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const date = typeof r.date === "string" ? r.date.slice(0, 10) : "";
  const key = typeof r.key === "string" ? r.key : typeof r.customer_key === "string" ? r.customer_key : "";
  if (!isValidISODate(date) || !key) return null;
  return {
    date,
    key,
    asking: count(r.asking),
    updatedAt: isoOr(r.updatedAt ?? r.updated_at, new Date(0).toISOString()),
  };
}

export function cleanCustomerTallies(raw: unknown): CustomerTalliesState {
  const out = emptyCustomerTallies();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Partial<CustomerTalliesState>;
  for (const value of Object.values(r.counters ?? {})) {
    const c = cleanCounter(value);
    if (c) out.counters[c.key] = c;
  }
  for (const value of Object.values(r.tallies ?? {})) {
    const t = cleanDayTally(value);
    if (t) out.tallies[dayTallyKey(t.date, t.key)] = t;
  }
  return out;
}

export function readCustomerTalliesPersisted(): CustomerTalliesState {
  try {
    const raw = localStorage.getItem(CUSTOMER_TALLIES_STORE_KEY);
    if (!raw) return emptyCustomerTallies();
    return cleanCustomerTallies(JSON.parse(raw));
  } catch {
    return emptyCustomerTallies();
  }
}

export function writeCustomerTalliesPersisted(state: CustomerTalliesState): void {
  const payload: CustomerTalliesPersisted = { version: 1, ...state };
  safeSetItem(CUSTOMER_TALLIES_STORE_KEY, JSON.stringify(payload));
}

/** Cards to show, in the order they were added. */
export function activeCounters(state: CustomerTalliesState): TallyCounter[] {
  return Object.values(state.counters)
    .filter((c) => !c.removed)
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
}

export function askingOn(state: CustomerTalliesState, date: string, key: string): number {
  return state.tallies[dayTallyKey(date, key)]?.asking ?? 0;
}

function isBuiltIn(customer: string): boolean {
  const key = counterKey(customer);
  return BUILT_IN_COUNTER_PLACES.some((place) => counterKey(place) === key);
}

/**
 * Customers that can get a counter: at least one open lane (a current lane
 * with a destination, as listed on the Customers page), not Batavia /
 * Evanston / Hooker, and not already on Today.
 */
export function customersAvailableForCounter(
  lanes: CustomerLaneStore,
  state: CustomerTalliesState,
  asOf: string,
): string[] {
  const taken = new Set(activeCounters(state).map((c) => c.key));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const lane of currentLanesByCustomer(lanes, asOf)) {
    if (isLaneStub(lane)) continue;
    const key = counterKey(lane.customer);
    if (!key || seen.has(key) || taken.has(key) || isBuiltIn(lane.customer)) continue;
    seen.add(key);
    out.push(lane.customer);
  }
  return out.sort((a, b) => a.localeCompare(b, "en"));
}

/** True when this customer has a current Trash (MSW) lane. */
function hasMswLane(lanes: CustomerLaneStore, customer: string, asOf: string): boolean {
  const key = counterKey(customer);
  return currentLanesByCustomer(lanes, asOf).some(
    (lane) => !isLaneStub(lane) && counterKey(lane.customer) === key && lane.commodity === MSW,
  );
}

/**
 * "N dispatched today": that day's loads picked up at this customer. Like
 * Evanston / Hooker it counts Trash (MSW) loads; a customer with no MSW lane
 * counts all of its loads so the number isn't stuck at 0.
 */
export function dispatchedForCustomer(
  dayLoads: readonly Pick<Load, "pickup" | "commodity">[],
  customer: string,
  lanes: CustomerLaneStore,
  asOf: string,
): number {
  const key = counterKey(customer);
  if (!key) return 0;
  const mswOnly = hasMswLane(lanes, customer, asOf);
  let n = 0;
  for (const load of dayLoads) {
    if (counterKey(load.pickup) !== key) continue;
    if (mswOnly && load.commodity !== MSW) continue;
    n += 1;
  }
  return n;
}

export function addCounter(
  state: CustomerTalliesState,
  customer: string,
  now = new Date().toISOString(),
): { state: CustomerTalliesState; counter: TallyCounter | null } {
  const name = customer.replace(/\s+/g, " ").trim();
  const key = counterKey(name);
  if (!key || isBuiltIn(name)) return { state, counter: null };
  const existing = state.counters[key];
  if (existing && !existing.removed) return { state, counter: null };
  const position =
    Object.values(state.counters).reduce((max, c) => Math.max(max, c.position), 0) + 1;
  const counter: TallyCounter = {
    key,
    customer: name,
    position,
    removed: false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return { state: { ...state, counters: { ...state.counters, [key]: counter } }, counter };
}

export function removeCounter(
  state: CustomerTalliesState,
  key: string,
  now = new Date().toISOString(),
): { state: CustomerTalliesState; counter: TallyCounter | null } {
  const existing = state.counters[key];
  if (!existing || existing.removed) return { state, counter: null };
  const counter = { ...existing, removed: true, updatedAt: now };
  return { state: { ...state, counters: { ...state.counters, [key]: counter } }, counter };
}

export function setAsking(
  state: CustomerTalliesState,
  date: string,
  key: string,
  asking: number,
  now = new Date().toISOString(),
): { state: CustomerTalliesState; tally: CustomerDayTally | null } {
  if (!isValidISODate(date) || !key) return { state, tally: null };
  const tally: CustomerDayTally = { date, key, asking: count(asking), updatedAt: now };
  return {
    state: { ...state, tallies: { ...state.tallies, [dayTallyKey(date, key)]: tally } },
    tally,
  };
}

function reconcileLww<T extends { updatedAt: string }>(
  local: Record<string, T>,
  remote: Record<string, T>,
): { next: Record<string, T>; toUpload: T[] } {
  const next: Record<string, T> = {};
  const toUpload: T[] = [];
  for (const id of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[id];
    const r = remote[id];
    if (l && (!r || l.updatedAt > r.updatedAt)) {
      next[id] = l;
      toUpload.push(l);
    } else if (r) {
      next[id] = r;
    }
  }
  return { next, toUpload };
}

/** Last-write-wins on both counters and day tallies. Never deletes. */
export function reconcileCustomerTallies(
  local: CustomerTalliesState,
  remote: { counters: Record<string, TallyCounter> | null; tallies: Record<string, CustomerDayTally> | null },
): {
  next: CustomerTalliesState;
  countersToUpload: TallyCounter[];
  talliesToUpload: CustomerDayTally[];
} {
  const counters = remote.counters
    ? reconcileLww(local.counters, remote.counters)
    : { next: local.counters, toUpload: [] };
  const tallies = remote.tallies
    ? reconcileLww(local.tallies, remote.tallies)
    : { next: local.tallies, toUpload: [] };
  return {
    next: { counters: counters.next, tallies: tallies.next },
    countersToUpload: counters.toUpload,
    talliesToUpload: tallies.toUpload,
  };
}

type CounterRow = {
  customer_key: string;
  customer: string;
  position: number;
  removed: boolean;
  created_at: string;
  updated_at: string;
};

type DayTallyRow = {
  date: string;
  customer_key: string;
  asking: number;
  updated_at: string;
};

export function counterToRow(c: TallyCounter, userId: string | null) {
  return {
    customer_key: c.key,
    customer: c.customer,
    position: c.position,
    removed: c.removed,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    updated_by: userId,
  };
}

export function dayTallyToRow(t: CustomerDayTally, userId: string | null) {
  return {
    date: t.date,
    customer_key: t.key,
    asking: t.asking,
    updated_at: t.updatedAt,
    updated_by: userId,
  };
}

/** Pull both tables. A table that is missing (SQL not run yet) comes back null. */
export async function fetchCustomerTalliesFromCloud(): Promise<{
  counters: Record<string, TallyCounter> | null;
  tallies: Record<string, CustomerDayTally> | null;
}> {
  const supabase = getSupabase();
  if (!supabase) return { counters: null, tallies: null };
  const counterPull = await fetchAllPaged<CounterRow>(async (from, to) => {
    const page = await supabase
      .from(TALLY_COUNTERS_TABLE)
      .select("customer_key, customer, position, removed, created_at, updated_at")
      .order("customer_key", { ascending: true })
      .range(from, to);
    return { data: page.data as CounterRow[] | null, error: page.error };
  });
  const tallyPull = await fetchAllPaged<DayTallyRow>(async (from, to) => {
    const page = await supabase
      .from(CUSTOMER_DAY_TALLIES_TABLE)
      .select("date, customer_key, asking, updated_at")
      .order("date", { ascending: true })
      .order("customer_key", { ascending: true })
      .range(from, to);
    return { data: page.data as DayTallyRow[] | null, error: page.error };
  });
  let counters: Record<string, TallyCounter> | null = null;
  let tallies: Record<string, CustomerDayTally> | null = null;
  if (counterPull.data && !counterPull.error) {
    counters = {};
    for (const row of counterPull.data) {
      const c = cleanCounter(row);
      if (c) counters[c.key] = c;
    }
  } else {
    console.warn("dispatch_tally_counters pull failed", pagedErrorMessage(counterPull.error));
  }
  if (tallyPull.data && !tallyPull.error) {
    tallies = {};
    for (const row of tallyPull.data) {
      const t = cleanDayTally(row);
      if (t) tallies[dayTallyKey(t.date, t.key)] = t;
    }
  } else {
    console.warn("day_customer_tallies pull failed", pagedErrorMessage(tallyPull.error));
  }
  return { counters, tallies };
}

export async function upsertCountersToCloud(
  rows: TallyCounter[],
  userId: string | null,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !rows.length) return true;
  const { error } = await supabase
    .from(TALLY_COUNTERS_TABLE)
    .upsert(rows.map((row) => counterToRow(row, userId)));
  if (error) console.warn("dispatch_tally_counters upsert failed", error.message);
  return !error;
}

export async function upsertDayTalliesToCloud(
  rows: CustomerDayTally[],
  userId: string | null,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !rows.length) return true;
  const { error } = await supabase
    .from(CUSTOMER_DAY_TALLIES_TABLE)
    .upsert(rows.map((row) => dayTallyToRow(row, userId)));
  if (error) console.warn("day_customer_tallies upsert failed", error.message);
  return !error;
}
