/**
 * Today "Transfer stations" card order: locked so sites don't move around day to day.
 * Taken from Fri Oct 9, 2026 (busiest first that day; ties A-Z). Edit freely.
 * Sites not listed go after these, A-Z.
 */
export const TRANSFER_STATION_ORDER: readonly string[] = [
  "Northlake",
  "Melrose",
  "Tri-State",
  "Arc",
  "Wheeling",
  "Batavia",
  "Schererville",
  "Hooker Street",
  "Apollo",
  "Calumet",
  "Roscoe",
  "Evanston",
  "GraysLake",
  "Medill",
  "Chicago Heights",
  "Liberty",
  "DeKalb",
  "LRS",
  "Elgin",
  "Rockdale",
  "Laraway",
  "Hodgkins",
  "Citiwaste",
  "WoodLand RDF",
  "Ford",
  "Kankakee RDF",
  "Midway LF",
];

function stationOrderKey(label: string): string {
  return label.trim().toLowerCase().replace(/[\s.'-]+/g, "");
}

const TRANSFER_STATION_RANK = new Map(
  TRANSFER_STATION_ORDER.map((name, index) => [stationOrderKey(name), index]),
);

/** Fixed Today-card order (see TRANSFER_STATION_ORDER); unknown sites A-Z at the end. */
export function sortPickupsFixedOrder<T extends { label: string }>(rows: readonly T[]): T[] {
  const rank = (row: T) => TRANSFER_STATION_RANK.get(stationOrderKey(row.label)) ?? Infinity;
  return [...rows].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.label.localeCompare(b.label);
  });
}
