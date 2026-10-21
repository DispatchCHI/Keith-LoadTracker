/**
 * Log/Edit Load pickup: is the current CUSTOM_ID pickup a typed "Custom..." name?
 * Programmed lanes without a station entry and named odd-balls also use
 * CUSTOM_ID, but they are chips, not typed text (1.1.43).
 */
export function isCustomTypedPickup(opts: {
  isCustom: boolean;
  pickup: string;
  oddballNames: readonly string[];
  laneNames: readonly string[];
}): boolean {
  if (!opts.isCustom) return false;
  const key = opts.pickup.trim().toLowerCase();
  if (opts.oddballNames.some((name) => name.trim().toLowerCase() === key)) return false;
  if (opts.laneNames.some((name) => name.trim().toLowerCase() === key)) return false;
  return true;
}
