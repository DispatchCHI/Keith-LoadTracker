import type { DriverRosterEntry } from "./driverRoster";

/** Keith's Saturday sign-up Google Form sheet (public). Change the ID here only. */
export const SAT_SIGNUP_SHEET_ID = "1y65zE3zcw4d3Yqz_Hcz7h1ZIGNX3VDTZJB9SKoCMjbo";
export const SAT_SIGNUP_EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SAT_SIGNUP_SHEET_ID}/export?format=csv`;
/** Fallback if the export endpoint is blocked (CORS / redirect). */
export const SAT_SIGNUP_GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SAT_SIGNUP_SHEET_ID}/gviz/tq?tqx=out:csv`;
export const SAT_SIGNUP_REFRESH_MS = 3 * 60 * 1000;

export type SatSignup = {
  /** Saturday as YYYY-MM-DD (Chicago). */
  date: string;
  /** Driver number with leading zeros stripped ("" when blank). */
  number: string;
  /** Name as typed, trimmed. */
  name: string;
};

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

/** M/D/YYYY (optionally with a time) -> YYYY-MM-DD, or null. */
export function signupDateToISO(raw: string): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function stripZeros(raw: string | null | undefined): string {
  const digits = (raw ?? "").trim();
  if (!/^\d+$/.test(digits)) return digits.toLowerCase();
  return digits.replace(/^0+/, "");
}

function headerIndex(header: string[], label: string): number {
  return header.findIndex((cell) => cell.trim().toLowerCase() === label);
}

/** Parse the form-response CSV. Unreadable rows are skipped, never thrown. */
export function parseSatSignups(csv: string): SatSignup[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) return [];
  const header = rows[0]!;
  let iDate = headerIndex(header, "date");
  let iNum = headerIndex(header, "driver number");
  let iName = headerIndex(header, "driver name");
  if (iDate < 0) iDate = 1;
  if (iNum < 0) iNum = 2;
  if (iName < 0) iName = 3;
  const out: SatSignup[] = [];
  for (const row of rows.slice(1)) {
    const date = signupDateToISO(row[iDate] ?? "");
    if (!date) continue;
    const name = (row[iName] ?? "").replace(/\s+/g, " ").trim();
    const number = stripZeros(row[iNum] ?? "");
    if (!name && !number) continue;
    out.push({ date, number, name });
  }
  return out;
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !SUFFIXES.has(t));
}

/** Loose: a first or last name token overlaps (case / spacing / order insensitive). */
export function looseNameMatch(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = new Set(nameTokens(b));
  return ta.some((t) => tb.has(t));
}

/** Strict-ish: same words regardless of case, spacing or order. */
function sameNameWords(a: string, b: string): boolean {
  const ta = nameTokens(a).sort().join(" ");
  const tb = nameTokens(b).sort().join(" ");
  return ta !== "" && ta === tb;
}

/**
 * Does this roster entry belong to this sign-up?
 * - Entry has a driver number: number must match (leading zeros ignored) AND
 *   the name must loosely match (first or last name token overlaps).
 * - Entry has no number: fall back to the same name (case/space insensitive).
 */
export function signupMatchesEntry(signup: SatSignup, entry: Pick<DriverRosterEntry, "truckNumber" | "name">): boolean {
  const entryNumber = stripZeros(entry.truckNumber);
  if (entryNumber) {
    if (!signup.number || signup.number !== entryNumber) return false;
    return !signup.name || looseNameMatch(signup.name, entry.name);
  }
  return Boolean(signup.name) && sameNameWords(signup.name, entry.name);
}

export type SatSignupMatch = {
  /** Roster entry ids (from `shown`) to highlight green. */
  signedUpIds: Set<string>;
  /** Sign-ups for the Saturday that match no roster driver at all. */
  unmatched: SatSignup[];
};

/**
 * Display-only. `shown` = the entries on screen; `everyone` = every roster
 * entry (all yards, Sat + Full) used to decide what counts as unmatched.
 */
export function matchSatSignups(
  signups: readonly SatSignup[],
  saturday: string,
  shown: readonly DriverRosterEntry[],
  everyone: readonly DriverRosterEntry[],
): SatSignupMatch {
  const mine = signups.filter((s) => s.date === saturday);
  const signedUpIds = new Set<string>();
  for (const entry of shown) {
    if (mine.some((s) => signupMatchesEntry(s, entry))) signedUpIds.add(entry.id);
  }
  const unmatched: SatSignup[] = [];
  const seen = new Set<string>();
  for (const s of mine) {
    if (everyone.some((entry) => signupMatchesEntry(s, entry))) continue;
    const key = `${s.number}|${s.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unmatched.push(s);
  }
  return { signedUpIds, unmatched };
}

/** Fetch + parse the sheet; tries export first, then gviz. Throws only if both fail. */
export async function fetchSatSignups(fetchImpl: typeof fetch = fetch): Promise<SatSignup[]> {
  let lastError: unknown = null;
  for (const url of [SAT_SIGNUP_EXPORT_URL, SAT_SIGNUP_GVIZ_URL]) {
    try {
      const res = await fetchImpl(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error("not CSV");
      return parseSatSignups(text);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("sign-up sheet unavailable");
}