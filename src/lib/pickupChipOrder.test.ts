import { describe, expect, it } from "vitest";
import { collapsePickupGrid, layoutPickupGrid } from "./pickupChipOrder";

const id = (s: string) => s;
const live = [
  "Medill","Calumet","Apollo","LRS","Schererville","Arc","NorthLake","Melrose","Liberty","Dekalb",
  "Prairie Hill RFD","GraysLake","Laraway","Batavia","Elgin","Evanston","Hooker Street","Wheeling",
  "Tri-State","Citiwaste","Roscoe","Rockdale","McCook","Ford","Hodgkins","Hearthside","Chicago Heights",
  "Crown Point","East Chicago","Kankakee RDF","Midway LF","Planet/WM","Settler's Hill RDF",
  "Virginia RD","Wheatland RDF","WoodLand RDF",
];

describe("layoutPickupGrid (1.1.51)", () => {
  const cols = layoutPickupGrid(live, id);
  it("keeps columns 1 and 2 in the locked order, spelling tolerant", () => {
    expect(cols[0]).toEqual(["Medill","Calumet","Hooker Street","Chicago Heights","Schererville","Apollo","LRS","Tri-State","Rockdale"]);
    expect(cols[1]).toEqual(["Melrose","NorthLake","Arc","Batavia","Elgin","Liberty","Roscoe","Hodgkins","Ford"]);
  });
  it("puts Wheeling, Evanston, Dekalb then overflow in 3 and 4, balanced", () => {
    expect(cols[2]!.slice(0, 8)).toEqual(["Wheeling","Evanston","Dekalb","Laraway","GraysLake","Midway LF","Wheatland RDF","WoodLand RDF"]);
    expect(cols[2]).toHaveLength(9);
    expect(cols[3]).toEqual(["Crown Point","East Chicago","Hearthside","Kankakee RDF","McCook","Planet/WM","Prairie Hill RFD","Settler's Hill RDF","Virginia RD"]);
    expect(cols.flat()).toHaveLength(live.length);
  });
  it("collapses to 4 rows with N computed live", () => {
    const shown = collapsePickupGrid(cols).flat().length;
    expect(shown).toBe(16);
    expect(live.length - shown).toBe(20);
  });
  it("skips fixed names that are not in the app and never drops a pickup", () => {
    const few = layoutPickupGrid(["Zeta", "Apollo", "Alpha"], id);
    expect(few[0]).toEqual(["Apollo"]);
    expect(few.flat().sort()).toEqual(["Alpha", "Apollo", "Zeta"]);
  });
});