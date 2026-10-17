/**
 * Today "Transfer stations" card (Keith's layout, 1.1.40).
 * LOCKED: always shown in a fixed slot, even at 0 / 0, so nothing shifts.
 * FLOATING: shown only on days with loads, appended under Evanston in column 3
 * (preferred order below), then any other site with loads, A-Z.
 * Names match by normalized key (case, spaces, punctuation, LF/RDF suffix), so
 * "NorthLake" = "Northlake", "Midway" = "Midway LF". Display labels are never renamed.
 */
export const TRANSFER_STATION_COLUMNS: readonly (readonly string[])[] = [
  ["Medill", "Calumet", "Hooker Street", "Chicago Heights", "Schererville", "Apollo", "LRS", "Tri-State", "Rockdale"],
  ["Melrose", "Northlake", "Arc", "Batavia", "Elgin", "Roscoe", "Liberty", "Hodgkins", "Ford"],
  ["Wheeling", "Evanston"],
];

/** Shown only when they have loads that day, in this order, under Evanston. */
export const TRANSFER_STATION_FLOATING: readonly string[] = [
  "Laraway",
  "National Container",
  "DeKalb",
  "GraysLake",
  "Midway",
  "Wheatland",
  "Woodland",
];

const STATION_KEY_ALIASES: Readonly<Record<string, string>> = {
  cheights: "chicagoheights",
  hooker: "hookerstreet",
};

export function stationOrderKey(label: string): string {
  const base = label.trim().toLowerCase().replace(/\s+(lf|rdf|landfill)\.?$/, "");
  const key = base.replace(/[^a-z0-9]+/g, "");
  return STATION_KEY_ALIASES[key] ?? key;
}

/** Locked sites in grid (row-major) order, for reference. */
export const TRANSFER_STATION_ORDER: readonly string[] = (() => {
  const out: string[] = [];
  const rows = Math.max(...TRANSFER_STATION_COLUMNS.map((c) => c.length));
  for (let r = 0; r < rows; r++) {
    for (const col of TRANSFER_STATION_COLUMNS) if (col[r]) out.push(col[r]);
  }
  return out;
})();

type Row = { key: string; label: string; count: number; trashCount: number; custom?: boolean };

/** Three columns: locked slots (zero rows when idle), floating + other sites with loads under column 3. */
export function transferStationColumns<T extends Row>(rows: readonly T[]): T[][] {
  const pool = new Map<string, T[]>();
  for (const row of rows) {
    const k = stationOrderKey(row.label);
    const list = pool.get(k);
    if (list) list.push(row);
    else pool.set(k, [row]);
  }
  const take = (name: string): T | undefined => {
    const k = stationOrderKey(name);
    const list = pool.get(k);
    if (!list?.length) return undefined;
    const hit = list.shift();
    if (!list.length) pool.delete(k);
    return hit;
  };
  const cols = TRANSFER_STATION_COLUMNS.map((col) =>
    col.map((name) => take(name) ?? ({ key: name, label: name, count: 0, trashCount: 0 } as T)),
  );
  const last = cols[cols.length - 1];
  for (const name of TRANSFER_STATION_FLOATING) {
    const hit = take(name);
    if (hit && hit.count > 0) last.push(hit);
  }
  const rest = [...pool.values()]
    .flat()
    .filter((row) => row.count > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
  last.push(...rest);
  return cols;
}

/** Grid cells for the 3-column card, row by row; null = blank slot (column 3 runs longer/shorter). */
export function transferStationCells<T extends Row>(rows: readonly T[]): (T | null)[] {
  const cols = transferStationColumns(rows);
  const height = Math.max(...cols.map((c) => c.length));
  const out: (T | null)[] = [];
  for (let r = 0; r < height; r++) for (const col of cols) out.push(col[r] ?? null);
  return out;
}

/** Every row the card shows (locked + floating with loads), column by column. */
export function sortPickupsFixedOrder<T extends Row>(rows: readonly T[]): T[] {
  return transferStationColumns(rows).flat();
}
