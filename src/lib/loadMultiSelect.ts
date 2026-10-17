/** Multi-select + bulk delete for the station load popup (1.1.41). */

/** Toggle one load id in the selection (returns a new Set). */
export function toggleSelectedId(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Keep only ids still listed (a load deleted/moved elsewhere drops out). */
export function pruneSelection(selected: ReadonlySet<string>, visibleIds: readonly string[]): Set<string> {
  const visible = new Set(visibleIds);
  return new Set([...selected].filter((id) => visible.has(id)));
}

/** Select-all checkbox: all listed when not all are picked, otherwise none. */
export function toggleSelectAll(selected: ReadonlySet<string>, visibleIds: readonly string[]): Set<string> {
  const allPicked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  return allPicked ? new Set() : new Set(visibleIds);
}

export function deleteButtonLabel(count: number): string {
  return count > 0 ? `Delete (${count})` : "Delete";
}

export function bulkDeletePrompt(count: number): string {
  return count === 1 ? "Delete 1 load?" : `Delete ${count} loads?`;
}

/**
 * Ask once, then delete each id through the SAME single-load delete path
 * (LoadsContext.deleteLoad: tombstone, explicit queue op, sync, guards).
 * Returns how many were deleted (0 when cancelled or nothing selected).
 */
export function deleteSelectedLoads(
  ids: readonly string[],
  deleteLoad: (id: string) => void,
  confirm: (message: string) => boolean,
): number {
  const unique = [...new Set(ids)];
  if (!unique.length) return 0;
  if (!confirm(bulkDeletePrompt(unique.length))) return 0;
  for (const id of unique) deleteLoad(id);
  return unique.length;
}
