/** One-row pickup chip order. Pull on refresh, push when a dispatcher moves a chip. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyPickupChipLayoutRemote,
  pickupColumnsHaveKeys,
  readPickupChipLayoutForPush,
  readPickupChipLayoutUpdatedAt,
} from "./pickupChipLayout";

export const PICKUP_CHIP_LAYOUT_TABLE = "pickup_chip_layout";
export const PICKUP_CHIP_LAYOUT_ROW_ID = "crew";

type LayoutRow = {
  id: string;
  columns: unknown;
  updated_at: string;
};

function newer(a: string, b: string): boolean {
  if (!a) return false;
  if (!b) return true;
  return Date.parse(a) > Date.parse(b);
}

function missingTable(message: string): boolean {
  return /does not exist|schema cache|42P01/i.test(message);
}

export async function pullAndMergePickupChipLayout(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from(PICKUP_CHIP_LAYOUT_TABLE)
    .select("id, columns, updated_at")
    .eq("id", PICKUP_CHIP_LAYOUT_ROW_ID)
    .maybeSingle();
  if (error) {
    if (!missingTable(error.message)) console.warn("pickup_chip_layout pull failed", error.message);
    return;
  }
  const row = data as LayoutRow | null;
  const remoteAt = row?.updated_at ?? "";
  const localAt = readPickupChipLayoutUpdatedAt();
  if (row && (!localAt || !newer(localAt, remoteAt))) {
    applyPickupChipLayoutRemote(row.columns, remoteAt || new Date().toISOString());
  }
}

export async function pushPickupChipLayoutIfLocalNewer(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<void> {
  const localAt = readPickupChipLayoutUpdatedAt();
  const local = readPickupChipLayoutForPush();
  // A fresh desk has no stamp and no order: do not invent or clobber the crew row.
  if (!localAt && !pickupColumnsHaveKeys(local)) return;
  const stamp = localAt || new Date().toISOString();
  const { data, error } = await supabase
    .from(PICKUP_CHIP_LAYOUT_TABLE)
    .select("updated_at")
    .eq("id", PICKUP_CHIP_LAYOUT_ROW_ID)
    .maybeSingle();
  if (error) {
    if (!missingTable(error.message)) console.warn("pickup_chip_layout peek failed", error.message);
    return;
  }
  const remoteAt = (data as { updated_at?: string } | null)?.updated_at ?? "";
  // Equal stamps are not rewritten. Realtime echoes our own upsert, and a
  // second write would loop. Only a strictly newer local order pushes.
  if (remoteAt && !newer(stamp, remoteAt)) return;
  const { error: upsertError } = await supabase.from(PICKUP_CHIP_LAYOUT_TABLE).upsert({
    id: PICKUP_CHIP_LAYOUT_ROW_ID,
    columns: local,
    updated_at: stamp,
    updated_by: userId,
  });
  if (upsertError) console.warn("pickup_chip_layout upsert failed", upsertError.message);
}
