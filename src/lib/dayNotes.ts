/**
 * Per-day dispatcher notes on Today (Notes under + Log load).
 * Local persist + Supabase, last-write-wins by updatedAt.
 *
 * Read/unread is a fingerprint of the note text (`readHash` / `read_hash`).
 * It syncs on the same day_notes row when that column exists, and is always
 * cached in the local day-notes blob. A read does not bump updatedAt, so
 * acknowledging notes cannot clobber a newer note from another desk.
 */

import { isValidISODate } from "./chicagoDate";
import { fetchAllPaged, pagedErrorMessage } from "./cloud";
import { getSupabase } from "./supabase";

export const DAY_NOTES_STORE_KEY = "chitrader.load-tracker.day-notes.v1";
export const DAY_NOTES_TABLE = "day_notes";

export type DayNote = {
  date: string;
  note: string;
  updatedAt: string;
  /** Fingerprint of `note` last opened in the Notes popup. Null means unread or cleared. */
  readHash: string | null;
};

export type DayNotesStore = Record<string, DayNote>;

export type DayNotesPersisted = {
  version: 1;
  byDate: DayNotesStore;
  seenRemoteDates?: string[];
};

export type DayNoteRow = {
  date: string;
  note: string;
  updated_at: string;
  read_hash?: string | null;
};

export type NotesButtonAffordance = "default" | "unread" | "read";

export type DayNoteReadPush = {
  date: string;
  readHash: string | null;
};

/** Non-empty after trim. Whitespace-only notes are treated as cleared. */
export function dayNoteHasText(note: string): boolean {
  return note.trim().length > 0;
}

/** Cheap stable fingerprint. One pass; not a cryptographic hash. */
export function dayNoteFingerprint(note: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < note.length; i++) {
    hash ^= note.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseReadHash(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const hash = raw.trim().toLowerCase();
  return /^[0-9a-f]{8}$/.test(hash) ? hash : null;
}

export function notesButtonAffordance(
  note: string,
  readHash: string | null | undefined,
): NotesButtonAffordance {
  if (!dayNoteHasText(note)) return "default";
  return readHash === dayNoteFingerprint(note) ? "read" : "unread";
}

export function notesButtonClassName(state: NotesButtonAffordance): string {
  const base = "log-load-top notes-top day-notes-btn";
  if (state === "unread") return `${base} day-notes-unread`;
  if (state === "read") return `${base} day-notes-read`;
  return base;
}

export function notesButtonAriaLabel(state: NotesButtonAffordance): string | undefined {
  if (state === "unread") return "Notes, unread";
  if (state === "read") return "Notes, read";
  return undefined;
}

/**
 * Same text keeps a matching ack. Any different saved text, or an empty note,
 * drops the ack so the button pulses until the popup is opened again.
 */
export function readHashAfterSave(
  prevNote: string,
  nextNote: string,
  prevHash: string | null | undefined,
): string | null {
  if (!dayNoteHasText(nextNote)) return null;
  const nextFp = dayNoteFingerprint(nextNote);
  if (!dayNoteHasText(prevNote) || dayNoteFingerprint(prevNote) !== nextFp) return null;
  return prevHash === nextFp ? nextFp : null;
}

/** Keep an ack only when some desk's hash matches the winning note text. */
export function mergedReadHash(
  note: string,
  localHash?: string | null,
  remoteHash?: string | null,
): string | null {
  if (!dayNoteHasText(note)) return null;
  const fp = dayNoteFingerprint(note);
  if (localHash === fp || remoteHash === fp) return fp;
  return null;
}

function parseNote(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

export function normalizeDayNote(raw: unknown): DayNote | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    date?: unknown;
    note?: unknown;
    updatedAt?: unknown;
    updated_at?: unknown;
    readHash?: unknown;
    read_hash?: unknown;
  };
  const date = typeof row.date === "string" ? row.date : "";
  if (!isValidISODate(date)) return null;
  const updatedAt =
    (typeof row.updatedAt === "string" && row.updatedAt) ||
    (typeof row.updated_at === "string" && row.updated_at) ||
    new Date(0).toISOString();
  const readHash = parseReadHash(
    "readHash" in row ? row.readHash : "read_hash" in row ? row.read_hash : null,
  );
  return { date, note: parseNote(row.note), updatedAt, readHash };
}

export function dayNoteFromRow(row: DayNoteRow): DayNote {
  return {
    date: row.date,
    note: parseNote(row.note),
    updatedAt: row.updated_at,
    readHash: parseReadHash(row.read_hash),
  };
}

