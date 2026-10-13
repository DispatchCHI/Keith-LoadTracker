import type { DriverRosterEntry, DriverRosterStore } from "./driverRoster";

/**
 * HARD RULE: the Gone list never deletes or hides a Full Roster driver.
 * Rehires sit on Gone (history) and the Full Roster at the same time. There is
 * deliberately no Gone-based roster filtering anywhere in the app.
 *
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
