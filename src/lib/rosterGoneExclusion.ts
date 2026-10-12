/** Keep people on the Gone list off the Full Roster.
 *
 * Once a driver is on Gone (terminated), every desk drops that person's Full
 * Roster row and deletes it from the cloud, so a stale desk, a seed, or a
 * sheet import can't bring him back. A real rehire is still allowed: a Full
 * row whose hire date is after the termination date, or (no dates to
 * compare) one that was added after the Gone entry was saved.
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

/** True when this Full row is the employment that ended (not a rehire). */
function isTerminatedEmployment(row: DriverRosterEntry, gone: DriverGoneEntry): boolean {
  if (row.hireDate && gone.terminationDate) return row.hireDate <= gone.terminationDate;
  const goneAt = gone.createdAt || gone.updatedAt;
  if (!goneAt || !row.createdAt) return true;
  return row.createdAt <= goneAt;
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
