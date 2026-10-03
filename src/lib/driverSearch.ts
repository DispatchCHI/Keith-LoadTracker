import { addDays, formatShortDate, isValidISODate, yearOfISO } from "./chicagoDate";
import type { CallOffLogEntry } from "./callOffLog";
import {
  callOffKindFromReason,
  reasonForKind,
  type CallOffKind,
} from "./driverAvailability";
import {
  DRIVER_ROSTER_YARDS,
  entriesForRoster,
  type DriverRosterEntry,
  type DriverRosterStore,
} from "./driverRoster";
import type { ManualOffsStore } from "./manualCallOffs";
import { rosterNamesMatch } from "./rosterVacation";
import type { Load } from "../types";
import { sundayOnOrBefore, vacationSpan, type VacationStore } from "./vacationBoard";

export type DriverTimeOffRow = {
  id: string;
  start: string;
  end: string;
  reason: string;
  kind: CallOffKind;
};

function spanOf(start: string, end: string | null): { start: string; end: string } {
  if (end && isValidISODate(end) && end !== start) {
    return start <= end ? { start, end } : { start: end, end: start };
  }
  return { start, end: start };
}

function overlapsYear(start: string, end: string, year: number): boolean {
  const startYear = yearOfISO(start);
  const endYear = yearOfISO(end);
  return startYear === year || endYear === year || (startYear < year && endYear > year);
}

function coversDate(start: string, end: string, day: string): boolean {
  return day >= start && day <= end;
}

export function formatTimeOffWhen(start: string, end: string): string {
  if (start === end) return formatShortDate(start);
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

export function inclusiveDayCount(start: string, end: string): number {
  const from = start <= end ? start : end;
  const to = start <= end ? end : start;
  let count = 0;
  let day = from;
  while (day <= to) {
    count += 1;
    day = addDays(day, 1);
    if (count > 370) break;
  }
  return count;
}

/** "This week" when the span is the Sunday–Saturday that contains today. */
export function formatTimeOffDays(start: string, end: string, today: string): string {
  const from = start <= end ? start : end;
  const to = start <= end ? end : start;
  if (isValidISODate(today) && from <= today && to >= today) {
    const week = sundayOnOrBefore(today);
    if (from === week && to === addDays(week, 6)) return "This week";
  }
  return String(inclusiveDayCount(from, to));
}

export function searchFullRosterDrivers(
  store: DriverRosterStore,
  query: string,
): DriverRosterEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: DriverRosterEntry[] = [];
  for (const yard of DRIVER_ROSTER_YARDS) {
    for (const entry of entriesForRoster(store, "full", yard)) {
      const name = entry.name.toLowerCase();
      const emp = (entry.truckNumber ?? "").toLowerCase();
      if (name.includes(needle) || (emp && emp.includes(needle))) hits.push(entry);
    }
  }
  return hits;
}

export function loadsForDriverName(loads: readonly Load[], name: string, limit = 8): Load[] {
  return loads
    .filter((load) => load.driverName && rosterNamesMatch(load.driverName, name))
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.createdAt.localeCompare(a.createdAt);
    })
    .slice(0, limit);
}

export function loadsMatchingDriverQuery(loads: readonly Load[], query: string, limit = 8): Load[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return loads
    .filter((load) => (load.driverName ?? "").toLowerCase().includes(needle))
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.createdAt.localeCompare(a.createdAt);
    })
    .slice(0, limit);
}

export function driverTimeOffRows(input: {
  name: string;
  year: number;
  logRows: readonly CallOffLogEntry[];
  manuals: ManualOffsStore;
  vacation: VacationStore;
}): DriverTimeOffRow[] {
  const name = input.name.trim();
  if (!name) return [];
  const rows: DriverTimeOffRow[] = [];

  for (const row of input.logRows) {
    if (!rosterNamesMatch(name, row.name)) continue;
    const span = spanOf(row.start, row.end);
    if (!overlapsYear(span.start, span.end, input.year)) continue;
    const reason = row.reason.trim() || "Call Off";
    rows.push({
      id: row.id,
      start: span.start,
      end: span.end,
      reason,
      kind: callOffKindFromReason(reason),
    });
  }

  const logCovers = (day: string, kind: CallOffKind) =>
    rows.some((row) => row.kind === kind && coversDate(row.start, row.end, day));

  for (const [date, list] of Object.entries(input.manuals)) {
    if (!isValidISODate(date) || yearOfISO(date) !== input.year) continue;
    for (const off of list) {
      if (!rosterNamesMatch(name, off.name)) continue;
      if (logCovers(date, off.kind)) continue;
      rows.push({
        id: `man:${date}:${off.kind}:${off.name}`,
        start: date,
        end: date,
        reason: reasonForKind(off.kind),
        kind: off.kind,
      });
    }
  }

  for (const entry of Object.values(input.vacation.entries)) {
    if (!rosterNamesMatch(name, entry.name)) continue;
    const span = vacationSpan(entry);
    if (!overlapsYear(span.start, span.end, input.year)) continue;
    const already = rows.some(
      (row) => row.kind === "vacation" && row.start === span.start && row.end === span.end,
    );
    if (already) continue;
    rows.push({
      id: `vac:${entry.id}`,
      start: span.start,
      end: span.end,
      reason: "Vacation",
      kind: "vacation",
    });
  }

  return rows.sort((a, b) => {
    if (a.start !== b.start) return b.start.localeCompare(a.start);
    if (a.end !== b.end) return b.end.localeCompare(a.end);
    return a.reason.localeCompare(b.reason);
  });
}
