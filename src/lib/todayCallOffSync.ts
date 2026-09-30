import { isChicagoSunday, isValidISODate } from "./chicagoDate";
import type { CallOffLogEntry } from "./callOffLog";
import {
  callOffKindFromReason,
  callOffNameKey,
  reasonForKind,
  type ManualCallOff,
} from "./driverAvailability";
import {
  addManualOff,
  deletedManualKey,
  removeManualOff,
  type ManualOffsStore,
} from "./manualCallOffs";

/**
 * Today’s Available drivers “Call offs” add writes `manual_call_offs` only.
 * The Call Offs page reads `call_off_log` only. A Today add therefore never
 * showed up there unless that driver was already on the log for the day.
 *
 * Mirror id is `today-manual|{chicago date}|{name key}` — the same Chicago
 * calendar date the Today card saved, with no UTC shift.
 */
export const TODAY_MANUAL_MIRROR_PREFIX = "today-manual|";

export function manualMirrorId(date: string, name: string): string {
  return `${TODAY_MANUAL_MIRROR_PREFIX}${date}|${callOffNameKey(name)}`;
}

export function parseManualMirrorId(
  id: string,
): { date: string; nameKey: string } | null {
  if (!id.startsWith(TODAY_MANUAL_MIRROR_PREFIX)) return null;
  const rest = id.slice(TODAY_MANUAL_MIRROR_PREFIX.length);
  const split = rest.indexOf("|");
  if (split <= 0) return null;
  const date = rest.slice(0, split);
  const nameKey = rest.slice(split + 1);
  if (!isValidISODate(date) || !nameKey) return null;
  return { date, nameKey };
}

export function isManualMirrorId(id: string): boolean {
  return parseManualMirrorId(id) !== null;
}

export function logRowCoversNameOnDay(
  row: Pick<CallOffLogEntry, "name" | "start" | "end">,
  date: string,
  name: string,
): boolean {
  if (!isValidISODate(date)) return false;
  if (callOffNameKey(row.name) !== callOffNameKey(name)) return false;
  const last = row.end ?? row.start;
  return row.start <= date && last >= date;
}

/** Log rows a Today remove should delete: the mirror, plus any other single-day row that date. */
export function logIdsRemovedWithManual(
  rows: readonly Pick<CallOffLogEntry, "id" | "name" | "start" | "end">[],
  date: string,
  name: string,
): string[] {
  const key = callOffNameKey(name);
  if (!key) return [];
  const mirror = manualMirrorId(date, name);
  const ids: string[] = [];
  for (const row of rows) {
    if (row.id === mirror) {
      ids.push(row.id);
      continue;
    }
    if (callOffNameKey(row.name) !== key) continue;
    if (row.start !== date) continue;
    if (row.end && row.end !== date) continue;
    ids.push(row.id);
  }
  return ids;
}

export function canRemoveTodayCallOff(input: {
  name: string;
  date: string;
  manuals: readonly ManualCallOff[] | undefined;
  rows: readonly Pick<CallOffLogEntry, "id" | "name" | "start" | "end">[];
}): boolean {
  const key = callOffNameKey(input.name);
  if (!key || !isValidISODate(input.date)) return false;
  const covering = input.rows.filter((row) =>
    logRowCoversNameOnDay(row, input.date, input.name),
  );
  const multiDay = covering.some((row) => row.end && row.end !== row.start);
  if (multiDay) return false;
  const manual = (input.manuals ?? []).some((row) => callOffNameKey(row.name) === key);
  return manual || covering.length > 0;
}

