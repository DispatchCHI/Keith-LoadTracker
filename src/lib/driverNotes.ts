/**
 * Dated notes per hired driver (Drivers tab notebook icon).
 *
 * Identity: a note belongs to a driver when its `rosterId` is that roster
 * entry's id, or when both carry the same EMP #. The name is a display
 * snapshot only, so renames never orphan notes. Removing a driver from the
 * roster leaves their notes in the table.
 *
 * Sync: local cache + Supabase `driver_notes`, last-write-wins per note id
 * by updatedAt. Deletes are explicit UI tombstones.
 */

import { formatMonthDayYear, isValidISODate } from "./chicagoDate";
import { fetchAllPaged, pagedErrorMessage } from "./cloud";
import { isIsoAfter } from "./isoTime";
import { safeSetItem } from "./localStorageSafe";
import { cleanTruckNumber, driverRosterSeedId } from "./driverRoster";
import { getSupabase } from "./supabase";

export const DRIVER_NOTES_STORE_KEY = "chitrader.load-tracker.driver-notes.v1";
export const DRIVER_NOTES_TABLE = "driver_notes";
export const DRIVER_NOTE_MAX_LENGTH = 4000;

export type DriverNote = {
  id: string;
  rosterId: string | null;
  employeeNumber: string | null;
  driverName: string;
  noteDate: string;
  note: string;
  author: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DriverNotesStore = Record<string, DriverNote>;

export type DriverNotesPersisted = {
  version: 1;
  entries: DriverNotesStore;
  deletedIds: string[];
  seenRemoteIds: string[];
};

/** Who a note is for. Matches DriverRosterEntry (truckNumber = EMP #). */
export type DriverNoteTarget = {
  id: string;
  truckNumber: string | null;
  name: string;
};

export type DriverNoteRow = {
  id: string;
  roster_id: string | null;
  employee_number: string | null;
  driver_name: string | null;
  note_date: string;
  note: string;
  author: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanUuid(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return UUID_RE.test(value) ? value : null;
}

function cleanText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value ? value : null;
}

export function newDriverNoteId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return driverRosterSeedId(`note-local-${Date.now()}-${Math.random()}`);
}

/** Trim edges and cap length. Inner line breaks are kept. */
export function cleanDriverNoteText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\r\n/g, "\n").trim().slice(0, DRIVER_NOTE_MAX_LENGTH);
}

export function cleanDriverNote(raw: unknown): DriverNote | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const id = cleanUuid(rec.id);
  if (!id) return null;
  const note = cleanDriverNoteText(rec.note);
  if (!note) return null;
  const noteDate = typeof rec.noteDate === "string" ? rec.noteDate.slice(0, 10) : "";
  if (!isValidISODate(noteDate)) return null;
  const rosterId = cleanUuid(rec.rosterId);
  const employeeNumber = cleanTruckNumber(rec.employeeNumber);
  if (!rosterId && !employeeNumber) return null;
  const createdAt =
    typeof rec.createdAt === "string" && rec.createdAt ? rec.createdAt : new Date(0).toISOString();
  const updatedAt =
    typeof rec.updatedAt === "string" && rec.updatedAt ? rec.updatedAt : createdAt;
  return {
    id,
    rosterId,
    employeeNumber,
    driverName: typeof rec.driverName === "string" ? rec.driverName.trim() : "",
    noteDate,
    note,
    author: cleanText(rec.author),
    createdBy: cleanUuid(rec.createdBy),
    createdAt,
    updatedAt,
  };
}

