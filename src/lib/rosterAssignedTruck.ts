import { isIsoAfter } from "./isoTime";
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
    // A newer blank on this same card is only a dispatcher clear when the
    // blank came from cloud (see mergeAssignedTruckFields). Local status /
    // hire / reorder bumps must not paste-null over a saved unit — that is
    // handled by preferring remote/local non-null in merge, not here.
    if (blankIsAuthoritative && priorSame && isIsoAfter(row.updatedAt, priorSame.updatedAt)) return null;
    return byId;
  }
  // This card already exists and its truck is blank. That blank is the value
  // for this id — do not borrow a unit from a duplicate row when cloud said so.
  if (blankIsAuthoritative && priorSame) return null;

  const key = personKey(row);
  if (!key.endsWith(":")) {
    for (const prior of Object.values(previous.entries)) {
      if (prior.kind !== "full") continue;
      if (personKey(prior) !== key) continue;
      const kept = cleanAssignedTruck(prior.assignedTruck);
      if (!kept) continue;
      if (blankIsAuthoritative && isIsoAfter(row.updatedAt, prior.updatedAt)) continue;
      return kept;
    }
  }
  return null;
}

/**
 * Field-level merge for Full Roster units.
 *
 * A whole-row timestamp winner can be a status / hire / reorder edit that
 * never touched the truck field. Those blanks must not clobber a unit that
 * already lives on the other side (local or cloud). Only an authoritative
 * newer cloud blank (dispatcher clear that landed in Supabase) may wipe.
 */
export function mergeAssignedTruckFields(
  local: DriverRosterStore,
  remote: DriverRosterStore,
  reconciled: DriverRosterStore,
  opts?: { blankIsAuthoritative?: boolean },
): DriverRosterStore {
  const blankIsAuthoritative = opts?.blankIsAuthoritative === true;
  const entries: Record<string, DriverRosterEntry> = { ...reconciled.entries };
  for (const [id, row] of Object.entries(entries)) {
    if (row.kind !== "full") continue;
    if (cleanAssignedTruck(row.assignedTruck)) continue;

    const localRow = local.entries[id];
    const remoteRow = remote.entries[id];
    const localTruck = cleanAssignedTruck(localRow?.assignedTruck ?? null);
    const remoteTruck = cleanAssignedTruck(remoteRow?.assignedTruck ?? null);

    // Other desk cleared in cloud: remote blank is newer than our saved unit.
    if (
      blankIsAuthoritative &&
      remoteRow &&
      !remoteTruck &&
      localTruck &&
      isIsoAfter(remoteRow.updatedAt, localRow?.updatedAt ?? "")
    ) {
      continue;
    }

    // Prefer any known unit. Local-only blank (status bump, missing column,
    // never-synced desk) must not erase cloud or the other copy.
    const kept = remoteTruck ?? localTruck;
    if (!kept) continue;
    entries[id] = { ...row, assignedTruck: kept };
  }
  return { entries };
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
 * Non-null local units heal blank cloud rows (unless cloud clear is newer).
 * Local blanks are NOT queued here — only `setDriverAssignedTruck(null)` or
 * duplicate-resolution clears write JSON null. A status/hire bump must not
 * wipe a unit that another desk already saved.
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
    if (!localTruck) continue;
    if (!remoteTruck && remoteRow && isIsoAfter(remoteRow.updatedAt, row.updatedAt)) continue;
    out.push(row);
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
      if (isIsoAfter(a.updatedAt, b.updatedAt)) return -1;
      if (isIsoAfter(b.updatedAt, a.updatedAt)) return 1;
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
}): { store: DriverRosterStore; toUpload: DriverRosterEntry[]; clearIds: string[] } {
  const merged = mergeAssignedTruckFields(input.local, input.remote, input.reconciled, {
    blankIsAuthoritative: input.assignedTruckKnown,
  });
  const preserved = preserveAssignedTrucks(input.local, merged, {
    // After field merge, a remaining blank is either a real cloud clear or
    // never had a unit. Do not resurrect from a stale same-id local blank
    // bump — person-key fallback still heals id changes when cloud omitted
    // the column (assignedTruckKnown=false).
    blankIsAuthoritative: input.assignedTruckKnown,
  });
  const resolved = resolveDuplicateAssignedTrucks(preserved, input.at);
  const toUpload: DriverRosterEntry[] = [];
  const clearIds: string[] = [];
  const seen = new Set<string>();
  const push = (row: DriverRosterEntry | undefined, asClear = false) => {
    if (!row || seen.has(row.id)) return;
    seen.add(row.id);
    toUpload.push(row);
    if (asClear || !cleanAssignedTruck(row.assignedTruck)) clearIds.push(row.id);
  };
  for (const row of assignedTrucksNeedingUpload(resolved.store, input.remote)) {
    push(resolved.store.entries[row.id] ?? row, false);
  }
  for (const row of resolved.cleared) {
    push(resolved.store.entries[row.id] ?? row, true);
  }
  return { store: resolved.store, toUpload, clearIds };
}
