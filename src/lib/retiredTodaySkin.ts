/** The old Today / Yard Desk layout switch is gone; Yard Desk is the only Today.
 * Desks that saved a choice keep a stale key — drop it quietly. */
export const RETIRED_TODAY_SKIN_KEY = "chitrader.load-tracker.today-skin.v1";

export function clearRetiredTodaySkin(): void {
  try {
    localStorage.removeItem(RETIRED_TODAY_SKIN_KEY);
  } catch {
    // Storage blocked / unavailable: nothing to clean.
  }
}
