/**
 * Per-day dispatcher notes on Today (Notes under + Log load).
 * Local persist + Supabase, last-write-wins by updatedAt.
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
};

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
  };
  const date = typeof row.date === "string" ? row.date : "";
  if (!isValidISODate(date)) return null;
  const updatedAt =
    (typeof row.updatedAt === "string" && row.updatedAt) ||
    (typeof row.updated_at === "string" && row.updated_at) ||
    new Date(0).toISOString();
  return { date, note: parseNote(row.note), updatedAt };
}

export function dayNoteFromRow(row: DayNoteRow): DayNote {
  return {
    date: row.date,
    note: parseNote(row.note),
    updatedAt: row.updated_at,
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
    [date]: { date, note, updatedAt },
  };
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

export async function fetchDayNotesFromCloud(): Promise<{
  store: DayNotesStore | null;
  error: string | null;
}> {
  const supabase = getSupabase();
  if (!supabase) return { store: null, error: null };
  const { data, error } = await fetchAllPaged<DayNoteRow>(async (from, to) => {
    const page = await supabase
      .from(DAY_NOTES_TABLE)
      .select("date, note, updated_at")
      .order("date", { ascending: true })
      .range(from, to);
    return { data: page.data as DayNoteRow[] | null, error: page.error };
  });
  if (error || !data) {
    const message = describeDayNotesCloudError(error);
    console.warn("day_notes pull failed", pagedErrorMessage(error) ?? message);
    return { store: null, error: message };
  }
  return { store: storeFromRows(data as DayNoteRow[]), error: null };
}

export async function upsertDayNoteRows(
  rows: DayNote[],
  userId: string | null,
): Promise<string | null> {
  if (!rows.length) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { error } = await supabase
    .from(DAY_NOTES_TABLE)
    .upsert(rows.map((row) => dayNoteToRow(row, userId)));
  if (error) {
    const message = describeDayNotesCloudError(error);
    console.warn("day_notes upsert failed", error.message ?? message);
    return message;
  }
  return null;
}

export function reconcileDayNotesCloud(opts: {
  local: DayNotesStore;
  remote: DayNotesStore;
  seenRemoteDates?: Iterable<string>;
}): {
  next: DayNotesStore;
  toUpload: DayNote[];
  seenRemoteDates: string[];
} {
  const seen = new Set(parseSeenDates([...(opts.seenRemoteDates ?? [])]));
  for (const date of Object.keys(opts.remote)) seen.add(date);

  const next: DayNotesStore = {};
  const toUpload: DayNote[] = [];
  const dates = new Set([...Object.keys(opts.local), ...Object.keys(opts.remote)]);

  for (const date of dates) {
    const local = opts.local[date];
    const remote = opts.remote[date];
    if (remote && !local) {
      next[date] = remote;
      continue;
    }
    if (local && !remote) {
      if (seen.has(date)) continue;
      next[date] = local;
      toUpload.push(local);
      continue;
    }
    if (local && remote) {
      if (local.updatedAt > remote.updatedAt) {
        next[date] = local;
        toUpload.push(local);
      } else {
        next[date] = remote;
      }
    }
  }

  return { next, toUpload, seenRemoteDates: [...seen].sort() };
}
