/** Log Load → Truck step: offer to assign a unit that no driver has yet.
 *
 * Only plain unit numbers prompt; broker / sub codes (letters, per
 * isBrokerTruck) never do. Driver search covers the Full Roster (name and
 * EMP #). Being on the Gone list never hides a Full Roster driver (rehires).
 */

import type { DriverGoneEntry } from "./driverGone";
import {
  cleanDriverName,
  fullRosterDriversForTruck,
  type DriverRosterEntry,
  type DriverRosterStore,
} from "./driverRoster";
import { isBrokerTruck } from "./truck";

/** Trucks (in entry order) that are company units with no Full Roster driver. */
export function trucksNeedingDriver(
  store: DriverRosterStore,
  trucks: readonly string[],
): string[] {
  return trucks.filter(
    (truck) =>
      Boolean(truck) &&
      !isBrokerTruck(truck) &&
      fullRosterDriversForTruck(store, truck).length === 0,
  );
}

function rank(entry: DriverRosterEntry, q: string, words: string[]): number {
  const name = cleanDriverName(entry.name).toLowerCase();
  const emp = (entry.truckNumber ?? "").toLowerCase();
  if (emp && emp === q) return 0;
  if (name.startsWith(q)) return 1;
  const parts = name.split(/\s+/);
  const allWordsPrefix = words.every((w) => parts.some((p) => p.startsWith(w)));
  if (allWordsPrefix) return 2;
  if (emp && emp.startsWith(q)) return 3;
  if (name.includes(q)) return 4;
  return -1;
}

/** Type-ahead over Full Roster drivers by name or EMP #. Gone is ignored. */
export function searchAssignableDrivers(
  store: DriverRosterStore,
  _goneEntries: readonly DriverGoneEntry[],
  query: string,
  limit = 8,
): DriverRosterEntry[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return [];
  const words = q.split(" ");
  const full = Object.values(store.entries).filter((entry) => entry.kind === "full");
  const scored: { entry: DriverRosterEntry; score: number }[] = [];
  for (const entry of full) {
    if (!cleanDriverName(entry.name)) continue;
    const score = rank(entry, q, words);
    if (score >= 0) scored.push({ entry, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.entry.name.localeCompare(b.entry.name, "en", { sensitivity: "base" }),
  );
  return scored.slice(0, limit).map((row) => row.entry);
}
