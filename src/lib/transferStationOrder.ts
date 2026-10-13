/**
 * Today "Transfer stations" card: locked positions (Keith's layout), never by load count.
 * Edit these three columns (top to bottom). Listed sites always show (0 / 0 when idle)
 * so nothing shifts; any other site goes after them, A-Z.
 */
export const TRANSFER_STATION_COLUMNS: readonly (readonly string[])[] = [
  ["Melrose", "Arc", "Medill", "GraysLake", "Hodgkins", "LRS", "Evanston", "Calumet", "Ford"],
  ["Wheeling", "Hooker Street", "Schererville", "Apollo", "Liberty", "Chicago Heights", "Laraway", "Midway LF", "National Container"],
  ["Northlake", "Tri-State", "Batavia", "Elgin", "DeKalb", "Rockdale", "Roscoe", "Wheatland RDF", "WoodLand RDF"],
];

/** The 3-column grid fills left-to-right, so interleave columns into row order. */
export const TRANSFER_STATION_ORDER: readonly string[] = (() => {
  const out: string[] = [];
  const rows = Math.max(...TRANSFER_STATION_COLUMNS.map((c) => c.length));
  for (let r = 0; r < rows; r++) {
    for (const col of TRANSFER_STATION_COLUMNS) if (col[r]) out.push(col[r]);
  }
  return out;
})();

function stationOrderKey(label: string): string {
  return label.trim().toLowerCase().replace(/[\s.'-]+/g, "");
}

type Row = { key: string; label: string; count: number; trashCount: number; custom?: boolean };

/** Fixed slots first (zero rows for idle listed sites), then unlisted sites A-Z. */
export function sortPickupsFixedOrder<T extends Row>(rows: readonly T[]): T[] {
  const byKey = new Map(rows.map((row) => [stationOrderKey(row.label), row]));
  const out: T[] = [];
  for (const name of TRANSFER_STATION_ORDER) {
    const k = stationOrderKey(name);
    const hit = byKey.get(k);
    out.push(hit ?? ({ key: name, label: name, count: 0, trashCount: 0 } as T));
    byKey.delete(k);
  }
  return out.concat([...byKey.values()].sort((a, b) => a.label.localeCompare(b.label)));
}
