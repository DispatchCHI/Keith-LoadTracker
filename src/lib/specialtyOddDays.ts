/**
 * Odd-ball specialty cards the dispatcher added for one Chicago day.
 * Empty cards stay on that day until removed. They do not sit on the board
 * every day, and they do not copy onto the next day.
 */

import { isValidISODate } from "./chicagoDate";
import {
  SPECIALTY_CUSTOM_NAMES_EVENT,
  SPECIALTY_CUSTOM_NAMES_FLUSH_EVENT,
  customSpecialtyNumber,
  isCustomSpecialtyId,
  isCustomSpecialtyRenamed,
  nextCustomSpecialtyId,
  readCustomSpecialtyNames,
  touchCustomSpecialtyNamesClock,
  writeCustomSpecialtyName,
} from "./customSpecialty";

export const SPECIALTY_ODD_DAYS_EVENT = "klt-specialty-odd-days";
export const ODD_DAYS_FIELD = "__days";

const DAYS_KEY = "chitrader.load-tracker.specialty-odd-days.v1";

export type OddDayMap = Record<string, string[]>;

function dateKey(date: string): string {
  const trimmed = date.trim();
  if (isValidISODate(trimmed)) return trimmed;
  const prefix = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  return prefix ? prefix[1] : trimmed;
}

export function normalizeOddDayMap(raw: unknown): OddDayMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: OddDayMap = {};
  for (const [day, ids] of Object.entries(raw as Record<string, unknown>)) {
    const key = dateKey(day);
    if (!isValidISODate(key) || !Array.isArray(ids)) continue;
    const clean = [
      ...new Set(
        ids.filter((id): id is string => typeof id === "string" && isCustomSpecialtyId(id)),
      ),
    ].sort((a, b) => customSpecialtyNumber(a) - customSpecialtyNumber(b));
    if (clean.length) out[key] = clean;
  }
  return out;
}

export function readOddDays(): OddDayMap {
  try {
    const raw = localStorage.getItem(DAYS_KEY);
    if (!raw) return {};
    return normalizeOddDayMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeOddDays(map: OddDayMap): void {
  try {
    localStorage.setItem(DAYS_KEY, JSON.stringify(map));
  } catch {
    /* private mode */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SPECIALTY_ODD_DAYS_EVENT));
  }
}

export function replaceOddDays(raw: unknown): void {
  writeOddDays(normalizeOddDayMap(raw));
}

export function oddIdsOn(date: string): string[] {
  return readOddDays()[dateKey(date)] ?? [];
}

const emptyOddIds: readonly string[] = [];
let snapDate = "";
let snapRaw: string | null | undefined;
let snapIds: readonly string[] = emptyOddIds;

/** Cached read so React can subscribe without rendering on an unchanged list. */
export function oddIdsSnapshot(date: string): readonly string[] {
  const key = dateKey(date);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DAYS_KEY);
  } catch {
    raw = null;
  }
  if (snapRaw === raw && snapDate === key) return snapIds;
  snapRaw = raw;
  snapDate = key;
  const ids = oddIdsOn(key);
  snapIds = ids.length ? ids : emptyOddIds;
  return snapIds;
}

export function subscribeOddDays(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(SPECIALTY_ODD_DAYS_EVENT, onStoreChange);
  return () => window.removeEventListener(SPECIALTY_ODD_DAYS_EVENT, onStoreChange);
}

export function oddDaysHaveCards(map: OddDayMap = readOddDays()): boolean {
  return Object.values(map).some((ids) => ids.length > 0);
}

export function allOddIds(map: OddDayMap = readOddDays()): string[] {
  return [...new Set(Object.values(map).flat())];
}

export type SpecialtyGridSlot =
  | { kind: "add" }
  | { kind: "station"; id: string; name: string };

