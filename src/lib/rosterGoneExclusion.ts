/** Keep people on the Gone list off the Full Roster.
 *
 * Once a driver is on Gone (terminated), every desk drops a stale Full Roster
 * row for that person (one not touched since the Gone entry was saved). A row
 * a user adds, re-adds, or edits after that is a rehire and always stays; the
 * Add driver path also takes the person off Gone so the rehire is clean.
 *
 * Also limits automatic "fill in a missing field" uploads (hire date, phone,
 * assigned truck) to rows the cloud still has. A row this desk saw in the
 * cloud that is now missing was deleted by another desk; re-uploading it to
 * patch a field is how deleted drivers kept coming back.
 */

import { cleanDriverName, type DriverRosterEntry, type DriverRosterStore } from "./driverRoster";
import { cleanEmployeeNumber, type DriverGoneEntry } from "./driverGone";

function nameKey(name: string): string {
  return cleanDriverName(name).toLowerCase();
}

function samePerson(row: DriverRosterEntry, gone: DriverGoneEntry): boolean {
  const rowEmp = cleanEmployeeNumber(row.truckNumber);
  const goneEmp = cleanEmployeeNumber(gone.employeeNumber);
  if (rowEmp && goneEmp) return rowEmp === goneEmp;
  const a = nameKey(row.name);
  return a !== "" && a === nameKey(gone.name);
}

function latestMs(...values: (string | null | undefined)[]): number | null {
  let best: number | null = null;
  for (const value of values) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) continue;
    if (best === null || ms > best) best = ms;
  }
  return best;
}

/**
 * True only for a Full row nobody has touched since the person went on Gone
 * (a stale copy). A row added, re-added, or edited after the Gone entry was
 * saved is a rehire / deliberate change and is never pruned, whatever its
 * hire date says. Missing timestamps → keep the row.
 */
function isTerminatedEmployment(row: DriverRosterEntry, gone: DriverGoneEntry): boolean {
  const goneAt = latestMs(gone.createdAt, gone.updatedAt);
  const rowAt = latestMs(row.createdAt, row.updatedAt);
  if (goneAt === null || rowAt === null) return false;
  if (rowAt >= goneAt) return false;
  if (row.hireDate && gone.terminationDate && row.hireDate > gone.terminationDate) return false;
  return true;
}

/** Gone entries for the same person as this Full row (emp #, or name without emp). */
export function goneEntriesForPerson(
  row: Pick<DriverRosterEntry, "truckNumber" | "name">,
  goneEntries: readonly DriverGoneEntry[],
): DriverGoneEntry[] {
  return goneEntries.filter((gone) => samePerson(row as DriverRosterEntry, gone));
}

/** The Gone entry that rules this Full row out, if any. */
export function goneEntryForFullRow(
  row: DriverRosterEntry,
  goneEntries: readonly DriverGoneEntry[],
): DriverGoneEntry | null {
  if (row.kind !== "full") return null;
  for (const gone of goneEntries) {
    if (samePerson(row, gone) && isTerminatedEmployment(row, gone)) return gone;
  }
  return null;
}

/** Full Roster rows that belong to someone on the Gone list. */
export function fullRowsOnGone(
  store: DriverRosterStore,
  goneEntries: readonly DriverGoneEntry[],
): DriverRosterEntry[] {
  if (!goneEntries.length) return [];
  return Object.values(store.entries).filter((row) => goneEntryForFullRow(row, goneEntries));
}

/** Drop Full rows of people on the Gone list from a display list. */
export function withoutGoneFullRows<T extends DriverRosterEntry>(
  rows: readonly T[],
  goneEntries: readonly DriverGoneEntry[],
): T[] {
  if (!goneEntries.length) return [...rows];
  return rows.filter((row) => !goneEntryForFullRow(row, goneEntries));
}

/**
 * Keep only field-patch uploads for rows the cloud still has, plus rows this
 * desk is already allowed to create (`allowIds`: brand-new local rows).
 */
export function onlyRowsCloudStillHas(
  rows: readonly DriverRosterEntry[],
  remote: DriverRosterStore,
  allowIds: ReadonlySet<string>,
): DriverRosterEntry[] {
  return rows.filter((row) => Boolean(remote.entries[row.id]) || allowIds.has(row.id));
}
