/**
 * Chips layout of the Specialty board. "Show loads" lists every location with
 * loads; clicking a pill opens that location's detail card. When the clicked
 * location is already in the Show loads list, the detail card was a second,
 * identical copy (same counts, same chips) — render it only once.
 */
export function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function showSeparateSpecialtyDetail(
  openId: string | null,
  laneReveal: boolean,
  listedIds: readonly string[],
): boolean {
  if (!openId) return false;
  return !(laneReveal && listedIds.includes(openId));
}
