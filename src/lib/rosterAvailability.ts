/**
 * Today’s available-driver base from in-app rosters — not Burnham!L13.
 *
 * Weekday:
 *   available = Full hired − status − Vacation VAC − full-day offs
 *               (Late/Early listed, not subtracted)
 *   base        = Full hired − status − VAC
 *   rosterTotal = Full hired
 *
 * Saturday (Chicago calendar):
 *   base / rosterTotal come from how many names remain on Sat Roster
 *   (all yards), then status / Vacation VAC / call-offs subtract the same
 *   way. Every Saturday’s trim is different — never fall back to Full ~131.
 *
 * Chicago = Burnham + Rockford + Pontiac + Arc + Zion.
 * Sync/import/VAC never delete roster rows.
 */

import {
  DRIVER_ROSTER_YARDS,
  entriesForRoster,
  rosterStatusRemovesFromAvailable,
  type DriverRosterEntry,
  type DriverRosterStore,
  type FullRosterTally,
} from "./driverRoster";
import {
  type CallOffRow,
  type ManualCallOff,
} from "./driverAvailability";
import { isChicagoSaturday } from "./chicagoDate";
import type { LiveSheet } from "./driverDays";
import {
  effectiveRosterStatus,
  rosterNamesMatch,
  vacationNamesOnDate,
} from "./rosterVacation";
import type { VacationStore } from "./vacationBoard";

export function chicagoFullRosterTally(
  roster: DriverRosterStore,
  vacation: VacationStore,
  date: string,
): FullRosterTally {
  let hired = 0;
  let unavailable = 0;
  for (const yard of DRIVER_ROSTER_YARDS) {
    const names = vacationNamesOnDate(vacation, date, yard);
    for (const entry of entriesForRoster(roster, "full", yard)) {
      hired += 1;
      const effective = effectiveRosterStatus(entry, names);
      if (
        rosterStatusRemovesFromAvailable(effective.status) ||
        effective.onVacation
      ) {
        unavailable += 1;
      }
    }
  }
  return {
    hired,
    unavailable,
    available: Math.max(0, hired - unavailable),
  };
}

/** Sat Roster headcount across all yards (trimmed working Saturday list). */
export function chicagoSatRosterTally(
  roster: DriverRosterStore,
  vacation: VacationStore,
  date: string,
): FullRosterTally {
  let hired = 0;
  let unavailable = 0;
  for (const yard of DRIVER_ROSTER_YARDS) {
    const names = vacationNamesOnDate(vacation, date, yard);
    // Status marks live on Full rows; match Sat names to the same-yard Full entry.
    const fullByName = new Map(
      entriesForRoster(roster, "full", yard).map((entry) => [
        entry.name.trim().toLowerCase(),
        entry,
      ]),
    );
    for (const entry of entriesForRoster(roster, "sat", yard)) {
      hired += 1;
      const full = fullByName.get(entry.name.trim().toLowerCase());
      const statusSource = full ?? entry;
      const effective = effectiveRosterStatus(statusSource, names);
      if (
        rosterStatusRemovesFromAvailable(effective.status) ||
        effective.onVacation
      ) {
        unavailable += 1;
      }
    }
  }
  return {
    hired,
    unavailable,
    available: Math.max(0, hired - unavailable),
  };
}

export function rosterUnavailableEntries(
  roster: DriverRosterStore,
  vacation: VacationStore,
  date: string,
  opts?: { kind?: "full" | "sat" },
): DriverRosterEntry[] {
  const kind = opts?.kind ?? "full";
  const out: DriverRosterEntry[] = [];
  for (const yard of DRIVER_ROSTER_YARDS) {
    const names = vacationNamesOnDate(vacation, date, yard);
    if (kind === "sat") {
      const fullByName = new Map(
        entriesForRoster(roster, "full", yard).map((entry) => [
          entry.name.trim().toLowerCase(),
          entry,
        ]),
      );
      for (const entry of entriesForRoster(roster, "sat", yard)) {
        const full = fullByName.get(entry.name.trim().toLowerCase());
        const statusSource = full ?? entry;
        const effective = effectiveRosterStatus(statusSource, names);
        if (rosterStatusRemovesFromAvailable(effective.status) || effective.onVacation) {
          out.push(entry);
        }
      }
      continue;
    }
    for (const entry of entriesForRoster(roster, "full", yard)) {
      const effective = effectiveRosterStatus(entry, names);
      if (rosterStatusRemovesFromAvailable(effective.status) || effective.onVacation) {
        out.push(entry);
      }
    }
  }
  return out;
}

export function rosterOotNames(roster: DriverRosterStore): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const yard of DRIVER_ROSTER_YARDS) {
    for (const entry of entriesForRoster(roster, "full", yard)) {
      if ((entry.status ?? "").toLowerCase() !== "oot") continue;
      const key = entry.name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(entry.name);
    }
  }
  return names.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

export function nameMatchesUnavailable(
  name: string,
  unavailable: readonly Pick<DriverRosterEntry, "name">[],
): boolean {
  return unavailable.some((entry) => rosterNamesMatch(entry.name, name));
}

/** Drop call-off rows already counted as roster status / Vacation VAC. */
export function dropOffsAlreadyUnavailable(
  offs: readonly CallOffRow[],
  unavailable: readonly Pick<DriverRosterEntry, "name">[],
): CallOffRow[] {
  return offs.filter((row) => !nameMatchesUnavailable(row.name, unavailable));
}

export function dropManualsAlreadyUnavailable(
  manuals: readonly ManualCallOff[] | undefined,
  unavailable: readonly Pick<DriverRosterEntry, "name">[],
): ManualCallOff[] | undefined {
  if (!manuals?.length) return manuals ? [...manuals] : undefined;
  return manuals.filter((row) => {
    if (row.kind === "late-early") return true;
    return !nameMatchesUnavailable(row.name, unavailable);
  });
}

export function liveSheetFromRoster(input: {
  roster: DriverRosterStore;
  vacation: VacationStore;
  date: string;
  offs: readonly CallOffRow[];
  manuals?: readonly ManualCallOff[];
  saturdayUsesWeekdayBase: boolean;
}): LiveSheet {
  const saturday = isChicagoSaturday(input.date);
  const tally = saturday
    ? chicagoSatRosterTally(input.roster, input.vacation, input.date)
    : chicagoFullRosterTally(input.roster, input.vacation, input.date);
  const unavailable = rosterUnavailableEntries(input.roster, input.vacation, input.date, {
    kind: saturday ? "sat" : "full",
  });
  return {
    // Working headcount after status / OOT / VAC. Available math subtracts leftover offs from this.
    // Saturday: Sat Roster remaining names (all yards). Weekday: Full Roster.
    // Never fall back to Full hired when Sat is empty — callers must show an empty/seed state.
    base: tally.available,
    saturdayBase: tally.available,
    // Display “out of”: Sat hired on Saturday, Full hired on weekdays.
    rosterTotal: tally.hired,
    // Saturday must use the Saturday worklist path (usesSaturdayWorklist), not
    // saturday-weekday / Full Roster rules — even if a caller still passes true.
    saturdayUsesWeekdayBase: saturday ? false : input.saturdayUsesWeekdayBase,
    offs: dropOffsAlreadyUnavailable(input.offs, unavailable),
    ootNames: rosterOotNames(input.roster),
    manualOffs: dropManualsAlreadyUnavailable(input.manuals, unavailable),
  };
}
