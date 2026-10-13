import { describe, expect, it } from "vitest";
import { sortPickupsFixedOrder } from "./transferStationOrder";
describe("Transfer stations fixed order", () => {
  it("keeps the Oct 9 order regardless of counts; unknown sites A-Z at the end", () => {
    const rows = [
      { label: "Zeta Yard" }, { label: "Melrose" }, { label: "Apollo" },
      { label: "Northlake" }, { label: "Acme" }, { label: "Grayslake" },
    ];
    expect(sortPickupsFixedOrder(rows).map((r) => r.label)).toEqual([
      "Northlake", "Melrose", "Apollo", "Grayslake", "Acme", "Zeta Yard",
    ]);
  });
});
