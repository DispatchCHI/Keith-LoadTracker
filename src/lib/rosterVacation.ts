/**
 * Vacation tab → Full Roster auto-VAC (derived, not persisted).
 *
 * Today’s available tally uses `liveSheetFromRoster` (Full Roster − VAC −
 * leftover full-day offs). Per-yard join:
 *
 *   const names = vacationNamesOnDate(vacationStore, chicagoDate, rosterYard);
 *   const { hired, unavailable, available } = fullRosterTally(fullEntries, {
 *     treatAsUnavailable: (entry) => rosterEntryOnVacation(entry, names),
 *   });
 *
 * Yard map: Rockford vacation ↔ Rockford roster; Chicago vacation ↔
 * Burnham / Pontiac / Arc / Zion. Prefer that mapping, then fall back to
 * the other Vacation yard (Vacation is names-only).
 *
 * Read-only: never writes `status`, never deletes hired / Sat rows. VAC is
 * derived at display/tally time so a week rollover cannot wipe the roster.
 */

import {
  fullRosterTally,
  type DriverRosterEntry,
  type DriverRosterYard,
  type FullRosterTally,
} from "./driverRoster";
import {
  entriesForWeek,
  entryCoversDate,
  sundayOnOrBefore,
  vacationNameKey,
  type VacationStore,
  type VacationYard,
} from "./vacationBoard";

const FIRST_NAME_ALIASES: Record<string, string> = {
  al: "albert",
  alex: "alexander",
  andy: "andrew",
  bill: "william",
  billy: "william",
  bob: "robert",
  bobby: "robert",
  chris: "christopher",
  dan: "daniel",
  danny: "daniel",
  dave: "david",
  dick: "richard",
  jeff: "jeffrey",
  jim: "james",
  jimmy: "james",
  joe: "joseph",
  joey: "joseph",
  johnnie: "john",
  johnny: "john",
  jon: "john",
  matt: "matthew",
  mike: "michael",
  mikey: "michael",
  rich: "richard",
  rick: "richard",
  rob: "robert",
  steve: "steven",
  stevie: "steven",
  tom: "thomas",
  tommy: "thomas",
  tony: "anthony",
  will: "william",
};

export type EffectiveRosterStatus = {
  /** Status used for tally / display (`vac` when Vacation wins). */
  status: string | null;
  source: "vacation" | "manual" | null;
  storedStatus: string | null;
  onVacation: boolean;
};

export function vacationYardForRosterYard(yard: DriverRosterYard): VacationYard {
  return yard === "rockford" ? "rockford" : "chicago";
}

/** Preferred Vacation yard first, then the other (names-only fallback). */
export function vacationYardsForRosterYard(yard: DriverRosterYard): VacationYard[] {
  const preferred = vacationYardForRosterYard(yard);
  const other: VacationYard = preferred === "rockford" ? "chicago" : "rockford";
  return [preferred, other];
}

/** Lowercase, collapse space, drop nicknames / trainer `-T` suffixes. */
// Pure string -> string; cached because Drivers pages call it per driver x per load.
const ROSTER_KEY_CACHE = new Map<string, string>();
const ROSTER_MATCH_CACHE = new Map<string, boolean>();
const ROSTER_CACHE_MAX = 50000;

export function rosterNameKey(name: string): string {
  const hit = ROSTER_KEY_CACHE.get(name);
  if (hit !== undefined) return hit;
  if (ROSTER_KEY_CACHE.size > ROSTER_CACHE_MAX) ROSTER_KEY_CACHE.clear();
  const key = rosterNameKeyUncached(name);
  ROSTER_KEY_CACHE.set(name, key);
  return key;
}

