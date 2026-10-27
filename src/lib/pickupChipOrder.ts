import type { CSSProperties } from "react";
import { brandCompanyIdForCustomer } from "./customerBrands";
import { OWNER_INK, pillToneFromInk } from "./specialtyPillTone";
import {
  TRANSFER_STATION_COLUMNS,
  TRANSFER_STATION_FLOATING,
  stationOrderKey,
} from "./transferStationOrder";

/**
 * 1.1.50 Log Load pickup chips: owner tint + Today "Transfer stations" order.
 * Owner comes only from the Customers-page brand (Republic / Waste Management,
 * incl. dispatcher overrides) plus Apollo = Republic (Keith confirmed).
 * Anything else stays neutral; no guesses.
 */
const CONFIRMED_OWNER: Record<string, "republic" | "wm"> = { apollo: "republic" };

export function pickupChipOwner(name: string): "republic" | "wm" | null {
  const fixed = CONFIRMED_OWNER[stationOrderKey(name)];
  if (fixed) return fixed;
  const brand = brandCompanyIdForCustomer(name);
  if (brand === "republic") return "republic";
  if (brand === "waste-management") return "wm";
  return null;
}

/** Same light blue / light green as the Specialty transfer pills. */
export function pickupChipStyle(name: string): CSSProperties | undefined {
  const owner = pickupChipOwner(name);
  if (!owner) return undefined;
  const tone = pillToneFromInk(OWNER_INK[owner]);
  return { background: tone.background, borderColor: tone.border, color: tone.color };
}

const ORDER: readonly string[] = [
  ...TRANSFER_STATION_COLUMNS.flat(),
  ...TRANSFER_STATION_FLOATING,
].map(stationOrderKey);

/** Today-card order (column by column, then floating), others A-Z after. */
export function sortPickupsTodayOrder<T>(items: readonly T[], nameOf: (item: T) => string): T[] {
  const rank = (item: T) => {
    const i = ORDER.indexOf(stationOrderKey(nameOf(item)));
    return i === -1 ? ORDER.length : i;
  };
  return [...items].sort((a, b) => {
    const d = rank(a) - rank(b);
    return d !== 0 ? d : nameOf(a).localeCompare(nameOf(b), "en");
  });
}