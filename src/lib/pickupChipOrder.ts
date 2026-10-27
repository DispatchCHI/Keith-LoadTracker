import type { CSSProperties } from "react";
import { brandCompanyIdForCustomer } from "./customerBrands";
import { OWNER_INK, pillToneFromInk } from "./specialtyPillTone";
import { stationOrderKey } from "./transferStationOrder";

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

/** 1.1.51: Log Load pickup grid, 4 fixed columns read top to bottom. */
export const PICKUP_GRID_COL1: readonly string[] = [
  "Medill", "Calumet", "Hooker Street", "Chicago Heights", "Schererville",
  "Apollo", "LRS", "Tri-State", "Rockdale",
];
export const PICKUP_GRID_COL2: readonly string[] = [
  "Melrose", "Northlake", "Arc", "Batavia", "Elgin", "Liberty", "Roscoe", "Hodgkins", "Ford",
];
/** Top of column 3; every other pickup follows (overflow) and fills columns 3 then 4. */
export const PICKUP_GRID_COL3_TOP: readonly string[] = ["Wheeling", "Evanston", "DeKalb"];
/** Overflow that goes first (less-used transfers), then everything else A-Z. */
export const PICKUP_GRID_OVERFLOW_FIRST: readonly string[] = [
  "Laraway", "GraysLake", "Midway", "Wheatland", "Woodland",
];
/** Rows shown before "+ N more". */
export const PICKUP_GRID_COLLAPSED_ROWS = 4;

/**
 * Split the pickups the app shows into 4 columns. Fixed slots only appear when
 * the pickup exists (names match by stationOrderKey: case, spaces, punctuation,
 * LF/RDF suffix). Overflow is balanced across columns 3 and 4.
 */
export function layoutPickupGrid<T>(items: readonly T[], nameOf: (item: T) => string): T[][] {
  const pool = [...items];
  const take = (name: string): T[] => {
    const key = stationOrderKey(name);
    const hits: T[] = [];
    for (let i = 0; i < pool.length; ) {
      if (stationOrderKey(nameOf(pool[i]!)) === key) hits.push(...pool.splice(i, 1));
      else i++;
    }
    return hits;
  };
  const col1 = PICKUP_GRID_COL1.flatMap(take);
  const col2 = PICKUP_GRID_COL2.flatMap(take);
  const top = PICKUP_GRID_COL3_TOP.flatMap(take);
  const first = PICKUP_GRID_OVERFLOW_FIRST.flatMap(take);
  const rest = pool.sort((a, b) => nameOf(a).localeCompare(nameOf(b), "en"));
  const tail = [...top, ...first, ...rest];
  const split = Math.ceil(tail.length / 2);
  return [col1, col2, tail.slice(0, split), tail.slice(split)];
}

/** Collapsed view: first N rows of each column. */
export function collapsePickupGrid<T>(cols: readonly (readonly T[])[], rows = PICKUP_GRID_COLLAPSED_ROWS): T[][] {
  return cols.map((col) => col.slice(0, rows));
}