export function driverNoteFromRow(row: DriverNoteRow): DriverNote | null {
  return cleanDriverNote({
    id: row.id,
    rosterId: row.roster_id,
    employeeNumber: row.employee_number,
    driverName: row.driver_name,
    noteDate: row.note_date,
    note: row.note,
    author: row.author,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function driverNoteToRow(note: DriverNote, userId: string | null) {
  return {
    id: note.id,
    roster_id: note.rosterId,
    employee_number: note.employeeNumber,
    driver_name: note.driverName,
    note_date: note.noteDate,
    note: note.note,
    author: note.author,
    created_by: note.createdBy,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    updated_by: userId,
  };
}

export function storeFromDriverNoteRows(rows: DriverNoteRow[]): DriverNotesStore {
  const store: DriverNotesStore = {};
  for (const row of rows) {
    const note = driverNoteFromRow(row);
    if (note) store[note.id] = note;
  }
  return store;
}

function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

export function emptyDriverNotesPersisted(): DriverNotesPersisted {
  return { version: 1, entries: {}, deletedIds: [], seenRemoteIds: [] };
}

export function cleanDriverNotesStore(raw: unknown): DriverNotesStore {
  const store: DriverNotesStore = {};
  if (!raw || typeof raw !== "object") return store;
  for (const value of Object.values(raw as Record<string, unknown>)) {
    const note = cleanDriverNote(value);
    if (note) store[note.id] = note;
  }
  return store;
}

export function readDriverNotesPersisted(): DriverNotesPersisted {
  try {
    const raw = localStorage.getItem(DRIVER_NOTES_STORE_KEY);
    if (!raw) return emptyDriverNotesPersisted();
    const parsed = JSON.parse(raw) as Partial<DriverNotesPersisted>;
    return {
      version: 1,
      entries: cleanDriverNotesStore(parsed.entries),
      deletedIds: parseIdList(parsed.deletedIds),
      seenRemoteIds: parseIdList(parsed.seenRemoteIds),
    };
  } catch {
    return emptyDriverNotesPersisted();
  }
}

export function writeDriverNotesPersisted(next: DriverNotesPersisted): void {
  const payload: DriverNotesPersisted = {
    version: 1,
    entries: cleanDriverNotesStore(next.entries),
    deletedIds: parseIdList(next.deletedIds),
    seenRemoteIds: parseIdList(next.seenRemoteIds),
  };
  safeSetItem(DRIVER_NOTES_STORE_KEY, JSON.stringify(payload));
}

/** Same person: same roster row, or same EMP # on both sides. */
export function noteMatchesDriver(note: DriverNote, driver: DriverNoteTarget): boolean {
  if (note.rosterId && note.rosterId === driver.id.toLowerCase()) return true;
  const emp = cleanTruckNumber(driver.truckNumber);
  return Boolean(emp && note.employeeNumber && note.employeeNumber === emp);
}

/** Newest note date first; same day, newest written first. */
export function compareDriverNotesNewestFirst(a: DriverNote, b: DriverNote): number {
  if (a.noteDate !== b.noteDate) return a.noteDate < b.noteDate ? 1 : -1;
  if (isIsoAfter(a.createdAt, b.createdAt)) return -1;
  if (isIsoAfter(b.createdAt, a.createdAt)) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function notesForDriver(store: DriverNotesStore, driver: DriverNoteTarget): DriverNote[] {
  return Object.values(store)
    .filter((note) => noteMatchesDriver(note, driver))
    .sort(compareDriverNotesNewestFirst);
}

/** Count per roster entry id, for the small badge on each card. */
export function driverNoteCounts(
  store: DriverNotesStore,
  drivers: readonly DriverNoteTarget[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const byRosterId = new Map<string, string>();
  const byEmp = new Map<string, string>();
  for (const driver of drivers) {
    byRosterId.set(driver.id.toLowerCase(), driver.id);
    const emp = cleanTruckNumber(driver.truckNumber);
    if (emp && !byEmp.has(emp)) byEmp.set(emp, driver.id);
  }
  for (const note of Object.values(store)) {
    const hits = new Set<string>();
    if (note.rosterId) {
      const id = byRosterId.get(note.rosterId);
      if (id) hits.add(id);
    }
    if (note.employeeNumber) {
      for (const driver of drivers) {
        if (cleanTruckNumber(driver.truckNumber) === note.employeeNumber) hits.add(driver.id);
      }
    }
    for (const id of hits) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function searchHaystack(note: DriverNote): string {
  const [y, m, d] = note.noteDate.split("-");
  const slash = `${Number(m)}/${Number(d)}/${y}`;
  return [
    note.note,
    note.noteDate,
    slash,
    `${Number(m)}/${Number(d)}`,
    formatMonthDayYear(note.noteDate),
    note.author ?? "",
  ]
    .join(" \n ")
    .toLowerCase();
}

/** Every whitespace-separated term must appear in the text, date, or author. */
export function filterDriverNotes(notes: readonly DriverNote[], query: string): DriverNote[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...notes];
  return notes.filter((note) => {
    const hay = searchHaystack(note);
    return terms.every((term) => hay.includes(term));
  });
}

export type NewDriverNoteInput = {
  driver: DriverNoteTarget;
  noteDate: string;
  note: string;
  author?: string | null;
  createdBy?: string | null;
  at?: string;
};

export function createDriverNote(input: NewDriverNoteInput): DriverNote | null {
  const at = input.at ?? new Date().toISOString();
  return cleanDriverNote({
    id: newDriverNoteId(),
    rosterId: input.driver.id,
    employeeNumber: input.driver.truckNumber,
    driverName: input.driver.name,
    noteDate: input.noteDate,
    note: input.note,
    author: input.author ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: at,
    updatedAt: at,
  });
}

export function editDriverNote(
  store: DriverNotesStore,
  id: string,
  patch: { noteDate?: string; note?: string },
  at = new Date().toISOString(),
): { store: DriverNotesStore; note: DriverNote | null } {
  const prev = store[id];
  if (!prev) return { store, note: null };
  const next = cleanDriverNote({
    ...prev,
    noteDate: patch.noteDate ?? prev.noteDate,
    note: patch.note ?? prev.note,
    updatedAt: at,
  });
  if (!next) return { store, note: null };
  return { store: { ...store, [id]: next }, note: next };
}

export type DriverNotesReconcileResult = {
  next: DriverNotesStore;
  toUpload: DriverNote[];
  toDeleteRemote: string[];
  deletedIds: string[];
  seenRemoteIds: string[];
};

/**
 * - Remote only: take it.
 * - Local only, never seen remotely: upload it (written offline / before the table existed).
 * - Local only, seen remotely before: another desk deleted it, drop it.
 * - Both: newer updatedAt wins; upload when local is newer.
 * - Tombstoned: drop, and delete remotely while the row still exists there.
 */
export function reconcileDriverNotesCloud(input: {
  local: DriverNotesStore;
  remote: DriverNotesStore;
  deletedIds: Iterable<string>;
  seenRemoteIds: Iterable<string>;
}): DriverNotesReconcileResult {
  const deleted = new Set(parseIdList([...input.deletedIds]));
  const seen = new Set(parseIdList([...input.seenRemoteIds]));
  const remoteIds = new Set(Object.keys(input.remote));
  const next: DriverNotesStore = {};
  const toUpload: DriverNote[] = [];

  for (const id of new Set([...Object.keys(input.local), ...remoteIds])) {
    if (deleted.has(id)) continue;
    const local = input.local[id];
    const remote = input.remote[id];
    if (remote && !local) {
      next[id] = remote;
    } else if (local && !remote) {
      if (seen.has(id)) continue;
      next[id] = local;
      toUpload.push(local);
    } else if (local && remote) {
      if (isIsoAfter(local.updatedAt, remote.updatedAt)) {
        next[id] = local;
        toUpload.push(local);
      } else {
        next[id] = remote;
      }
    }
  }

  const toDeleteRemote = [...deleted].filter((id) => remoteIds.has(id));
  const nextSeen = new Set<string>();
  for (const id of remoteIds) if (!deleted.has(id)) nextSeen.add(id);
  for (const note of toUpload) nextSeen.delete(note.id);

  return {
    next,
    toUpload,
    toDeleteRemote,
    // Keep a tombstone only while the remote row still exists.
    deletedIds: toDeleteRemote,
    seenRemoteIds: [...nextSeen],
  };
}

export function describeDriverNotesCloudError(error: unknown): string {
  const message = pagedErrorMessage(error) ?? "";
  if (/driver_notes/i.test(message) && /(does not exist|schema cache|not find)/i.test(message)) {
    return "Driver notes table isn't set up in Supabase yet. Run Load-Tracker-driver-notes.sql.";
  }
  return message || "Could not reach the cloud.";
}

const SELECT_COLUMNS =
  "id, roster_id, employee_number, driver_name, note_date, note, author, created_by, created_at, updated_at";

export async function fetchDriverNotesFromCloud(): Promise<{
  store: DriverNotesStore | null;
  error: string | null;
}> {
  const supabase = getSupabase();
  if (!supabase) return { store: null, error: null };
  const page = await fetchAllPaged<DriverNoteRow>(async (from, to) => {
    const result = await supabase
      .from(DRIVER_NOTES_TABLE)
      .select(SELECT_COLUMNS)
      .order("id", { ascending: true })
      .range(from, to);
    return { data: result.data as DriverNoteRow[] | null, error: result.error };
  });
  if (page.error || !page.data) {
    const message = describeDriverNotesCloudError(page.error);
    console.warn("driver_notes pull failed", pagedErrorMessage(page.error) ?? message);
    return { store: null, error: message };
  }
  return { store: storeFromDriverNoteRows(page.data), error: null };
}

export async function upsertDriverNoteRows(
  notes: DriverNote[],
  userId: string | null,
): Promise<string | null> {
  if (!notes.length) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { error } = await supabase
    .from(DRIVER_NOTES_TABLE)
    .upsert(notes.map((note) => driverNoteToRow(note, userId)));
  if (!error) return null;
  const message = describeDriverNotesCloudError(error);
  console.warn("driver_notes upsert failed", error.message ?? message);
  return message;
}

export async function deleteDriverNoteRows(ids: string[]): Promise<string | null> {
  if (!ids.length) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { error } = await supabase.from(DRIVER_NOTES_TABLE).delete().in("id", ids);
  if (!error) return null;
  const message = describeDriverNotesCloudError(error);
  console.warn("driver_notes delete failed", error.message ?? message);
  return message;
}
