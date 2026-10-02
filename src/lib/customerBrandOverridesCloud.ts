/** One-row customer brand overrides book. Pull on refresh, push when logos change. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyCustomerBrandOverrides,
  brandsHaveOverrides,
  readCustomerBrandOverrides,
  readCustomerBrandOverridesUpdatedAt,
} from "./customerBrands";

export const CUSTOMER_BRAND_OVERRIDES_TABLE = "customer_brand_overrides";
export const CUSTOMER_BRAND_OVERRIDES_ROW_ID = "crew";

type BrandsRow = {
  id: string;
  brands: Record<string, unknown> | null;
  updated_at: string;
};

function newer(a: string, b: string): boolean {
  if (!a) return false;
  if (!b) return true;
  return Date.parse(a) > Date.parse(b);
}

export async function pullAndMergeCustomerBrandOverrides(
  supabase: SupabaseClient,
): Promise<void> {
  const { data, error } = await supabase
    .from(CUSTOMER_BRAND_OVERRIDES_TABLE)
    .select("id, brands, updated_at")
    .eq("id", CUSTOMER_BRAND_OVERRIDES_ROW_ID)
    .maybeSingle();
  if (error) {
    if (!/does not exist|schema cache|42P01/i.test(error.message)) {
      console.warn("customer_brand_overrides pull failed", error.message);
    }
    return;
  }
  const row = data as BrandsRow | null;
  const remoteAt = row?.updated_at ?? "";
  const localAt = readCustomerBrandOverridesUpdatedAt();
  const remoteBrands =
    row?.brands && typeof row.brands === "object" ? row.brands : null;
  if (remoteBrands && (!localAt || !newer(localAt, remoteAt))) {
    applyCustomerBrandOverrides(remoteBrands, remoteAt || new Date().toISOString());
  }
}

export async function pushCustomerBrandOverridesIfLocalNewer(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<void> {
  const local = readCustomerBrandOverrides();
  const localAt = readCustomerBrandOverridesUpdatedAt();
  // Mirror Extra Names: do not invent a cloud row until this desk has saved
  // overrides (or cleared one that previously existed locally).
  if (!localAt && !brandsHaveOverrides(local)) return;
  const stamp = localAt || new Date().toISOString();
  const { data, error } = await supabase
    .from(CUSTOMER_BRAND_OVERRIDES_TABLE)
    .select("updated_at")
    .eq("id", CUSTOMER_BRAND_OVERRIDES_ROW_ID)
    .maybeSingle();
  if (error) {
    if (!/does not exist|schema cache|42P01/i.test(error.message)) {
      console.warn("customer_brand_overrides peek failed", error.message);
    }
    return;
  }
  const remoteAt = (data as { updated_at?: string } | null)?.updated_at ?? "";
  if (remoteAt && !newer(stamp, remoteAt) && remoteAt !== stamp) return;
  const { error: upsertError } = await supabase
    .from(CUSTOMER_BRAND_OVERRIDES_TABLE)
    .upsert({
      id: CUSTOMER_BRAND_OVERRIDES_ROW_ID,
      brands: local,
      updated_at: stamp,
      updated_by: userId,
    });
  if (upsertError) {
    console.warn("customer_brand_overrides upsert failed", upsertError.message);
  }
}