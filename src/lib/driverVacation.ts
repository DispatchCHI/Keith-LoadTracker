/**
 * Driver vacation days left on Full Roster.
 *
 * There is no existing driver vacation bank in the app. Dispatch crew
 * (Tim / Keith / Mike) uses a different tenure curve and is left alone.
 * Entitlement here follows Keith's completed-year rule, using the same
 * anniversary math as the "yrs" tag (`yearsOfService`):
 *   under 1 year → 0 weeks
 *   1 year → 1 week
 *   3 years → 2 weeks
 *   9 years → 3 weeks
 *   15 years → 4 weeks
 * A week is 5 weekdays (Mon–Fri), the same length as the dispatch vacation
 * bank. A Vacation-board chip spends the weekdays it covers. A full week
 * chip is Sun–Sat, so it spends 5 days. A one-day chip spends 1. Paid-out
 * notes still spend those days. Call-off "Vacation Day" rows add any
 * weekday the board does not already cover.
 */

import { addDays, isValidISODate, weekdayOfISO, yearOfISO } from "./chicagoDate";
import { callOffKindFromReason } from "./driverAvailability";
import type { CallOffLogEntry } from "./callOffLog";
import type { ManualOffsStore } from "./manualCallOffs";
import { yearsOfService } from "./rosterHireDate";
import { nameBelongsToDriver } from "./rosterVacation";
import { vacationSpan, type VacationEntry } from "./vacationBoard";

export const DRIVER_VACATION_DAYS_PER_WEEK = 5;

export function vacationWeeksForCompletedYears(years: number): number {
  if (!Number.isFinite(years) || years < 1) return 0;
  if (years >= 15) return 4;
  if (years >= 9) return 3;
  if (years >= 3) return 2;
  return 1;
}

export type DriverVacationLeft = {
  /** False when the driver has no hire date. */
  known: boolean;
  years: number | null;
  weeks: number;
  grantedDays: number;
  usedDays: number;
  /** Null when the hire date is missing. */
  left: number | null;
};

function addWeekdays(start: string, end: string, year: number, into: Set<string>): void {
  if (!isValidISODate(start) || !isValidISODate(end)) return;
  const from = start <= end ? start : end;
  const to = start <= end ? end : start;
  let guard = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    guard += 1;
    if (guard > 400) break;
    if (yearOfISO(day) !== year) continue;
    const dow = weekdayOfISO(day);
    if (dow >= 1 && dow <= 5) into.add(day);
  }
}

function belongs(logged: string, driverName: string, resolveName?: (name: string) => string | null): boolean {
  return nameBelongsToDriver(logged, driverName, resolveName);
}

export function vacationDaysLeftForDriver(input: {
  name: string;
  hireDate: string | null | undefined;
  asOf: string;
  entries?: readonly Pick<VacationEntry, "name" | "weekOf" | "startOn" | "endOn" | "note">[];
  logRows?: readonly Pick<CallOffLogEntry, "name" | "start" | "end" | "reason">[];
  manuals?: ManualOffsStore;
  resolveName?: (name: string) => string | null;
}): DriverVacationLeft {
  const years = yearsOfService(input.hireDate, input.asOf);
  if (years == null || !isValidISODate(input.asOf)) {
    return { known: false, years: null, weeks: 0, grantedDays: 0, usedDays: 0, left: null };
  }
  const year = yearOfISO(input.asOf);
  const weeks = vacationWeeksForCompletedYears(years);
  const grantedDays = weeks * DRIVER_VACATION_DAYS_PER_WEEK;
  const days = new Set<string>();
  for (const entry of input.entries ?? []) {
    if (!belongs(entry.name, input.name, input.resolveName)) continue;
    const span = vacationSpan(entry);
    addWeekdays(span.start, span.end, year, days);
  }
  for (const row of input.logRows ?? []) {
    if (callOffKindFromReason(row.reason) !== "vacation") continue;
    if (!belongs(row.name, input.name, input.resolveName)) continue;
    const end = row.end && isValidISODate(row.end) ? row.end : row.start;
    addWeekdays(row.start, end, year, days);
  }
  for (const [date, list] of Object.entries(input.manuals ?? {})) {
    if (!isValidISODate(date) || yearOfISO(date) !== year) continue;
    for (const off of list) {
      if (off.kind !== "vacation") continue;
      if (!belongs(off.name, input.name, input.resolveName)) continue;
      addWeekdays(date, date, year, days);
    }
  }
  const usedDays = days.size;
  return {
    known: true,
    years,
    weeks,
    grantedDays,
    usedDays,
    left: Math.max(0, grantedDays - usedDays),
  };
}
