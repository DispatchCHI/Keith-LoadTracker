import type { Load } from "../types";
import { addDays } from "./chicagoDate";
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
};

export const LANE_SUGGEST_DAYS = 45;
/** Recency half-life in days: a load 15 days ago weighs half of one today. */
export const LANE_SUGGEST_HALF_LIFE = 15;

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function laneKey(load: Pick<Load, "stationId" | "pickup" | "commodity" | "destination">): string {
  return [load.stationId, load.pickup, load.commodity, load.destination]
    .map((part) => (part ?? "").trim().toLowerCase())
    .join("|");
}

/**
 * Up to `limit` lanes this driver ran recently, recency-weighted. Exact
 * driver ownership (suffix-aware resolver), so Robert Jones never gets Robert
 * Jones Jr.'s lanes. Lanes with nothing left today sort after open ones but
 * are not hidden.
 */
export function suggestLanesForDriver(input: {
  loads: readonly Load[];
  driverName: string | null | undefined;
  today: string;
  resolveName?: (name: string) => string | null;
  isClosed?: (lane: Pick<Load, "stationId" | "pickup" | "commodity" | "destination">) => boolean;
  days?: number;
  limit?: number;
}): LaneSuggestion[] {
  const driver = input.driverName?.trim();
  if (!driver) return [];
  const days = input.days ?? LANE_SUGGEST_DAYS;
  const start = addDays(input.today, -days);
  const byKey = new Map<string, LaneSuggestion>();
  for (const load of input.loads) {
    if (load.date < start || load.date > input.today) continue;
    if (!load.destination?.trim()) continue;
    const logged = load.driverName;
    if (typeof logged !== "string" || !logged.trim()) continue;
    if (!nameBelongsToDriver(logged, driver, input.resolveName)) continue;
    const key = laneKey(load);
    const age = Math.max(0, daysBetween(load.date, input.today));
    const weight = Math.pow(0.5, age / LANE_SUGGEST_HALF_LIFE);
    const hit = byKey.get(key);
    if (hit) {
      hit.count += 1;
      hit.score += weight;
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
        score: weight,
        lastDate: load.date,
        closed: false,
      });
    }
  }
  const list = [...byKey.values()];
  for (const lane of list) lane.closed = Boolean(input.isClosed?.(lane));
  list.sort((a, b) => {
    if (a.closed !== b.closed) return a.closed ? 1 : -1;
    if (a.score !== b.score) return b.score - a.score;
    if (a.count !== b.count) return b.count - a.count;
    return a.key.localeCompare(b.key);
  });
  return list.slice(0, input.limit ?? 3);
}
