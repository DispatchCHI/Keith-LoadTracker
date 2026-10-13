/**
 * Roster deletes go through the server-side guard
 * `public.delete_roster_rows(p_ids uuid[], p_deleted_at timestamptz)`, which
 * only deletes a row whose updated_at is not newer than the delete. A stale
 * desk (old tombstone, old build) can no longer wipe a name that was put back.
 */
export const ROSTER_DELETE_RPC = "delete_roster_rows";
/** Preferred: same guard plus p_sync_version; the server rejects builds below its minimum. */
export const ROSTER_DELETE_RPC_V2 = "delete_roster_rows_v2";
/** After a "function missing" answer, use the direct delete for this long, then re-try the RPC. */
export const ROSTER_RPC_MISSING_RETRY_MS = 5 * 60 * 1000;

export type DeleteBatch = { at: string; ids: string[] };

/**
 * Group ids by the delete time to send. `stampFor` gives the recorded
 * tombstone time (explicit A- / Reset stamp now); `fallbackFor` covers legacy
 * tombstones with no time (the row as last seen on the cloud); otherwise now.
 */
export function groupDeletesByTime(
  ids: Iterable<string>,
  stampFor: (id: string) => string | undefined,
  fallbackFor: (id: string) => string | undefined,
  now: string,
): DeleteBatch[] {
  const byAt = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    const raw = stampFor(id) ?? fallbackFor(id) ?? now;
    const at = Number.isFinite(Date.parse(raw)) ? raw : now;
    const list = byAt.get(at);
    if (list) list.push(id);
    else byAt.set(at, [id]);
  }
  return [...byAt.entries()].map(([at, list]) => ({ at, ids: list }));
}

/** PostgREST / Postgres answer for "delete_roster_rows is not installed yet". */
export function isMissingRpcError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return /could not find the function|function .*delete_roster_rows(_v2)?.* does not exist/i.test(
    error.message ?? "",
  );
}
