export type TagTone = {
  bg: string;
  fg: string;
  border: string;
};

const TONES: Record<string, TagTone> = {
  trash: { bg: "#bfdbfe", fg: "#1e3a8a", border: "#60a5fa" },
  recycle: { bg: "#bbf7d0", fg: "#14532d", border: "#4ade80" },
  yard: { bg: "#fef08a", fg: "#713f12", border: "#eab308" },
  wood: { bg: "#3d2a14", fg: "#e0b07a", border: "#8a5a32" },
  cardboard: { bg: "#a16207", fg: "#fff7ed", border: "#78350f" },
  leachate: { bg: "#ddd6fe", fg: "#5b21b6", border: "#8b5cf6" },
  residual: { bg: "#fbcfe8", fg: "#831843", border: "#ec4899" },
  glass: { bg: "#e5e7eb", fg: "#374151", border: "#9ca3af" },
  cd: { bg: "#d6b48c", fg: "#4a2c16", border: "#a8794f" },
  tires: { bg: "#2a2438", fg: "#c4b4e0", border: "#5a4e78" },
  default: { bg: "#2a2e36", fg: "#d4d0c8", border: "#4a4e56" },
};

function isCdCommodity(c: string): boolean {
  return c.includes("c&d") || c.includes("c and d") || /(^|\W)cd(\W|$)/.test(c);
}

/** True when the stored string is only the old Walking-floor tag. Not a real commodity. */
export function isWalkingFloorTag(commodity: string): boolean {
  const c = commodity.toLowerCase();
  return c.includes("walking") || /(^|\W)wf(\W|$)/.test(c);
}

export function commodityTone(commodity: string): TagTone {
  const c = commodity.toLowerCase();
  if (c.includes("leachate")) return TONES.leachate;
  if (c.includes("residual") || c.includes("residue")) return TONES.residual;
  if (c.includes("glass")) return TONES.glass;
  if (isCdCommodity(c)) return TONES.cd;
  if (c.includes("trash") || c.includes("msw")) return TONES.trash;
  if (c.includes("recycle")) return TONES.recycle;
  if (c.includes("yard")) return TONES.yard;
  if (c.includes("wood")) return TONES.wood;
  if (c.includes("cardboard")) return TONES.cardboard;
  if (c.includes("tire")) return TONES.tires;
  return TONES.default;
}

/**
 * Bucket for Today commodity rows and filters.
 * Trash (MSW) and Leachate stay their own buckets.
 * C&D, tires, recycle, yard, wood, residual, glass, cardboard stay named.
 * Walking-floor is never a label. Header totals live in totals.ts.
 */
export function tallyLabel(commodity: string): string {
  const c = commodity.toLowerCase();
  if (c.includes("leachate")) return "LEACHATE";
  if (c.includes("residual") || c.includes("residue")) return "RESIDUAL";
  if (c.includes("glass")) return "GLASS";
  if (isCdCommodity(c)) return "C&D";
  if (c.includes("trash") || c.includes("msw")) return "TRASH";
  if (c.includes("yard")) return "YARD";
  if (c.includes("recycle")) return "RECYCLE";
  if (c.includes("wood")) return "WOOD";
  if (c.includes("cardboard")) return "CARDBOARD";
  if (c.includes("tire")) return "TIRES";
  if (isWalkingFloorTag(commodity)) return "";
  return commodity.toUpperCase();
}

/** Longer names for the Day Totals ranking (and filter captions). */
export function commodityRankLabel(commodity: string): string {
  const c = commodity.toLowerCase();
  if (c.includes("leachate")) return "Leachate";
  if (c.includes("residual") || c.includes("residue")) return "Residual";
  if (c.includes("glass")) return "Glass";
  if (isCdCommodity(c)) return "C&D";
  if (c.includes("trash") || c.includes("msw")) return "Trash (MSW)";
  if (c.includes("yard")) return "Yard Waste";
  if (c.includes("recycle")) return "Recycle";
  if (c.includes("wood")) return "Wood";
  if (c.includes("cardboard")) return "Cardboard";
  if (c.includes("tire")) return "Tires";
  if (isWalkingFloorTag(commodity)) return "";
  return commodity;
}

export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function loadsToCsv(
  loads: { truck: string; pickup: string; commodity: string; destination: string }[],
): string {
  const header = "truck,pickup,commodity,destination";
  const rows = loads.map((load) =>
    [load.truck, load.pickup, load.commodity, load.destination]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...rows].join("\n") + "\n";
}
