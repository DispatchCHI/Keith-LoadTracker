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
