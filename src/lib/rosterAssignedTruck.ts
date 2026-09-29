import {
  assignedTruckKey,
  cleanAssignedTruck,
  cleanTruckNumber,
  type DriverRosterEntry,
  type DriverRosterStore,
} from "./driverRoster";

/** A clear has to look newer than the row it replaces, or the next pull puts the unit back. */
function stampAfter(stamp: string, previous: string): string {
  if (stamp > previous) return stamp;
  const parsed = Date.parse(previous);
  if (!Number.isFinite(parsed)) return stamp || previous;
  return new Date(parsed + 1).toISOString();
}

function personKey(row: DriverRosterEntry): string {
  const emp = cleanTruckNumber(row.truckNumber);
  const name = row.name.trim().toLowerCase();
  return `${row.kind}:${row.yard}:${emp || name}`;
}

function previousAssignedTruck(
  previous: DriverRosterStore,
  id: string,
  row: DriverRosterEntry,
  blankIsAuthoritative: boolean,
): string | null {
  const priorSame = previous.entries[id];
  const byId = cleanAssignedTruck(priorSame?.assignedTruck ?? null);
  if (byId) {
    // A newer blank on this same card is a dispatcher clear (or a clear that
    // already landed in cloud). Do not paste the old unit back on top.
    if (blankIsAuthoritative && priorSame && row.updatedAt > priorSame.updatedAt) return null;
    return byId;
  }
  // This card already exists and its truck is blank. That blank is the value
  // for this id — do not borrow a unit from a duplicate row.
  if (blankIsAuthoritative && priorSame) return null;

  const key = personKey(row);
  if (!key.endsWith(":")) {
    for (const prior of Object.values(previous.entries)) {
      if (prior.kind !== "full") continue;
      if (personKey(prior) !== key) continue;
      const kept = cleanAssignedTruck(prior.assignedTruck);
      if (!kept) continue;
      if (blankIsAuthoritative && row.updatedAt > prior.updatedAt) continue;
      return kept;
    }
  }
  return null;
}

/**
 * Assigned unit numbers live on the Full Roster card until a dispatcher
 * edits that field. A refresh / sheet seed / cloud row with a missing
 * `assigned_truck` column must not blank a number that is already saved.
 *
 * When the pull actually included `assigned_truck` (`blankIsAuthoritative`),
 * a newer blank is a real clear and must stick. An older or same-version
 * blank still keeps the saved unit.
 */
export function preserveAssignedTrucks(
  previous: DriverRosterStore,
  incoming: DriverRosterStore,
  opts?: { blankIsAuthoritative?: boolean },
): DriverRosterStore {
  const blankIsAuthoritative = opts?.blankIsAuthoritative === true;
  const entries: Record<string, DriverRosterEntry> = { ...incoming.entries };
  for (const [id, row] of Object.entries(entries)) {
    if (row.kind !== "full") continue;
    if (cleanAssignedTruck(row.assignedTruck)) continue;
    const kept = previousAssignedTruck(previous, id, row, blankIsAuthoritative);
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

/**
 * Rows whose unit differs from cloud and should be upserted.
 * A newer local blank is included so a clear is written as JSON null
 * (omitting the column would leave the old unit in place).
 * A stale local unit is not pushed over a newer cloud blank.
 */
export function assignedTrucksNeedingUpload(
  store: DriverRosterStore,
  remote: DriverRosterStore,
): DriverRosterEntry[] {
  const out: DriverRosterEntry[] = [];
  for (const row of Object.values(store.entries)) {
    if (row.kind !== "full") continue;
    const remoteRow = remote.entries[row.id];
    const localTruck = cleanAssignedTruck(row.assignedTruck);
    const remoteTruck = cleanAssignedTruck(remoteRow?.assignedTruck ?? null);
    if (localTruck === remoteTruck) continue;
    if (localTruck) {
      if (!remoteTruck && remoteRow && remoteRow.updatedAt > row.updatedAt) continue;
      out.push(row);
      continue;
    }
    if (remoteTruck && remoteRow && row.updatedAt > remoteRow.updatedAt) out.push(row);
  }
  return out;
}

/**
 * One unit number on one Full Roster driver. The newest assignment keeps
 * the truck; the others are cleared. Equal timestamps break ties by id so
 * every device resolves the same way. Numeric `0418` and `418` match.
 */
export function resolveDuplicateAssignedTrucks(
  store: DriverRosterStore,
  at?: string,
): { store: DriverRosterStore; cleared: DriverRosterEntry[] } {
  const groups = new Map<string, DriverRosterEntry[]>();
  for (const row of Object.values(store.entries)) {
    if (row.kind !== "full") continue;
    const key = assignedTruckKey(row.assignedTruck);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const entries: Record<string, DriverRosterEntry> = { ...store.entries };
  const cleared: DriverRosterEntry[] = [];
  const stamp = at ?? new Date().toISOString();

  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const ranked = [...list].sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    for (const row of ranked.slice(1)) {
      const next: DriverRosterEntry = {
        ...row,
        assignedTruck: null,
        updatedAt: stampAfter(stamp, row.updatedAt),
      };
      entries[row.id] = next;
      cleared.push(next);
    }
  }

  if (!cleared.length) return { store, cleared };
  return { store: { entries }, cleared };
}

/**
 * Cloud refresh for Full Roster units.
 * `assignedTruckKnown` is true when the pull selected `assigned_truck`, so a
 * database null is a real clear and not a missing column.
 */
export function syncAssignedTrucks(input: {
  local: DriverRosterStore;
  remote: DriverRosterStore;
  reconciled: DriverRosterStore;
  assignedTruckKnown: boolean;
  at?: string;
}): { store: DriverRosterStore; toUpload: DriverRosterEntry[] } {
  const preserved = preserveAssignedTrucks(input.local, input.reconciled, {
    blankIsAuthoritative: input.assignedTruckKnown,
  });
  const resolved = resolveDuplicateAssignedTrucks(preserved, input.at);
  const toUpload: DriverRosterEntry[] = [];
  const seen = new Set<string>();
  const push = (row: DriverRosterEntry | undefined) => {
    if (!row || seen.has(row.id)) return;
    seen.add(row.id);
    toUpload.push(row);
  };
  for (const row of assignedTrucksNeedingUpload(resolved.store, input.remote)) {
    push(resolved.store.entries[row.id] ?? row);
  }
  for (const row of resolved.cleared) push(resolved.store.entries[row.id] ?? row);
  return { store: resolved.store, toUpload };
}
