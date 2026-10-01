/**
 * True when `a` is a later instant than `b`.
 *
 * Clients stamp rows with `Date.toISOString()` (`2026-09-30T18:32:00.123Z`).
 * PostgREST reads the same timestamptz back as `2026-09-30T18:32:00.123000+00:00`.
 * Those strings do not sort together: the `Z` form is lexicographically greater
 * even when the instant is identical (or only microseconds later). A `>` check
 * then treats every pulled row as a local edit and upserts it again. Each of
 * those writes is one Realtime message per subscribed desk.
 *
 * Compare parsed instants instead. Millisecond resolution matches
 * `toISOString()`. Equal instants are not "after", so an unchanged row is not
 * written again. Unparseable values fall back to string order.
 */
export function isIsoAfter(a: string, b: string): boolean {
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (Number.isFinite(aMs) && Number.isFinite(bMs)) return aMs > bMs;
  return a > b;
}

/** True when both strings parse to the same millisecond (or are identical). */
export function isIsoSameInstant(a: string, b: string): boolean {
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (Number.isFinite(aMs) && Number.isFinite(bMs)) return aMs === bMs;
  return a === b;
}

function isZuluIso(value: string): boolean {
  return /Z$/i.test(value.trim());
}

/**
 * Pick which timestamp string to keep when two rows tie on instant.
 * Prefer the PostgREST offset form (`+00:00`) over client `Z` so localStorage
 * heals after a pull and string `>` cannot resurrect a write loop.
 */
export function preferIsoTimestamp(a: string, b: string): string {
  if (isIsoAfter(a, b)) return a;
  if (isIsoAfter(b, a)) return b;
  if (isZuluIso(a) && !isZuluIso(b)) return b;
  if (isZuluIso(b) && !isZuluIso(a)) return a;
  return a;
}

/**
 * Pick the row with the later `updatedAt` instant. On a tie, prefer the
 * PostgREST-shaped timestamp so a `Z` echo does not stick in local caches.
 */
export function pickNewerByUpdatedAt<T extends { updatedAt: string }>(a: T, b: T): T {
  if (isIsoAfter(a.updatedAt, b.updatedAt)) return a;
  if (isIsoAfter(b.updatedAt, a.updatedAt)) return b;
  return preferIsoTimestamp(a.updatedAt, b.updatedAt) === a.updatedAt ? a : b;
}