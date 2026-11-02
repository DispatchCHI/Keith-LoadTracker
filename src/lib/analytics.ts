import type { Load } from "../types";
import type { RankRow } from "./totals";
import { addDays, startOfYear, weekStartingSunday, yearOfISO } from "./chicagoDate";

export type DailyCount = {
  date: string;
  count: number;
};

export function loadsYearToDate(loads: Load[], today: string): Load[] {
  const start = startOfYear(today);
  return loads.filter((load) => load.date >= start && load.date <= today);
}

export function dailyCounts(loads: Load[], dates: string[]): DailyCount[] {
  const map = new Map<string, number>();
  for (const load of loads) {
    map.set(load.date, (map.get(load.date) ?? 0) + 1);
  }
  return dates.map((date) => ({ date, count: map.get(date) ?? 0 }));
}

export function peakDailyCount(days: DailyCount[]): number {
  return days.reduce((max, day) => Math.max(max, day.count), 0);
}

export function chicagoYearLabel(today: string): string {
  return String(yearOfISO(today));
}

/** Same weekday one year earlier. 52 weeks keeps Sunday on Sunday. */
export const SAME_WEEK_LAST_YEAR_DAYS = 364;

export function sumDailyCounts(counts: DailyCount[]): number {
  return counts.reduce((sum, day) => sum + day.count, 0);
}

export function formatSignedCount(n: number): string {
  if (n > 0) return `+${n.toLocaleString("en-US")}`;
  return n.toLocaleString("en-US");
}

/** Percent change versus a baseline. Null when the baseline is zero. */
export function formatPercentChange(current: number, baseline: number): string | null {
  if (baseline === 0) return null;
  const rounded = Math.round(((current - baseline) / baseline) * 1000) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${rounded > 0 ? "+" : ""}${text}%`;
}

export type PieSlice = {
  key: string;
  label: string;
  count: number;
  pct: number;
  color: string;
};

const PIE_COLORS = [
  "#d8282c",
  "#3d8fd4",
  "#5cbf8a",
  "#e0b07a",
  "#7edce8",
  "#c47ad0",
  "#e8a54b",
  "#9a9588",
];

const MAX_NAMED_SLICES = 6;

function integerPercents(counts: number[]): number[] {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total === 0) return counts.map(() => 0);
  const raw = counts.map((n) => (n / total) * 100);
  const floors = raw.map((n) => Math.floor(n));
  let leftover = 100 - floors.reduce((sum, n) => sum + n, 0);
  const order = raw
    .map((n, i) => ({ i, frac: n - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < leftover; k++) {
    out[order[k % order.length].i] += 1;
  }
  return out;
}

/** Named pickup slices for a YTD pie. Zero-count rows are dropped. */
export function pickupPieSlices(rows: RankRow[]): PieSlice[] {
  const live = rows.filter((row) => row.count > 0);
  if (live.length === 0) return [];

  let grouped = live;
  if (live.length > MAX_NAMED_SLICES + 1) {
    const head = live.slice(0, MAX_NAMED_SLICES);
    const tail = live.slice(MAX_NAMED_SLICES);
    const otherCount = tail.reduce((sum, row) => sum + row.count, 0);
    const otherTrash = tail.reduce((sum, row) => sum + row.trashCount, 0);
    grouped = [
      ...head,
      { key: "other", label: "Other", count: otherCount, trashCount: otherTrash },
    ];
  }

  const percents = integerPercents(grouped.map((row) => row.count));
  return grouped.map((row, i) => ({
    key: row.key,
    label: row.label,
    count: row.count,
    pct: percents[i],
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));
}

/** Fewest weeks the Analytics list shows, even when the year is young. */
export const MIN_WEEKS_SHOWN = 6;

/**
 * Sunday-start weeks for the Analytics list, newest first. Runs from the
 * current week back to the earliest week that holds a load dated in the
 * current year (never before the week that contains Jan 1), and always at
 * least `minWeeks` rows. Weeks in between with no loads stay in the list as 0.
 */
export function analyticsWeeks(
  loadDates: Iterable<string>,
  today: string,
  minWeeks = MIN_WEEKS_SHOWN,
): string[][] {
  const yearStart = startOfYear(today);
  const currentStart = weekStartingSunday(today)[0];
  const firstWeekStart = weekStartingSunday(yearStart)[0];
  let earliest = "";
  for (const date of loadDates) {
    if (date < yearStart || date > today) continue;
    if (earliest === "" || date < earliest) earliest = date;
  }
  let startSunday = earliest === "" ? currentStart : weekStartingSunday(earliest)[0];
  if (startSunday < firstWeekStart) startSunday = firstWeekStart;
  const weeks: string[][] = [];
  for (let sunday = currentStart; sunday >= startSunday; sunday = addDays(sunday, -7)) {
    weeks.push(weekStartingSunday(sunday));
  }
  for (let i = weeks.length; i < minWeeks; i++) {
    weeks.push(weekStartingSunday(addDays(currentStart, -7 * i)));
  }
  return weeks;
}

export type WeekComparison = {
  total: number;
  prior: number;
  lastYear: number;
};

/**
 * Loads for a week against the prior week and the same week last year.
 * The current week only counts the days that have happened. Works for every
 * week, including the first of the year: the prior week then reaches into
 * December and last year reaches 364 days back.
 */
export function weekComparison(
  countOn: (iso: string) => number,
  week: string[],
  today: string,
): WeekComparison {
  const days = week.filter((day) => day <= today);
  const sum = (offset: number) =>
    days.reduce((total, day) => total + countOn(offset === 0 ? day : addDays(day, -offset)), 0);
  return { total: sum(0), prior: sum(7), lastYear: sum(SAME_WEEK_LAST_YEAR_DAYS) };
}