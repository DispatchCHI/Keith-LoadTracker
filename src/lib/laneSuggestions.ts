import type { Load } from "../types";
import { addDays, weekdayOfISO } from "./chicagoDate";
import { nameBelongsToDriver } from "./rosterVacation";

export type LaneSuggestion = {
  key: string;
  stationId: string;
  pickup: string;
  commodity: string;
  destination: string;
  count: number;
  score: number;
  lastDate: string;
  /** True when today's specialty board has nothing left on this lane. */
  closed: boolean;
  /** Seen in the last few working days (vs. the longer most-frequent fallback). */
  recent: boolean;
};

/** 1.1.52: lanes run in the last N working days (Sundays skipped) come first. */
export const LANE_SUGGEST_RECENT_WORKDAYS = 5;
/** Per-working-day decay inside the recent window: yesterday 0.7, 2 days 0.49, ... */
export const LANE_SUGGEST_RECENT_DECAY = 0.7;
/** Longer window used only to fill slots when recent history is thin. */
export const LANE_SUGGEST_FALLBACK_DAYS = 30;

/** Working days (Mon-Sat; Sundays skipped) from `from` up to `to`. 0 = same day. */
export function workingDaysBetween(from: string, to: string): number {
  if (from >= to) return 0;
  let n = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) {
    if (weekdayOfISO(d) !== 0) n += 1;
  }
  return n;
}

export function laneKey(load: Pick<Load, "stationId" | "pickup" | "commodity" | "destination">): string {
  return [load.stationId, load.pickup, load.commodity, load.destination]
    .map((part) => (part ?? "").trim().toLowerCase())
    .join("|");
}

/**
 * Up to `limit` (3) lanes for this driver. Exact driver ownership
 * (suffix-aware resolver), so Robert Jones never gets Robert Jones Jr.'s lanes.
 *
 * 1.1.52 rule, relative to the log date and using every synced load:
 *  1. Lanes (pickup + commodity + destination) the driver ran in the last
 *     5 working days, ranked by recency-weighted frequency (each load counts
 *     0.7^workingDaysAgo, so a load yesterday beats one 4 days ago, and a
 *     lane run repeatedly this week beats a one-off).
 *  2. Only if fewer than `limit` recent lanes exist, the remaining slots are
 *     filled with the most frequent lanes over the last 30 days.
 * A lane with nothing open today is flagged `closed` (shown muted) but never
 * changes the order.
 */
export function suggestLanesForDriver(input: {
  loads: readonly Load[];
  driverName: string | null | undefined;
  today: string;
  resolveName?: (name: string) => string | null;
  isClosed?: (lane: Pick<Load, "stationId" | "pickup" | "commodity" | "destination">) => boolean;
  recentWorkdays?: number;
  fallbackDays?: number;
  limit?: number;
}): LaneSuggestion[] {
  const driver = input.driverName?.trim();
  if (!driver) return [];
  const recentWorkdays = input.recentWorkdays ?? LANE_SUGGEST_RECENT_WORKDAYS;
  const fallbackStart = addDays(input.today, -(input.fallbackDays ?? LANE_SUGGEST_FALLBACK_DAYS));
  const limit = input.limit ?? 3;
  const byKey = new Map<string, LaneSuggestion>();
  const ageCache = new Map<string, number>();
  const workdaysAgo = (date: string) => {
    let age = ageCache.get(date);
    if (age === undefined) {
      age = workingDaysBetween(date, input.today);
      ageCache.set(date, age);
    }
    return age;
  };
  const recentCount = new Map<string, number>();
  const recentScore = new Map<string, number>();
  for (const load of input.loads) {
    if (load.date < fallbackStart || load.date > input.today) continue;
    if (!load.destination?.trim()) continue;
    const logged = load.driverName;
    if (typeof logged !== "string" || !logged.trim()) continue;
    if (!nameBelongsToDriver(logged, driver, input.resolveName)) continue;
    const key = laneKey(load);
    const age = workdaysAgo(load.date);
    const isRecent = age <= recentWorkdays;
    if (isRecent) {
      recentCount.set(key, (recentCount.get(key) ?? 0) + 1);
      recentScore.set(
        key,
        (recentScore.get(key) ?? 0) + Math.pow(LANE_SUGGEST_RECENT_DECAY, age),
      );
    }
    const hit = byKey.get(key);
    if (hit) {
      hit.count += 1;
      if (load.date > hit.lastDate) {
        hit.lastDate = load.date;
        hit.pickup = load.pickup;
        hit.destination = load.destination;
        hit.commodity = load.commodity;
      }
    } else {
      byKey.set(key, {
        key,
        stationId: load.stationId,
        pickup: load.pickup,
        commodity: load.commodity,
        destination: load.destination,
        count: 1,
        score: 0,
        lastDate: load.date,
        closed: false,
        recent: false,
      });
    }
  }
  const all = [...byKey.values()];
  for (const lane of all) {
    lane.score = recentScore.get(lane.key) ?? 0;
    lane.recent = recentCount.has(lane.key);
    lane.closed = Boolean(input.isClosed?.(lane));
  }
  const recent = all
    .filter((lane) => lane.recent)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.lastDate !== b.lastDate) return b.lastDate.localeCompare(a.lastDate);
      return a.key.localeCompare(b.key);
    });
  const out = recent.slice(0, limit);
  if (out.length < limit) {
    const fill = all
      .filter((lane) => !lane.recent)
      .sort((a, b) => {
        if (a.count !== b.count) return b.count - a.count;
        if (a.lastDate !== b.lastDate) return b.lastDate.localeCompare(a.lastDate);
        return a.key.localeCompare(b.key);
      });
    out.push(...fill.slice(0, limit - out.length));
  }
  return out;
}