export function dayNoteToRow(row: DayNote, userId: string | null): DayNoteRow & {
  updated_by: string | null;
} {
  return {
    date: row.date,
    note: row.note,
    updated_at: row.updatedAt,
    updated_by: userId,
    read_hash: row.readHash ?? null,
  };
}

export function noteOn(store: DayNotesStore, date: string): string {
  return store[date]?.note ?? "";
}

export function upsertDayNote(
  store: DayNotesStore,
  date: string,
  note: string,
  updatedAt = new Date().toISOString(),
): DayNotesStore {
  if (!isValidISODate(date)) return store;
  return {
    ...store,
    [date]: {
      date,
      note,
      updatedAt,
      readHash: store[date]?.readHash ?? null,
    },
  };
}

export function applySavedDayNote(
  store: DayNotesStore,
  date: string,
  note: string,
  updatedAt = new Date().toISOString(),
): DayNotesStore {
  if (!isValidISODate(date)) return store;
  const prev = store[date];
  const next = upsertDayNote(store, date, note, updatedAt);
  const row = next[date];
  if (!row) return next;
  const readHash = readHashAfterSave(prev?.note ?? "", note, prev?.readHash ?? null);
  if (row.readHash === readHash) return next;
  return { ...next, [date]: { ...row, readHash } };
}

/** Record that this day's current note text was opened. Does not bump updatedAt. */
export function acknowledgeDayNote(store: DayNotesStore, date: string): DayNotesStore {
  const row = store[date];
  if (!row) return store;
  if (!dayNoteHasText(row.note)) {
    if (!row.readHash) return store;
    return { ...store, [date]: { ...row, readHash: null } };
  }
  const readHash = dayNoteFingerprint(row.note);
  if (row.readHash === readHash) return store;
  return { ...store, [date]: { ...row, readHash } };
}

export function cleanDayNotesStore(store: DayNotesStore): DayNotesStore {
  const next: DayNotesStore = {};
  for (const value of Object.values(store)) {
    const row = normalizeDayNote(value);
    if (row) next[row.date] = row;
  }
  return next;
}

function storeFromRows(rows: DayNoteRow[]): DayNotesStore {
  const next: DayNotesStore = {};
  for (const row of rows) {
    const parsed = normalizeDayNote(dayNoteFromRow(row));
    if (parsed) next[parsed.date] = parsed;
  }
  return next;
}

function parseSeenDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((d): d is string => typeof d === "string" && isValidISODate(d));
}

export function readDayNotesPersisted(): DayNotesPersisted {
  try {
    const raw = localStorage.getItem(DAY_NOTES_STORE_KEY);
    if (!raw) return { version: 1, byDate: {}, seenRemoteDates: [] };
    const parsed = JSON.parse(raw) as DayNotesPersisted;
    return {
      version: 1,
      byDate: cleanDayNotesStore(parsed.byDate ?? {}),
      seenRemoteDates: parseSeenDates(parsed.seenRemoteDates),
    };
  } catch {
    return { version: 1, byDate: {}, seenRemoteDates: [] };
  }
}

export function writeDayNotesPersisted(payload: DayNotesPersisted): void {
  const next: DayNotesPersisted = {
    version: 1,
    byDate: cleanDayNotesStore(payload.byDate),
    seenRemoteDates: parseSeenDates(payload.seenRemoteDates),
  };
  localStorage.setItem(DAY_NOTES_STORE_KEY, JSON.stringify(next));
}

function describeDayNotesCloudError(error: unknown): string {
  const message = pagedErrorMessage(error) ?? "";
  if (/day_notes/i.test(message)) {
    return "Day notes table isn't set up in Supabase yet.";
  }
  return message || "Could not reach the cloud.";
}

export function isMissingDayNoteReadHashColumn(error: unknown): boolean {
  const message = pagedErrorMessage(error) ?? "";
  return /read_hash/i.test(message);
}

