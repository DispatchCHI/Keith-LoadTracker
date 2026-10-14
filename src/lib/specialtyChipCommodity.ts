import { getStation, resolveStationId } from "../data/stations";
import { isLaneStub, placesMatch, type CustomerLaneStore } from "./customerLanes";
import {
  parseSpecialtyLaneChip,
  sameSpecialtyDest,
  specialtyCommodityFamily,
} from "./specialtyBoard";

/**
 * Commodity family for one Specialty lane chip, for coloring only.
 * 1) the label itself ("Yard Waste", "Recycle · Groot", "Recycle - Hodgkins")
 * 2) the Customers-book lane for this yard + destination
 * 3) the pickup catalog (stations.ts destinationsByCommodity)
 * Returns "" when it can't tell (chip keeps the default pink).
 */
export function specialtyChipFamily(
  stationId: string,
  stationName: string,
  label: string,
  lanes?: CustomerLaneStore,
): string {
  const parsed = parseSpecialtyLaneChip(label);
  if (parsed.family) return parsed.family;
  const dest = parsed.destination || label.trim();
  if (!dest) return "";
  if (lanes) {
    for (const lane of Object.values(lanes.lanes)) {
      if (isLaneStub(lane)) continue;
      if (!placesMatch(lane.customer, stationName)) continue;
      if (!placesMatch(lane.destination, dest) && !sameSpecialtyDest(lane.destination, dest)) {
        continue;
      }
      const family = specialtyCommodityFamily(lane.commodity);
      if (family) return family;
    }
  }
  const station = getStation(stationId) ?? getStation(resolveStationId(stationName));
  for (const [commodity, dests] of Object.entries(station?.destinationsByCommodity ?? {})) {
    if (!dests.some((d) => sameSpecialtyDest(d, dest))) continue;
    const family = specialtyCommodityFamily(commodity);
    if (family) return family;
  }
  return "";
}

const FAMILY_CLASS: Record<string, string> = {
  RECYCLE: " is-recycle",
  YARD: " is-yard",
  CARDBOARD: " is-cardboard",
  WOOD: " is-wood",
  "C&D": " is-cd",
};

export function specialtyChipToneClass(family: string): string {
  return FAMILY_CLASS[family] ?? "";
}