export function mirrorEntryFromManual(
  date: string,
  off: ManualCallOff,
  now: string,
  existing?: Pick<CallOffLogEntry, "createdAt"> | null,
): CallOffLogEntry | null {
  const name = off.name.trim();
  if (!name || !isValidISODate(date)) return null;
  return {
    id: manualMirrorId(date, name),
    name,
    start: date,
    end: null,
    reason: reasonForKind(off.kind),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export type TodayCallOffSyncResult = {
  manuals: ManualOffsStore;
  changed: boolean;
  manualDeletedKeys: string[];
  remoteUpserts: { date: string; off: ManualCallOff }[];
  logUpserts: { date: string; off: ManualCallOff }[];
};

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((key) => set.has(key));
}

/**
 * Keep Today manuals and the call-off log aligned for one Chicago day.
 *
 * - A manual with no covering log row is inserted into the log (kind preserved:
 *   Vacation stays "Vacation Day", never rewritten to Call Off).
 * - A log row that already covers that name and day is enough — no second row.
 * - Deleting the mirror on Call Offs tombstones the id; the manual is dropped
 *   so Today does not keep showing it.
 * - If a mirror row’s start/reason changes, the manual follows that edit.
 */
export function reconcileTodayCallOffs(input: {
  manuals: ManualOffsStore;
  rows: readonly CallOffLogEntry[];
  deletedIds: readonly string[];
  manualDeletedKeys?: readonly string[];
}): TodayCallOffSyncResult {
  const deletedMirrors = new Set(input.deletedIds);
  const present = new Set(input.rows.map((row) => row.id));
  let manuals = input.manuals;
  let changed = false;
  const tombstones: string[] = [];
  const remoteUpserts: { date: string; off: ManualCallOff }[] = [];

  for (const [date, list] of Object.entries(input.manuals)) {
    for (const off of list) {
      const id = manualMirrorId(date, off.name);
      if (!deletedMirrors.has(id) || present.has(id)) continue;
      const dropped = removeManualOff(manuals, date, off.name);
      if (!dropped.removed) continue;
      manuals = dropped.store;
      changed = true;
      tombstones.push(deletedManualKey(date, dropped.removed.name));
    }
  }

  for (const row of input.rows) {
    const parsed = parseManualMirrorId(row.id);
    if (!parsed) continue;
    const targetDate = isValidISODate(row.start) ? row.start : parsed.date;
    const kind = callOffKindFromReason(row.reason);
    const source =
      (manuals[parsed.date] ?? []).find(
        (off) => callOffNameKey(off.name) === parsed.nameKey,
      ) ??
      (manuals[targetDate] ?? []).find(
        (off) => callOffNameKey(off.name) === callOffNameKey(row.name),
      );
    // Don't invent a manual for a mirror this device never stored.
    if (!source) continue;

    if (parsed.date !== targetDate) {
      const removed = removeManualOff(manuals, parsed.date, source?.name ?? row.name);
      if (removed.removed) {
        manuals = removed.store;
        changed = true;
        tombstones.push(deletedManualKey(parsed.date, removed.removed.name));
      }
    }

    const current = (manuals[targetDate] ?? []).find(
      (off) => callOffNameKey(off.name) === callOffNameKey(row.name) ||
        callOffNameKey(off.name) === parsed.nameKey,
    );
    if (current && current.kind === kind && current.name === row.name.trim()) continue;
    if (current) {
      const removed = removeManualOff(manuals, targetDate, current.name);
      if (removed.removed) {
        manuals = removed.store;
        changed = true;
      }
    }
    const added = addManualOff(manuals, targetDate, row.name, kind, new Set());
    if (!added.added) continue;
    manuals = added.store;
    changed = true;
    remoteUpserts.push({ date: targetDate, off: added.added });
  }

  const logUpserts: { date: string; off: ManualCallOff }[] = [];
  for (const [date, list] of Object.entries(manuals)) {
    if (isChicagoSunday(date)) continue;
    for (const off of list) {
      const id = manualMirrorId(date, off.name);
      if (deletedMirrors.has(id) && !present.has(id)) continue;
      if (input.rows.some((row) => logRowCoversNameOnDay(row, date, off.name))) continue;
      logUpserts.push({ date, off });
    }
  }

  const deletedKeys = new Set(input.manualDeletedKeys ?? []);
  for (const key of tombstones) deletedKeys.add(key);
  for (const [date, list] of Object.entries(manuals)) {
    for (const off of list) deletedKeys.delete(deletedManualKey(date, off.name));
  }
  const manualDeletedKeys = [...deletedKeys].sort();
  const deletedChanged = !sameKeys(manualDeletedKeys, input.manualDeletedKeys ?? []);

  return {
    manuals: changed ? manuals : input.manuals,
    changed: changed || deletedChanged,
    manualDeletedKeys,
    remoteUpserts,
    logUpserts,
  };
}
