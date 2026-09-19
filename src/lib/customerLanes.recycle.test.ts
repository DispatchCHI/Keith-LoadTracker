import { describe, expect, it } from "vitest";
import {
  commoditiesMatch,
  laneCommodityKey,
  rateForLoad,
  storeFromLanes,
  type CustomerLane,
} from "./customerLanes";

function lane(
  partial: Partial<CustomerLane> & Pick<CustomerLane, "id" | "customer" | "destination">,
): CustomerLane {
  return {
    commodity: "Walking Floor",
    effectiveDate: "2021-01-01",
    tier1: 97.08,
    tier2: 98.77,
    tier3: 100.42,
    tier4: 102.12,
    tier5: 107.13,
    createdAt: "2026-09-16T12:00:00.000Z",
    updatedAt: "2026-09-16T12:00:00.000Z",
    ...partial,
  };
}

describe("Recycle ↔ Walking Floor pay matching", () => {
  it("buckets Recycle with Walking Floor", () => {
    expect(laneCommodityKey("Recycle")).toBe("walking-floor");
    expect(commoditiesMatch("Recycle", "Walking Floor")).toBe(true);
  });

  it("rates Rockdale→Homewood Recycle from a Walking Floor lane", () => {
    const store = storeFromLanes([
      lane({ id: "r1", customer: "Rockdale", destination: "Homewood" }),
    ]);
    const hit = rateForLoad(store, "Rockdale", "Homewood", "Recycle", "2026-09-18");
    expect(hit?.tier1).toBe(97.08);
  });
});
