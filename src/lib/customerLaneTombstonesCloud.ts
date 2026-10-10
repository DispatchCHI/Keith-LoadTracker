import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPaged, pagedErrorMessage } from "./cloud";
import { CUSTOMER_LANE_TOMBSTONES_TABLE } from "./customerLanes";

/**
 * Shared lane deletes (customer_lane_tombstones). The table is optional until
 * Keith runs Load-Tracker-customer-lane-tombstones.sql: a missing table reads
 * as `tombstones: null` and every write to it is skipped quietly.
 */
export type LaneTombstonePull =
  | { ok: true; tombstones: Record<string, string> | null }
  | { ok: false };

type TombstoneRow = { id: string; deleted_at: string };

export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const rec = error as { code?: string; message?: string };
  const text = `${rec.code ?? ""} ${rec.message ?? ""}`.toLowerCase();
  return (
    text.includes("42p01") ||
    text.includes("pgrst205") ||
    text.includes("does not exist") ||
    text.includes("schema cache")
  );
}

export async function fetchLaneTombstones(supabase: SupabaseClient): Promise<LaneTombstonePull> {
  const page = await fetchAllPaged<TombstoneRow>(async (from, to) => {
    const result = await supabase
      .from(CUSTOMER_LANE_TOMBSTONES_TABLE)
      .select("id, deleted_at")
      .order("id", { ascending: true })
      .range(from, to);
    return { data: (result.data as TombstoneRow[] | null) ?? null, error: result.error };
  });
  if (page.error || !page.data) {
    if (isMissingTableError(page.error)) return { ok: true, tombstones: null };
    console.warn("customer_lane_tombstones pull failed", pagedErrorMessage(page.error));
    return { ok: false };
  }
  const tombstones: Record<string, string> = {};
  for (const row of page.data) {
    if (row?.id && typeof row.deleted_at === "string") tombstones[row.id] = row.deleted_at;
  }
  return { ok: true, tombstones };
}

export async function pushLaneTombstones(
  supabase: SupabaseClient,
  tombstones: Record<string, string>,
  userId: string | null,
): Promise<void> {
  const rows = Object.entries(tombstones).map(([id, at]) => ({
    id,
    deleted_at: at,
    deleted_by: userId,
  }));
  if (!rows.length) return;
  const { error } = await supabase.from(CUSTOMER_LANE_TOMBSTONES_TABLE).upsert(rows);
  if (error && !isMissingTableError(error)) {
    console.warn("customer_lane_tombstones upsert failed", error.message);
  }
}

/** A lane saved again: drop its shared delete so no desk keeps it hidden. */
export async function clearLaneTombstones(supabase: SupabaseClient, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from(CUSTOMER_LANE_TOMBSTONES_TABLE).delete().in("id", ids);
  if (error && !isMissingTableError(error)) {
    console.warn("customer_lane_tombstones delete failed", error.message);
  }
}