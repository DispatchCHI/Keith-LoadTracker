import { safeSetItem } from "./localStorageSafe";

/** Which Today arrangement this desk is using. Classic stays the default. */
export type TodaySkin = "classic" | "yard";

export const TODAY_SKIN_KEY = "chitrader.load-tracker.today-skin.v1";

export function readTodaySkin(): TodaySkin {
  try {
    return localStorage.getItem(TODAY_SKIN_KEY) === "yard" ? "yard" : "classic";
  } catch {
    return "classic";
  }
}

export function writeTodaySkin(skin: TodaySkin): void {
  safeSetItem(TODAY_SKIN_KEY, skin === "yard" ? "yard" : "classic");
}
