/**
 * Saturday Worklist settings: shared footer (synced) + per-week title prefix (this desk).
 *
 * The footer rides in the existing `dispatch_board` table as a settings row
 * with `year = 0` (no new SQL). Dispatch-board code ignores it: its board JSON
 * has no numeric `year`, so normalizeBoard() skips it on every build, old or new.
 */
import { isIsoAfter } from "./isoTime";
import { safeSetItem } from "./localStorageSafe";
import { DEFAULT_SAT_FOOTER, isWorklistPrefix, type WorklistPrefix } from "./satWorklist";
import { getSupabase } from "./supabase";

export const SAT_WORKLIST_STORE_KEY = "chitrader.load-tracker.sat-worklist.v1";
export const SAT_WORKLIST_SETTINGS_YEAR = 0;
export const SAT_WORKLIST_SETTINGS_KIND = "sat-worklist-settings";

export type SatWorklistSettings = {
  footer: string;
  /** "" until edited: a never-edited desk never beats a real edit. */
  footerUpdatedAt: string;
  /** Saturday ISO -> chosen title prefix. Remembered on this desk only. */
  prefixBySaturday: Record<string, WorklistPrefix>;
};

export function defaultSatWorklistSettings(): SatWorklistSettings {
  return { footer: DEFAULT_SAT_FOOTER, footerUpdatedAt: "", prefixBySaturday: {} };
}

export function parseSatWorklistSettings(raw: unknown): SatWorklistSettings {
  const base = defaultSatWorklistSettings();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;
  const prefixBySaturday: Record<string, WorklistPrefix> = {};
  if (rec.prefixBySaturday && typeof rec.prefixBySaturday === "object") {
    for (const [day, value] of Object.entries(rec.prefixBySaturday as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && isWorklistPrefix(value) && value) {
        prefixBySaturday[day] = value;
      }
    }
  }
  return {
    footer: typeof rec.footer === "string" ? rec.footer : base.footer,
    footerUpdatedAt: typeof rec.footerUpdatedAt === "string" ? rec.footerUpdatedAt : "",
    prefixBySaturday,
  };
}

export function readSatWorklistSettings(): SatWorklistSettings {
  try {
    const raw = localStorage.getItem(SAT_WORKLIST_STORE_KEY);
    return raw ? parseSatWorklistSettings(JSON.parse(raw)) : defaultSatWorklistSettings();
  } catch {
    return defaultSatWorklistSettings();
  }
}

export function writeSatWorklistSettings(next: SatWorklistSettings): void {
  safeSetItem(SAT_WORKLIST_STORE_KEY, JSON.stringify(next));
}

/** Keep only the last ~12 Saturdays of remembered prefixes. */
export function setPrefixForSaturday(
  settings: SatWorklistSettings,
  saturday: string,
  prefix: WorklistPrefix,
): SatWorklistSettings {
  const map = { ...settings.prefixBySaturday };
  if (prefix) map[saturday] = prefix;
  else delete map[saturday];
  const kept = Object.keys(map).sort().slice(-12);
  const trimmed: Record<string, WorklistPrefix> = {};
  for (const day of kept) trimmed[day] = map[day];
  return { ...settings, prefixBySaturday: trimmed };
}

export type CloudFooter = { footer: string; updatedAt: string };

/** Board JSON stored in dispatch_board year 0. Deliberately has no `year` field. */
export function footerToBoard(footer: CloudFooter): Record<string, unknown> {
  return { kind: SAT_WORKLIST_SETTINGS_KIND, footer: footer.footer, updatedAt: footer.updatedAt };
}

export function footerFromBoard(board: unknown, rowUpdatedAt?: string | null): CloudFooter | null {
  if (!board || typeof board !== "object" || Array.isArray(board)) return null;
  const rec = board as Record<string, unknown>;
  if (rec.kind !== SAT_WORKLIST_SETTINGS_KIND || typeof rec.footer !== "string") return null;
  const updatedAt =
    typeof rec.updatedAt === "string" && rec.updatedAt ? rec.updatedAt : rowUpdatedAt ?? "";
  return { footer: rec.footer, updatedAt };
}

/**
 * Last writer wins on parsed instants. A desk that never edited the footer
 * (empty stamp) always takes the cloud copy and never uploads its default.
 */
export function mergeFooter(
  local: SatWorklistSettings,
  remote: CloudFooter | null,
): { next: SatWorklistSettings; upload: CloudFooter | null } {
  if (!remote) {
    return {
      next: local,
      upload: local.footerUpdatedAt ? { footer: local.footer, updatedAt: local.footerUpdatedAt } : null,
    };
  }
  if (local.footerUpdatedAt && isIsoAfter(local.footerUpdatedAt, remote.updatedAt)) {
    return { next: local, upload: { footer: local.footer, updatedAt: local.footerUpdatedAt } };
  }
  if (local.footer === remote.footer && local.footerUpdatedAt) return { next: local, upload: null };
  return {
    next: { ...local, footer: remote.footer, footerUpdatedAt: remote.updatedAt },
    upload: null,
  };
}

/** null = could not read (offline / error): caller must not upload this round. */
export async function fetchCloudFooter(): Promise<{ ok: true; footer: CloudFooter | null } | { ok: false }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false };
  const { data, error } = await supabase
    .from("dispatch_board")
    .select("board, updated_at")
    .eq("year", SAT_WORKLIST_SETTINGS_YEAR)
    .maybeSingle();
  if (error) return { ok: false };
  if (!data) return { ok: true, footer: null };
  const row = data as { board: unknown; updated_at: string | null };
  return { ok: true, footer: footerFromBoard(row.board, row.updated_at) };
}

export async function upsertCloudFooter(footer: CloudFooter, userId: string | null): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase.from("dispatch_board").upsert(
    {
      year: SAT_WORKLIST_SETTINGS_YEAR,
      board: footerToBoard(footer),
      updated_at: footer.updatedAt,
      updated_by: userId,
    },
    { onConflict: "year" },
  );
  if (error) console.warn("sat worklist footer upsert failed", error.message);
  return !error;
}