/** One crew row of station truck boxes. Pull on refresh, push when a desk saves. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyStationTruckPoolRemote,
  poolHasTrucks,
  readStationTruckPool,
  readStationTruckPoolUpdatedAt,
} from "./stationTruckPool";

export const STATION_TRUCK_POOL_TABLE = "station_truck_pool";
export const STATION_TRUCK_POOL_ROW_ID = "crew";

type PoolRow = {
  id: string;
  slots: unknown;
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

export async function pullAndMergeStationTruckPool(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from(STATION_TRUCK_POOL_TABLE)
    .select("id, slots, updated_at")
    .eq("id", STATION_TRUCK_POOL_ROW_ID)
    .maybeSingle();
  if (error) {
    if (!missingTable(error.message)) console.warn("station_truck_pool pull failed", error.message);
    return;
  }
  const row = data as PoolRow | null;
  const remoteAt = row?.updated_at ?? "";
  const localAt = readStationTruckPoolUpdatedAt();
  if (row && (!localAt || !newer(localAt, remoteAt))) {
    applyStationTruckPoolRemote(row.slots, remoteAt || new Date().toISOString());
  }
}

export async function pushStationTruckPoolIfLocalNewer(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<void> {
  const localAt = readStationTruckPoolUpdatedAt();
  const local = readStationTruckPool();
  if (!localAt && !poolHasTrucks(local)) return;
  const stamp = localAt || new Date().toISOString();
  const { data, error } = await supabase
    .from(STATION_TRUCK_POOL_TABLE)
    .select("updated_at")
    .eq("id", STATION_TRUCK_POOL_ROW_ID)
    .maybeSingle();
  if (error) {
    if (!missingTable(error.message)) console.warn("station_truck_pool peek failed", error.message);
    return;
  }
  const remoteAt = (data as { updated_at?: string } | null)?.updated_at ?? "";
  if (remoteAt && !newer(stamp, remoteAt)) return;
  const { error: upsertError } = await supabase.from(STATION_TRUCK_POOL_TABLE).upsert({
    id: STATION_TRUCK_POOL_ROW_ID,
    slots: local,
    updated_at: stamp,
    updated_by: userId,
  });
  if (upsertError && !missingTable(upsertError.message)) {
    console.warn("station_truck_pool upsert failed", upsertError.message);
  }
}
