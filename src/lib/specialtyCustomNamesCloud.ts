/** One-row Extra Names book. Pull on refresh, push only when a label changes. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyCustomSpecialtyNames,
  customSpecialtyNumber,
  namesHaveCustomLabels,
  readCustomSpecialtyNames,
  readCustomSpecialtyNamesUpdatedAt,
} from "./customSpecialty";
import {
  ODD_DAYS_FIELD,
  oddDaysHaveCards,
  readOddDays,
  replaceOddDays,
} from "./specialtyOddDays";

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

function shouldPushNames(): boolean {
  if (namesHaveCustomLabels()) return true;
  if (oddDaysHaveCards()) return true;
  return Object.keys(readCustomSpecialtyNames()).some((id) => customSpecialtyNumber(id) > 4);
}

function splitRemoteNames(raw: Record<string, unknown>): {
  names: Record<string, unknown>;
  days: unknown;
  hasDays: boolean;
} {
  const names = { ...raw };
  const hasDays = Object.prototype.hasOwnProperty.call(names, ODD_DAYS_FIELD);
  const days = names[ODD_DAYS_FIELD];
  delete names[ODD_DAYS_FIELD];
  return { names, days, hasDays };
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
    const split = splitRemoteNames(remoteNames);
    applyCustomSpecialtyNames(split.names, remoteAt || new Date().toISOString());
    if (split.hasDays) replaceOddDays(split.days);
  }
}

export async function pushCustomNamesIfLocalNewer(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<void> {
  if (!shouldPushNames()) return;
  const local = {
    ...readCustomSpecialtyNames(),
    [ODD_DAYS_FIELD]: readOddDays(),
  };
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