export async function fetchDayNotesFromCloud(): Promise<{
  store: DayNotesStore | null;
  error: string | null;
  readHashSupported: boolean;
}> {
  const supabase = getSupabase();
  if (!supabase) return { store: null, error: null, readHashSupported: false };

  const pull = (columns: string) =>
    fetchAllPaged<DayNoteRow>(async (from, to) => {
      const page = await supabase
        .from(DAY_NOTES_TABLE)
        .select(columns)
        .order("date", { ascending: true })
        .range(from, to);
      return { data: page.data as DayNoteRow[] | null, error: page.error };
    });

  let readHashSupported = true;
  let { data, error } = await pull("date, note, updated_at, read_hash");
  if (error && isMissingDayNoteReadHashColumn(error)) {
    readHashSupported = false;
    ({ data, error } = await pull("date, note, updated_at"));
  }
  if (error || !data) {
    const message = describeDayNotesCloudError(error);
    console.warn("day_notes pull failed", pagedErrorMessage(error) ?? message);
    return { store: null, error: message, readHashSupported };
  }
  return { store: storeFromRows(data as DayNoteRow[]), error: null, readHashSupported };
}

export type DayNoteWriteResult = {
  error: string | null;
  readHashSupported: boolean;
};

export async function upsertDayNoteRows(
  rows: DayNote[],
  userId: string | null,
  opts?: { includeReadHash?: boolean },
): Promise<DayNoteWriteResult> {
  if (!rows.length) return { error: null, readHashSupported: opts?.includeReadHash !== false };
  const supabase = getSupabase();
  if (!supabase) return { error: null, readHashSupported: false };

  const write = async (includeReadHash: boolean) => {
    const payload = rows.map((row) => {
      const mapped = dayNoteToRow(row, userId);
      if (includeReadHash) return mapped;
      const { read_hash: _drop, ...rest } = mapped;
      return rest;
    });
    return supabase.from(DAY_NOTES_TABLE).upsert(payload);
  };

  let includeReadHash = opts?.includeReadHash !== false;
  let { error } = await write(includeReadHash);
  if (error && includeReadHash && isMissingDayNoteReadHashColumn(error)) {
    includeReadHash = false;
    ({ error } = await write(false));
  }
  if (error) {
    const message = describeDayNotesCloudError(error);
    console.warn("day_notes upsert failed", error.message ?? message);
    return { error: message, readHashSupported: includeReadHash };
  }
  return { error: null, readHashSupported: includeReadHash };
}

/** Update only the read receipt so note text and updated_at stay put. */
export async function pushDayNoteReadHash(
  date: string,
  readHash: string | null,
): Promise<"ok" | "missing-column" | "skipped" | "error"> {
  if (!isValidISODate(date)) return "skipped";
  const supabase = getSupabase();
  if (!supabase) return "skipped";
  const { error } = await supabase
    .from(DAY_NOTES_TABLE)
    .update({ read_hash: readHash })
    .eq("date", date);
  if (!error) return "ok";
  if (isMissingDayNoteReadHashColumn(error)) return "missing-column";
  console.warn("day_notes read_hash update failed", error.message ?? error);
  return "error";
}

export function reconcileDayNotesCloud(opts: {
  local: DayNotesStore;
  remote: DayNotesStore;
  seenRemoteDates?: Iterable<string>;
}): {
  next: DayNotesStore;
  toUpload: DayNote[];
  seenRemoteDates: string[];
  /** Read receipts to push without rewriting note text. Omitted when the row is already in toUpload. */
  readHashPushes: DayNoteReadPush[];
} {
  const seen = new Set(parseSeenDates([...(opts.seenRemoteDates ?? [])]));
  for (const date of Object.keys(opts.remote)) seen.add(date);

  const next: DayNotesStore = {};
  const toUpload: DayNote[] = [];
  const readHashPushes: DayNoteReadPush[] = [];
  const dates = new Set([...Object.keys(opts.local), ...Object.keys(opts.remote)]);

  for (const date of dates) {
    const local = opts.local[date];
    const remote = opts.remote[date];
    let winner: DayNote | null = null;
    let upload = false;
    if (remote && !local) {
      winner = remote;
    } else if (local && !remote) {
      if (seen.has(date)) continue;
      winner = local;
      upload = true;
    } else if (local && remote) {
      if (local.updatedAt > remote.updatedAt) {
        winner = local;
        upload = true;
      } else {
        winner = remote;
      }
    }
    if (!winner) continue;
    const merged: DayNote = {
      ...winner,
      readHash: mergedReadHash(winner.note, local?.readHash, remote?.readHash),
    };
    next[date] = merged;
    if (upload) {
      toUpload.push(merged);
    } else if (remote && (remote.readHash ?? null) !== merged.readHash) {
      readHashPushes.push({ date, readHash: merged.readHash });
    }
  }

  return { next, toUpload, seenRemoteDates: [...seen].sort(), readHashPushes };
}
