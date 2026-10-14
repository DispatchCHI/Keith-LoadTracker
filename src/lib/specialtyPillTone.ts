import { brandCompanyIdForCustomer } from "./customerBrands";

/** Soft fill, darker border, and readable text for one Specialty transfer pill. */
export type SpecialtyPillTone = {
  background: string;
  border: string;
  color: string;
};

export type SpecialtyOwner = "republic" | "wm" | "unknown";

/**
 * Who owns each Specialty transfer yard. EDIT HERE to correct a yard.
 * Keys are the yard name lowercased with spaces/punctuation removed.
 * Names not listed fall back to the Customers-page brand (Republic / WM)
 * and otherwise show a neutral slate tab.
 *
 * Republic / WM entries mirror the app's customer brand list; the others
 * marked "guess" are best knowledge and should be confirmed by Keith.
 */
export const SPECIALTY_OWNER: Record<string, SpecialtyOwner> = {
  // Republic Services (from customer brand list)
  apollo: "republic",
  melrose: "republic",
  arc: "republic",
  citiwaste: "republic",
  schererville: "republic",
  // Waste Management (from customer brand list)
  elgin: "wm",
  batavia: "wm",
  northlake: "wm",
  rockdale: "wm",
  roscoe: "wm",
  liberty: "wm",
  // Waste Management (guess: WM Prairie Hill RDF and DeKalb County landfill)
  prairiehillrfd: "wm",
  dekalb: "wm",
  dekalbreload: "wm",
  // Not set yet (owner unconfirmed): wheeling, mccook, hodgkins, grayslake, ford
};

export const OWNER_INK: Record<Exclude<SpecialtyOwner, "unknown">, string> = {
  republic: "#1d4ed8",
  wm: "#15803d",
};
const UNKNOWN_INK = "#64748b";

function squeeze(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function specialtyOwner(name: string): SpecialtyOwner {
  const fixed = SPECIALTY_OWNER[squeeze(name)];
  if (fixed) return fixed;
  const brand = brandCompanyIdForCustomer(name);
  if (brand === "republic") return "republic";
  if (brand === "waste-management") return "wm";
  return "unknown";
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function mix(hex: string, toward: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  return `#${a
    .map((v, i) => Math.round(v + (b[i]! - v) * amount).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Soft tint from a dark ink: light fill, the ink as the border, darker text. */
export function pillToneFromInk(ink: string): SpecialtyPillTone {
  return {
    background: mix(ink, "#ffffff", 0.86),
    border: ink,
    color: mix(ink, "#0f172a", 0.42),
  };
}

/** Pill color by owner: Republic blue, WM green, unknown slate. */
export function specialtyPillTone(name: string): SpecialtyPillTone {
  const owner = specialtyOwner(name);
  return pillToneFromInk(owner === "unknown" ? UNKNOWN_INK : OWNER_INK[owner]);
}
