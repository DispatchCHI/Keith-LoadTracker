import { safeSetItem } from "./localStorageSafe";

/** This desk's Specialty transfers expand preference. Stays on this device. */
export const SPECIALTY_LOADS_OPEN_KEY = "chitrader.load-tracker.specialty-loads-open.v1";

export type SpecialtyLocationCount = {
  count: number;
};

/** Expanded panel lists only specialty locations that already have a load. */
export function specialtyLocationsWithLoads<T extends SpecialtyLocationCount>(
  locations: readonly T[],
): T[] {
  return locations.filter((location) => location.count > 0);
}

export function readSpecialtyLoadsOpen(): boolean {
  try {
    return localStorage.getItem(SPECIALTY_LOADS_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSpecialtyLoadsOpen(open: boolean): void {
  safeSetItem(SPECIALTY_LOADS_OPEN_KEY, open ? "1" : "0");
}
