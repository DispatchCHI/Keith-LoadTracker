/** One-row Extra Names book. Pull on refresh, push only when a label changes. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyCustomSpecialtyNames,
  namesHaveCustomLabels,
  readCustomSpecialtyNames,
  readCustomSpecialtyNamesUpdatedAt,
} from "./customSpecialty";

export const SPECIALTY_CUSTOM_NAMES_TABLE = "specialty_custom_names";
export const SPECIALTY_CUSTOM_NAMES_ROW_ID = "crew";

type NamesRow = {
  id: string;
  names: Record<string, unknown> | null;
  updated_at: string;
};

function newer(a: string, b: string): boolean {
  if (!a) return false;
  if (!b) return true;
  return Date.parse(a) > Date.parse(b);
}

export async function pullAndMergeCustomNames(
  supabase: SupabaseClient,
): Promise<void> {
  const { data, error } = await supabase
    .from(SPECIALTY_CUSTOM_NAMES_TABLE)
    .select("id, names, updated_at")
    .eq("id", SPECIALTY_CUSTOM_NAMES_ROW_ID)
    .maybeSingle();
  if (error) {
    if (!/does not exist|schema cache|42P01/i.test(error.message)) {
      console.warn("specialty_custom_names pull failed", error.message);
    }
    return;
  }
  const row = data as NamesRow | null;
  const remoteAt = row?.updated_at ?? "";
  const localAt = readCustomSpecialtyNamesUpdatedAt();
  const remoteNames = row?.names && typeof row.names === "object" ? row.names : null;
  if (remoteNames && (!localAt || !newer(localAt, remoteAt))) {
    applyCustomSpecialtyNames(remoteNames, remoteAt || new Date().toISOString());
  }
}

export async function pushCustomNamesIfLocalNewer(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<void> {
  const local = readCustomSpecialtyNames();
  if (!namesHaveCustomLabels(local)) return;
  const localAt = readCustomSpecialtyNamesUpdatedAt() || new Date().toISOString();
  const { data, error } = await supabase
    .from(SPECIALTY_CUSTOM_NAMES_TABLE)
    .select("updated_at")
    .eq("id", SPECIALTY_CUSTOM_NAMES_ROW_ID)
    .maybeSingle();
  if (error) {
    if (!/does not exist|schema cache|42P01/i.test(error.message)) {
      console.warn("specialty_custom_names peek failed", error.message);
    }
    return;
  }
  const remoteAt = (data as { updated_at?: string } | null)?.updated_at ?? "";
  if (remoteAt && !newer(localAt, remoteAt) && remoteAt !== localAt) return;
  const { error: upsertError } = await supabase.from(SPECIALTY_CUSTOM_NAMES_TABLE).upsert({
    id: SPECIALTY_CUSTOM_NAMES_ROW_ID,
    names: local,
    updated_at: localAt,
    updated_by: userId,
  });
  if (upsertError) console.warn("specialty_custom_names upsert failed", upsertError.message);
}