/** Named yards, with the add button immediately right of Liberty, then this day's odd-balls. */
export function specialtyGridSlots(
  named: readonly { id: string; name: string }[],
  odd: readonly { id: string; name: string }[],
): SpecialtyGridSlot[] {
  const libertyAt = named.findIndex((station) => station.id === "liberty-tank");
  const before = libertyAt < 0 ? [...named] : named.slice(0, libertyAt);
  const liberty = libertyAt < 0 ? null : named[libertyAt];
  const after = libertyAt < 0 ? [] : named.slice(libertyAt + 1);
  const slots: SpecialtyGridSlot[] = before.map((station) => ({
    kind: "station",
    id: station.id,
    name: station.name,
  }));
  if (liberty) slots.push({ kind: "station", id: liberty.id, name: liberty.name });
  slots.push({ kind: "add" });
  for (const station of odd) {
    slots.push({ kind: "station", id: station.id, name: station.name });
  }
  for (const station of after) {
    slots.push({ kind: "station", id: station.id, name: station.name });
  }
  return slots;
}

/** Cards pinned on this day, plus any odd-ball that already has opens on it. */
export function visibleOddCardIds(
  date: string,
  stationIds: readonly string[],
  pinned: readonly string[] = oddIdsOn(date),
): string[] {
  const ids = new Set(pinned);
  for (const stationId of stationIds) {
    if (isCustomSpecialtyId(stationId)) ids.add(stationId);
  }
  return [...ids].sort(
    (a, b) => customSpecialtyNumber(a) - customSpecialtyNumber(b) || a.localeCompare(b),
  );
}

/** Renamed odd-ball cards pinned on this day. A saved name does not show on other days. */
export function namedOddballIdsForDay(
  date: string,
  names: Record<string, string>,
  pinned: readonly string[] = oddIdsOn(date),
): string[] {
  const allowed = new Set(pinned);
  return Object.keys(names)
    .filter(
      (id) =>
        allowed.has(id) &&
        isCustomSpecialtyId(id) &&
        isCustomSpecialtyRenamed(id, names[id]),
    )
    .sort((a, b) => customSpecialtyNumber(a) - customSpecialtyNumber(b) || a.localeCompare(b));
}

let oddballSnapKey = "";
let oddballSnapIds: readonly string[] = [];

export function namedOddballIdsSnapshot(date: string): readonly string[] {
  const names = readCustomSpecialtyNames();
  const pinned = oddIdsSnapshot(date);
  const key = `${dateKey(date)}|${pinned.join(",")}|${Object.keys(names)
    .sort()
    .map((id) => `${id}=${names[id]}`)
    .join(",")}`;
  if (key === oddballSnapKey) return oddballSnapIds;
  oddballSnapKey = key;
  oddballSnapIds = namedOddballIdsForDay(date, names, pinned);
  return oddballSnapIds;
}

export function subscribeOddballPickups(onStoreChange: () => void): () => void {
  const offDays = subscribeOddDays(onStoreChange);
  if (typeof window === "undefined") return offDays;
  window.addEventListener(SPECIALTY_CUSTOM_NAMES_EVENT, onStoreChange);
  return () => {
    offDays();
    window.removeEventListener(SPECIALTY_CUSTOM_NAMES_EVENT, onStoreChange);
  };
}

export function addOddCard(date: string): string {
  const key = dateKey(date);
  const map = readOddDays();
  const id = nextCustomSpecialtyId(allOddIds(map));
  writeCustomSpecialtyName(id, "");
  const ids = map[key] ?? [];
  if (!ids.includes(id)) map[key] = [...ids, id];
  writeOddDays(map);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SPECIALTY_CUSTOM_NAMES_FLUSH_EVENT));
  }
  return id;
}

export function removeOddCard(date: string, id: string): void {
  const key = dateKey(date);
  const map = readOddDays();
  const next = (map[key] ?? []).filter((item) => item !== id);
  if (next.length) map[key] = next;
  else delete map[key];
  writeOddDays(map);
  touchCustomSpecialtyNamesClock();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SPECIALTY_CUSTOM_NAMES_FLUSH_EVENT));
  }
}