function rosterNameKeyUncached(name: string): string {
  return vacationNameKey(name)
    .replace(/\([^)]*\)/g, " ")
    .replace(/[.,'/]/g, " ")
    .replace(/\s*-\s*t\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function rosterNamesMatch(a: string, b: string): boolean {
  const pair = a + "\u0000" + b;
  const hit = ROSTER_MATCH_CACHE.get(pair);
  if (hit !== undefined) return hit;
  if (ROSTER_MATCH_CACHE.size > ROSTER_CACHE_MAX) ROSTER_MATCH_CACHE.clear();
  const result = rosterNamesMatchUncached(a, b);
  ROSTER_MATCH_CACHE.set(pair, result);
  return result;
}

/** Generational suffixes are part of who someone is: Bob Jones != Bob Jones Jr. */
const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

export function splitNameSuffix(key: string): { base: string; suffix: string } {
  const tokens = key.split(" ").filter(Boolean);
  const last = tokens[tokens.length - 1];
  if (tokens.length >= 3 && last && NAME_SUFFIXES.has(last)) {
    return { base: tokens.slice(0, -1).join(" "), suffix: last };
  }
  return { base: key, suffix: "" };
}

function rosterNamesMatchUncached(a: string, b: string): boolean {
  const fa = rosterNameKey(a);
  const fb = rosterNameKey(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  // Different (or missing vs present) suffix = different person, even though
  // "bob jones jr" starts with "bob jones".
  const sa = splitNameSuffix(fa);
  const sb = splitNameSuffix(fb);
  if (sa.suffix !== sb.suffix) return false;
  const ka = sa.base;
  const kb = sb.base;
  if (ka === kb) return true;

  const ta = ka.split(" ").filter(Boolean);
  const tb = kb.split(" ").filter(Boolean);
  if (ta.length >= 2 && tb.length >= 2 && (ka.startsWith(`${kb} `) || kb.startsWith(`${ka} `))) {
    return true;
  }
  if (ta.length < 2 || tb.length < 2) return false;
  if (!firstNamesMatch(ta[0], tb[0])) return false;
  return lastNamesMatch(ta[ta.length - 1], tb[tb.length - 1]);
}

/** All Vacation-tab names for the Sunday week that contains `date` (both yards). */
export function vacationNamesOnDateAllYards(
  vacation: VacationStore,
  date: string,
): string[] {
  const weekOf = sundayOnOrBefore(date);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const yard of ["rockford", "chicago"] as const) {
    for (const entry of entriesForWeek(vacation, weekOf, yard)) {
      if (!entryCoversDate(entry, date)) continue;
      const key = rosterNameKey(entry.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(entry.name);
    }
  }
  return names;
}

export function vacationNamesOnDate(
  vacation: VacationStore,
  date: string,
  rosterYard: DriverRosterYard,
): string[] {
  const weekOf = sundayOnOrBefore(date);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const yard of vacationYardsForRosterYard(rosterYard)) {
    for (const entry of entriesForWeek(vacation, weekOf, yard)) {
      if (!entryCoversDate(entry, date)) continue;
      const key = rosterNameKey(entry.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(entry.name);
    }
  }
  return names;
}

export function rosterEntryOnVacation(
  entry: Pick<DriverRosterEntry, "name">,
  vacationNames: readonly string[],
): boolean {
  return vacationNames.some((name) => rosterNamesMatch(entry.name, name));
}

export function effectiveRosterStatus(
  entry: Pick<DriverRosterEntry, "name" | "status">,
  vacationNames: readonly string[],
): EffectiveRosterStatus {
  const stored = entry.status?.trim() ? entry.status : null;
  const onVacation = rosterEntryOnVacation(entry, vacationNames);
  if (onVacation) {
    return { status: "vac", source: "vacation", storedStatus: stored, onVacation: true };
  }
  if (stored) {
    return { status: stored, source: "manual", storedStatus: stored, onVacation: false };
  }
  return { status: null, source: null, storedStatus: null, onVacation: false };
}

export function fullRosterTallyForDate(
  entries: readonly DriverRosterEntry[],
  vacation: VacationStore,
  date: string,
  rosterYard: DriverRosterYard,
): FullRosterTally {
  const vacationNames = vacationNamesOnDate(vacation, date, rosterYard);
  return fullRosterTally(entries, {
    treatAsUnavailable: (entry) => rosterEntryOnVacation(entry, vacationNames),
  });
}

function firstNamesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (canonicalFirst(a) === canonicalFirst(b)) return true;
  return fuzzyToken(a, b);
}

function lastNamesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return fuzzyToken(a, b);
}

function canonicalFirst(token: string): string {
  return FIRST_NAME_ALIASES[token] ?? token;
}

function fuzzyToken(a: string, b: string): boolean {
  const min = Math.min(a.length, b.length);
  return min >= 5 && editDistance(a, b) <= 1;
}

/** Damerau–Levenshtein (adjacent transposition counts as 1). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = best;
    }
  }
  return dp[m][n];
}

/**
 * One logged name -> at most one roster driver. An exact name (same key) always
 * wins; otherwise a fuzzy match counts only if it fits exactly one driver.
 * Ambiguous names resolve to null so nobody is double counted.
 */
export function makeRosterNameResolver(candidates: readonly string[]): (name: string) => string | null {
  const byKey = new Map<string, string>();
  for (const candidate of candidates) {
    const key = rosterNameKey(candidate);
    if (key && !byKey.has(key)) byKey.set(key, candidate);
  }
  const unique = [...byKey.values()];
  const cache = new Map<string, string | null>();
  return (name: string) => {
    const hit = cache.get(name);
    if (hit !== undefined) return hit;
    const key = rosterNameKey(name);
    let result: string | null = null;
    if (key) {
      result = byKey.get(key) ?? null;
      if (!result) {
        const fuzzy = unique.filter((candidate) => rosterNamesMatch(name, candidate));
        result = fuzzy.length === 1 ? fuzzy[0] : null;
      }
    }
    cache.set(name, result);
    return result;
  };
}

/** True when `logged` belongs to `driverName` (and to no better-matching driver). */
export function nameBelongsToDriver(
  logged: string,
  driverName: string,
  resolve?: (name: string) => string | null,
): boolean {
  if (!rosterNamesMatch(logged, driverName)) return false;
  if (!resolve) return true;
  const owner = resolve(logged);
  return owner !== null && rosterNameKey(owner) === rosterNameKey(driverName);
}
