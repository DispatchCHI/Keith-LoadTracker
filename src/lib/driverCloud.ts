import { type DayStore, type LockedDay, isDriverTallyDay } from "./driverDays";
import { asLockedDay } from "./driverStore";
import { getSupabase } from "./supabase";

type RemoteRow = {
  date: string;
  base: number;
  offs: number;
  available: number;
  locked: boolean;
  locked_at: string;
  oot_names?: string[] | null;
};

export async function fetchRemoteDays(): Promise<DayStore | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("driver_availability")
    .select("date, base, offs, available, locked, locked_at, oot_names");
  if (error || !data) {
    // Older DBs without oot_names: fall back so headcount sync still works.
    const fallback = await supabase
      .from("driver_availability")
      .select("date, base, offs, available, locked, locked_at");
    if (fallback.error || !fallback.data) return null;
    const store: DayStore = {};
    for (const row of fallback.data as RemoteRow[]) {
      if (!isDriverTallyDay(row.date)) continue;
      store[row.date] = asLockedDay(row);
    }
    return store;
  }
  const store: DayStore = {};
  for (const row of data as RemoteRow[]) {
    if (!isDriverTallyDay(row.date)) continue;
    store[row.date] = asLockedDay(row);
  }
  return store;
}

function toRow(day: LockedDay) {
  return {
    date: day.date,
    base: day.base,
    offs: day.offs,
    available: day.available,
    locked: day.locked,
    locked_at: day.lockedAt,
    oot_names: Array.isArray(day.ootNames) ? day.ootNames : [],
  };
}

export async function pushDayStore(store: DayStore): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const rows = Object.values(store)
    .filter((day) => isDriverTallyDay(day.date))
    .map(toRow);
  if (rows.length === 0) return;

  const dates = rows.map((r) => r.date);
  const { data: existing } = await supabase
    .from("driver_availability")
    .select("date, locked")
    .in("date", dates);
  const byDate = new Map(
    (existing ?? []).map((r) => [r.date as string, Boolean(r.locked)]),
  );

  const inserts = rows.filter((r) => !byDate.has(r.date));
  const updates = rows.filter((r) => byDate.has(r.date) && byDate.get(r.date) === false);

  if (inserts.length) {
    await supabase.from("driver_availability").insert(inserts);
  }
  for (const row of updates) {
    await supabase.from("driver_availability").update(row).eq("date", row.date);
  }
}
