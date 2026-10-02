import { safeSetItem } from "./localStorageSafe";

/** Desk checklist while matching transfer-station loads to a spreadsheet. Local only. */
export const LOAD_CHECKOFF_KEY = "chitrader.load-tracker.load-checkoff.v1";

function parseIds(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0));
  } catch {
    return new Set();
  }
}

export function readCheckedLoadIds(): Set<string> {
  try {
    return parseIds(localStorage.getItem(LOAD_CHECKOFF_KEY));
  } catch {
    return new Set();
  }
}

export function isLoadChecked(id: string): boolean {
  return readCheckedLoadIds().has(id);
}

/** Toggle one load. Returns the ids that are checked after the click. */
export function toggleCheckedLoad(id: string): Set<string> {
  const next = readCheckedLoadIds();
  if (next.has(id)) next.delete(id);
  else next.add(id);
  safeSetItem(LOAD_CHECKOFF_KEY, JSON.stringify([...next]));
  return next;
}
