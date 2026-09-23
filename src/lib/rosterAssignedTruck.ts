import type { DriverRosterEntry, DriverRosterStore } from "./driverRoster";
import { cleanAssignedTruck, cleanTruckNumber } from "./driverRoster";

function personKey(row: DriverRosterEntry): string {
  const emp = cleanTruckNumber(row.truckNumber);
  const name = row.name.trim().toLowerCase();
  return `${row.kind}:${row.yard}:${emp || name}`;
}

function previousAssignedTruck(
  previous: DriverRosterStore,
  id: string,
  row: DriverRosterEntry,
): string | null {
  const byId = cleanAssignedTruck(previous.entries[id]?.assignedTruck ?? null);
  if (byId) return byId;
  const key = personKey(row);
  if (!key.endsWith(":")) {
    for (const prior of Object.values(previous.entries)) {
      if (prior.kind !== "full") continue;
      if (personKey(prior) !== key) continue;
      const kept = cleanAssignedTruck(prior.assignedTruck);
      if (kept) return kept;
    }
  }
  return null;
}

/**
 * Assigned unit numbers live on the Full Roster card until a dispatcher
 * edits that field. Refresh / sheet seed / a cloud row with a missing
 * assigned_truck column must not blank a number that is already saved.
 */
export function preserveAssignedTrucks(
  previous: DriverRosterStore,
  incoming: DriverRosterStore,
): DriverRosterStore {
  const entries: Record<string, DriverRosterEntry> = { ...incoming.entries };
  for (const [id, row] of Object.entries(entries)) {
    if (row.kind !== "full") continue;
    if (cleanAssignedTruck(row.assignedTruck)) continue;
    const kept = previousAssignedTruck(previous, id, row);
    if (!kept) continue;
    entries[id] = { ...row, assignedTruck: kept };
  }
  return { entries };
}

export function preserveTruckNumbers(
  previous: DriverRosterStore,
  incoming: DriverRosterStore,
): DriverRosterStore {
  const entries: Record<string, DriverRosterEntry> = { ...incoming.entries };
  for (const [id, row] of Object.entries(entries)) {
    if (cleanTruckNumber(row.truckNumber)) continue;
    const kept = cleanTruckNumber(previous.entries[id]?.truckNumber ?? null);
    if (!kept) continue;
    entries[id] = { ...row, truckNumber: kept };
  }
  return { entries };
}

export function assignedTrucksNeedingUpload(
  store: DriverRosterStore,
  remote: DriverRosterStore,
): DriverRosterEntry[] {
  const out: DriverRosterEntry[] = [];
  for (const row of Object.values(store.entries)) {
    if (row.kind !== "full") continue;
    const localTruck = cleanAssignedTruck(row.assignedTruck);
    if (!localTruck) continue;
    const remoteTruck = cleanAssignedTruck(remote.entries[row.id]?.assignedTruck ?? null);
    if (localTruck !== remoteTruck) out.push(row);
  }
  return out;
}
