import { describe, expect, it } from "vitest";
import {
  commoditiesMatch,
  currentLanesByCustomer,
  mergeSeededLanes,
  placesMatch,
  rateForLoad,
  removeCustomerByName,
  seededCustomerLaneStore,
  upsertCustomerLane,
} from "./customerLanes";

describe("place matching", () => {
  it("treats DeKalb / Dekalb / dekalb as the same dest", () => {
    expect(placesMatch("DeKalb", "Dekalb")).toBe(true);
    expect(placesMatch("Melrose Trash Loads", "Melrose")).toBe(true);
    expect(placesMatch("Hooker Street", "Hooker")).toBe(true);
    expect(placesMatch("Rockford", "DeKalb")).toBe(false);
  });

  it("buckets Trash (MSW) together", () => {
    expect(commoditiesMatch("Trash (MSW)", "MSW")).toBe(true);
    expect(commoditiesMatch("Trash (MSW)", "Leachate (tanker)")).toBe(false);
  });
});

describe("seeded rate book", () => {
  const store = seededCustomerLaneStore();

  it("pays Melrose → DeKalb Trash at the current contract", () => {
    const lane = rateForLoad(store, "Melrose", "DeKalb", "Trash (MSW)", "2026-09-16");
    expect(lane?.tier1).toBe(114.57);
    expect(lane?.tier5).toBe(126.41);
  });

  it("does not invent pay for an unpriced dest", () => {
    expect(rateForLoad(store, "Melrose", "Covanta", "Trash (MSW)", "2026-09-16")).toBeNull();
    expect(rateForLoad(store, "LRS", "Pontiac", "Trash (MSW)", "2026-09-16")).toBeNull();
  });

  it("uses the newest contract that is already in force", () => {
    const next = upsertCustomerLane(store, {
      customer: "Melrose",
      destination: "DeKalb",
      commodity: "Trash (MSW)",
      effectiveDate: "2026-01-01",
      tier1: 200,
      tier2: 200,
      tier3: 200,
      tier4: 200,
      tier5: 200,
    }).store;
    expect(rateForLoad(next, "Melrose", "DeKalb", "Trash (MSW)", "2025-12-31")?.tier1).toBe(114.57);
    expect(rateForLoad(next, "Melrose", "DeKalb", "Trash (MSW)", "2026-01-01")?.tier1).toBe(200);
  });

  it("keeps unpriced shells so they show on Customers", () => {
    const names = currentLanesByCustomer(store, "2026-09-16").map((row) => row.customer);
    expect(names).toContain("LRS");
    expect(names).toContain("Ford");
    expect(names).toContain("Melrose");
  });
});

describe("removeCustomerByName", () => {
  it("removes every lane for the matching customer and returns ids", () => {
    const store = seededCustomerLaneStore();
    const before = Object.values(store.lanes).filter((lane) => lane.customer === "Melrose");
    expect(before.length).toBeGreaterThan(0);
    const { store: next, removedIds } = removeCustomerByName(store, "melrose");
    expect(removedIds.length).toBe(before.length);
    expect(Object.values(next.lanes).some((lane) => lane.customer === "Melrose")).toBe(false);
    expect(Object.values(next.lanes).some((lane) => lane.customer === "Batavia")).toBe(true);
    for (const id of removedIds) expect(next.lanes[id]).toBeUndefined();
  });

  it("is a no-op for unknown names", () => {
    const store = seededCustomerLaneStore();
    const { store: next, removedIds } = removeCustomerByName(store, "No Such Yard");
    expect(removedIds).toEqual([]);
    expect(Object.keys(next.lanes).length).toBe(Object.keys(store.lanes).length);
  });
});

describe("mergeSeededLanes tombstones", () => {
  it("does not resurrect a deleted customer from seed", () => {
    const store = seededCustomerLaneStore();
    const wiped = removeCustomerByName(store, "Melrose").store;
    const merged = mergeSeededLanes(wiped, undefined, ["Melrose"]);
    expect(Object.values(merged.lanes).some((lane) => lane.customer === "Melrose")).toBe(false);
    expect(Object.values(merged.lanes).some((lane) => lane.customer === "Batavia")).toBe(true);
  });
});

describe("upsertCustomerLane natural key", () => {
  it("updates existing lane when add matches natural key", () => {
    let store: CustomerLaneStore = { lanes: {} };
    const first = upsertCustomerLane(store, {
      customer: "GraysLake",
      destination: "CID",
      commodity: "Leachate (tanker)",
      effectiveDate: "2025-01-01",
      tier1: null,
    });
    store = first.store;
    const second = upsertCustomerLane(store, {
      customer: "GraysLake",
      destination: "CID",
      commodity: "Leachate (tanker)",
      effectiveDate: "2025-01-01",
      tier1: 155.21,
      tier2: 157.87,
      tier3: 160.57,
      tier4: 163.22,
      tier5: 171.26,
    });
    expect(second.lane?.id).toBe(first.lane?.id);
    expect(Object.keys(second.store.lanes)).toHaveLength(1);
    expect(second.lane?.tier1).toBe(155.21);
  });
});
