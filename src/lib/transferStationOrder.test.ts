import { describe, expect, it } from "vitest";
import {
  sortPickupsFixedOrder,
  stationOrderKey,
  transferStationCells,
  transferStationColumns,
  TRANSFER_STATION_COLUMNS,
} from "./transferStationOrder";
const row = (label: string, count: number, trashCount = 0) => ({ key: label, label, count, trashCount });
const labels = (rows: { label: string }[]) => rows.map((r) => r.label);

describe("Transfer stations lock/float layout", () => {
  it("locked columns always show in fixed order, even at 0", () => {
    const cols = transferStationColumns([]);
    expect(labels(cols[0])).toEqual(["Medill", "Calumet", "Hooker Street", "Chicago Heights", "Schererville", "Apollo", "LRS", "Tri-State", "Rockdale"]);
    expect(labels(cols[1])).toEqual(["Melrose", "Northlake", "Arc", "Batavia", "Elgin", "Roscoe", "Liberty", "Hodgkins", "Ford"]);
    expect(labels(cols[2])).toEqual(["Wheeling", "Evanston"]);
    expect(cols.flat().every((r) => r.count === 0)).toBe(true);
  });

  it("floating sites appear under Evanston only with loads, preferred order then A-Z; labels kept", () => {
    const cols = transferStationColumns([
      row("Zeta Yard", 50),
      row("WoodLand RDF", 1),
      row("Midway LF", 2),
      row("Laraway", 3),
      row("Acme", 9),
      row("Grayslake", 2),
      row("NorthLake", 4, 4),
      row("Medill", 7, 2),
    ]);
    expect(labels(cols[2])).toEqual(["Wheeling", "Evanston", "Laraway", "Grayslake", "Midway LF", "WoodLand RDF", "Acme", "Zeta Yard"]);
    expect(cols[1][1]).toMatchObject({ label: "NorthLake", count: 4, trashCount: 4 });
    expect(cols[0][0]).toMatchObject({ label: "Medill", count: 7 });
    expect(cols[0]).toHaveLength(9);
    expect(cols[1]).toHaveLength(9);
  });

  it("idle floating sites are hidden; National Container / Dekalb / Wheatland float in order", () => {
    const cols = transferStationColumns([row("Wheatland", 1), row("Dekalb", 2), row("National Container", 1), row("Laraway", 0)]);
    expect(labels(cols[2])).toEqual(["Wheeling", "Evanston", "National Container", "Dekalb", "Wheatland"]);
  });

  it("normalizes spellings and aliases", () => {
    expect(stationOrderKey("NorthLake")).toBe(stationOrderKey("Northlake"));
    expect(stationOrderKey("Hooker")).toBe(stationOrderKey("Hooker Street"));
    expect(stationOrderKey("C. Heights")).toBe(stationOrderKey("Chicago Heights"));
    expect(stationOrderKey("Midway LF")).toBe("midway");
    expect(stationOrderKey("Tri State")).toBe(stationOrderKey("Tri-State"));
  });

  it("grid cells fill row by row with blanks so column 3 floats stack under Evanston", () => {
    const few = transferStationCells([row("Laraway", 1)]);
    expect(few).toHaveLength(27);
    expect(few.slice(0, 3).map((c) => c?.label)).toEqual(["Medill", "Melrose", "Wheeling"]);
    expect(few[5]?.label).toBe("Evanston");
    expect(few[8]?.label).toBe("Laraway");
    expect(few[11]).toBeNull();
    const many = Array.from({ length: 10 }, (_, i) => row(`Other ${String.fromCharCode(65 + i)}`, 1));
    const cells = transferStationCells(many);
    expect(cells).toHaveLength(12 * 3);
    expect(cells[27]).toBeNull();
    expect(cells[29]?.label).toBe("Other H");
    expect(cells[35]?.label).toBe("Other J");
  });

  it("flat list includes every shown row once and nothing hides a duplicate spelling", () => {
    const out = sortPickupsFixedOrder([row("Grayslake", 1), row("GraysLake", 2), row("Melrose", 3)]);
    const locked = TRANSFER_STATION_COLUMNS.flat().length;
    expect(out).toHaveLength(locked + 2);
    expect(out.filter((r) => /grays/i.test(r.label)).map((r) => r.count).sort()).toEqual([1, 2]);
    expect(sortPickupsFixedOrder(out)).toEqual(out);
  });
});
