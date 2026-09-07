import type { DayStore, LockedDay } from "./driverDays";
import { isDriverTallyDay } from "./driverDays";

const DAYS_KEY = "chitrader.load-tracker.driver-days.v1";

type PersistedDays = {
  version: 1;
  days: DayStore;
};

function cleanOot(names: unknown): string[] | undefined {
  if (!Array.isArray(names)) return undefined;
  return names.filter((n): n is string => typeof n === "string");
}

function clean(store: DayStore): DayStore {
  const out: DayStore = {};
  for (const [date, day] of Object.entries(store)) {
    if (!isDriverTallyDay(date)) continue;
    if (!day || typeof day.available !== "number") continue;
    const ootNames = cleanOot(day.ootNames);
    out[date] = ootNames ? { ...day, ootNames } : { ...day };
    if (!ootNames) delete out[date].ootNames;
  }
  return out;
}

export function readDayStore(): DayStore {
  try {
    const raw = localStorage.getItem(DAYS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedDays;
    if (parsed?.version !== 1 || typeof parsed.days !== "object" || !parsed.days) {
      return {};
    }
    return clean(parsed.days);
  } catch {
    return {};
  }
}

export function writeDayStore(store: DayStore): void {
  const payload: PersistedDays = { version: 1, days: clean(store) };
  localStorage.setItem(DAYS_KEY, JSON.stringify(payload));
}

export function asLockedDay(row: {
  date: string;
  base: number;
  offs: number;
  available: number;
  locked: boolean;
  locked_at: string;
  oot_names?: string[] | null;
}): LockedDay {
  const ootNames = cleanOot(row.oot_names);
  return {
    date: row.date,
    base: row.base,
    offs: row.offs,
    available: row.available,
    locked: row.locked,
    lockedAt: row.locked_at,
    ...(ootNames ? { ootNames } : {}),
  };
}
