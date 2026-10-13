import { describe, expect, it } from "vitest";
import { sortPickupsFixedOrder, TRANSFER_STATION_ORDER } from "./transferStationOrder";
const row = (label: string, count: number) => ({ key: label, label, count, trashCount: 0 });
describe("Transfer stations fixed order", () => {
  it("fills Keith's columns in grid order, ignores counts, unknown sites A-Z last", () => {
    expect(TRANSFER_STATION_ORDER.slice(0, 6)).toEqual(["Melrose", "Wheeling", "Northlake", "Arc", "Hooker Street", "Tri-State"]);
    const out = sortPickupsFixedOrder([row("Zeta Yard", 50), row("Northlake", 1), row("Melrose", 3), row("Acme", 9), row("Grayslake", 2)]);
    expect(out.slice(0, 3).map((r) => r.label)).toEqual(["Melrose", "Wheeling", "Northlake"]);
    expect(out[1].count).toBe(0);
    expect(out.find((r) => r.label === "Grayslake")?.count).toBe(2);
    expect(out.slice(-2).map((r) => r.label)).toEqual(["Acme", "Zeta Yard"]);
    expect(out).toHaveLength(TRANSFER_STATION_ORDER.length + 2);
  });
});
