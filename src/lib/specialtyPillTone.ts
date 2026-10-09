import {
  brandCompanyIdForCustomer,
  type BrandCompanyId,
} from "./customerBrands";

/** Soft fill, darker border, and readable text for one Specialty transfer pill. */
export type SpecialtyPillTone = {
  background: string;
  border: string;
  color: string;
};

/**
 * Inks already used for these yards on the specialty board (`tone-*` in index.css).
 * Keyed by a squeezed location name so "Citi Waste" and "GraysLake" stay stable.
 */
const YARD_INK: Record<string, string> = {
  elgin: "#1e3a8a",
  apollo: "#0f766e",
  melrose: "#1d4ed8",
  batavia: "#0369a1",
  northlake: "#166534",
  arc: "#b45309",
  citiwaste: "#4338ca",
  schererville: "#9f1239",
  mccook: "#3f6212",
  dekalbreload: "#9a3412",
  wheeling: "#6d28d9",
  rockdale: "#0e7490",
  dekalb: "#14532d",
  roscoe: "#7c2d12",
  ford: "#1e40af",
  prairiehillrfd: "#4d7c0f",
  hodgkins: "#c2410c",
  grayslake: "#6b21a8",
  liberty: "#115e59",
};

/** Recognizable company hues. Used when a name has a customer brand and no yard ink. */
const BRAND_INK: Record<Exclude<BrandCompanyId, "none">, string> = {
  "waste-management": "#15803d",
  republic: "#1d4ed8",
  lrs: "#0f766e",
  "tri-state": "#c2410c",
  krma: "#0369a1",
  ford: "#1e3a8a",
};

/** Fixed palette for names with neither a yard tone nor a customer brand. */
const HASH_INKS = [
  "#0e7490",
  "#7c3aed",
  "#c2410c",
  "#be123c",
  "#15803d",
  "#a16207",
  "#6d28d9",
  "#b45309",
  "#9d174d",
  "#365314",
  "#0369a1",
  "#86198f",
  "#3f6212",
  "#9a3412",
  "#115e59",
  "#1e40af",
] as const;

function norm(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function squeeze(name: string): string {
  return norm(name).replace(/ /g, "");
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("")}`;
}

function mix(hex: string, toward: string, towardAmount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  return rgbToHex(
    Math.round(a[0] + (b[0] - a[0]) * towardAmount),
    Math.round(a[1] + (b[1] - a[1]) * towardAmount),
    Math.round(a[2] + (b[2] - a[2]) * towardAmount),
  );
}

/** Soft tint from a dark ink: light fill, the ink as the border, darker text. */
export function pillToneFromInk(ink: string): SpecialtyPillTone {
  return {
    background: mix(ink, "#ffffff", 0.86),
    border: ink,
    color: mix(ink, "#0f172a", 0.42),
  };
}

/** djb2, unsigned. Same name always lands on the same palette slot. */
export function stableNameHash(name: string): number {
  let h = 5381;
  const key = norm(name);
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Color for a Specialty transfer pill.
 * A yard that already has a specialty-board tone keeps that color, so each
 * location on the card stays distinct. Otherwise a customer brand color is
 * reused when this name has one. Every other name, including odd-ball cards
 * added with +, picks a fixed palette entry from a hash of the name.
 */
export function specialtyPillTone(name: string): SpecialtyPillTone {
  const yard = YARD_INK[squeeze(name)];
  if (yard) return pillToneFromInk(yard);
  const brand = brandCompanyIdForCustomer(name);
  if (brand !== "none") return pillToneFromInk(BRAND_INK[brand]);
  return pillToneFromInk(HASH_INKS[stableNameHash(name) % HASH_INKS.length]!);
}
