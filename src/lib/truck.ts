/** Known broker / sub abbreviations used in the truck field. */
export const KNOWN_BROKER_CODES = [
  "VZ",
  "CGH",
  "CL",
  "G2",
  "GI",
  "TJ",
] as const;

export const TRUCK_MAX_LENGTH = 6;

/** Soft cap for the multi-truck entry field (e.g. "207, 214, 301, 318"). */
export const TRUCK_LIST_INPUT_MAX_LENGTH = 80;

const KNOWN_BROKER_SET = new Set<string>(KNOWN_BROKER_CODES);

/** Letters + digits, uppercase. Numeric trucks stay unchanged aside from length. */
export function sanitizeTruck(raw: string, maxLength = TRUCK_MAX_LENGTH): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, maxLength);
}

/**
 * Keep letters, digits, commas, and spaces while typing a comma-separated list.
 * Does not apply per-token length limits — use parseTruckList for that.
 */
export function sanitizeTruckListInput(
  raw: string,
  maxLength = TRUCK_LIST_INPUT_MAX_LENGTH,
): string {
  return raw
    .replace(/[^A-Za-z0-9,\s]/g, "")
    .toUpperCase()
    .slice(0, maxLength);
}

export type ParsedTruckList = {
  /** Sanitized, non-empty, first-seen-order truck tokens. */
  trucks: string[];
  /** Raw tokens that produced nothing after sanitizeTruck. */
  invalid: string[];
};

/**
 * Split a comma-separated truck field into sanitized unit/broker codes.
 * Empty tokens (,, or trailing commas) are ignored. Duplicates collapsed.
 */
export function parseTruckList(raw: string): ParsedTruckList {
  const trucks: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (!token) continue;
    const cleaned = sanitizeTruck(token);
    if (!cleaned) {
      invalid.push(token);
      continue;
    }
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    trucks.push(cleaned);
  }
  return { trucks, invalid };
}

/** Normalize a list for display / form state (e.g. "207, 214, 301"). */
export function formatTruckList(trucks: readonly string[]): string {
  return trucks.join(", ");
}

export function isNumericTruck(truck: string): boolean {
  return /^\d+$/.test(truck.trim());
}

/**
 * Broker / SUBS truck: a known abbreviation, or any letter-based code
 * (not a pure numeric unit). Matching is by pattern, not a closed list only.
 */
export function isBrokerTruck(truck: string): boolean {
  const code = sanitizeTruck(truck);
  if (!code || isNumericTruck(code)) return false;
  if (KNOWN_BROKER_SET.has(code)) return true;
  return /[A-Z]/.test(code);
}
