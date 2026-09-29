import { describe, expect, it } from "vitest";
import {
  cascadeCustomerLaneRoute,
  commoditiesForCustomer,
  commoditiesMatch,
  currentLanesByCustomer,
  defaultCustomerLaneRoute,
  destinationsForCustomer,
  mergeSeededLanes,
  laneDestinationsMatch,
  placesMatch,
  rateForLoad,
  removeCustomerByName,
  seededCustomerLaneStore,
  customersWithRealLanes,
  customersWithSpecialtyLanes,
  isSpecialtyBoardCommodity,
  upsertCustomerLane,
  type CustomerLaneStore,
} from "./customerLanes";

describe("place matching", () => {
  it("treats DeKalb / Dekalb / dekalb as the same dest", () => {
    expect(placesMatch("DeKalb", "Dekalb")).toBe(true);
    expect(placesMatch("Melrose Trash Loads", "Melrose")).toBe(true);
    expect(placesMatch("Hooker Street", "Hooker")).toBe(true);
    expect(placesMatch("Rockford", "DeKalb")).toBe(false);
  });

  it("does not treat DeKalb as Dekalb Sanitary", () => {
    expect(placesMatch("DeKalb", "Dekalb Sanitary")).toBe(true);
    expect(laneDestinationsMatch("DeKalb", "Dekalb")).toBe(true);
    expect(laneDestinationsMatch("DeKalb", "dekalb")).toBe(true);
    expect(laneDestinationsMatch("Dekalb San", "Dekalb Sanitary")).toBe(true);
    expect(laneDestinationsMatch("DeKalb", "Dekalb Sanitary")).toBe(false);
    expect(laneDestinationsMatch("Dekalb", "Rochelle WWTP")).toBe(false);
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

describe("customersWithRealLanes", () => {
  it("skips stubs and lists customers with a destination", () => {
    let store: CustomerLaneStore = { lanes: {} };
    store = upsertCustomerLane(store, {
      customer: "LRS",
      destination: "",
      commodity: "Trash (MSW)",
      effectiveDate: "2025-01-01",
    }).store;
    store = upsertCustomerLane(store, {
      customer: "GraysLake",
      destination: "CID",
      commodity: "Leachate (tanker)",
      effectiveDate: "2025-01-01",
      tier1: 155.21,
    }).store;
    expect(customersWithRealLanes(store)).toEqual(["GraysLake"]);
  });
});

describe("customersWithSpecialtyLanes", () => {
  it("keeps WF-class and leachate customers; skips trash-only", () => {
    let store: CustomerLaneStore = { lanes: {} };
    store = upsertCustomerLane(store, {
      customer: "Melrose",
      destination: "DeKalb",
      commodity: "Trash (MSW)",
      effectiveDate: "2025-01-01",
      tier1: 100,
    }).store;
    store = upsertCustomerLane(store, {
      customer: "GraysLake",
      destination: "CID",
      commodity: "Leachate (tanker)",
      effectiveDate: "2025-01-01",
      tier1: 155,
    }).store;
    store = upsertCustomerLane(store, {
      customer: "Wheeling",
      destination: "Hodgkins",
      commodity: "Recycle",
      effectiveDate: "2025-01-01",
      tier1: 90,
    }).store;
    store = upsertCustomerLane(store, {
      customer: "Northlake",
      destination: "Hodgkins",
      commodity: "Yard Waste",
      effectiveDate: "2025-01-01",
      tier1: 80,
    }).store;
    expect(isSpecialtyBoardCommodity("Trash (MSW)")).toBe(false);
    expect(isSpecialtyBoardCommodity("Leachate (tanker)")).toBe(true);
    expect(isSpecialtyBoardCommodity("Recycle")).toBe(true);
    expect(isSpecialtyBoardCommodity("Yard Waste")).toBe(true);
    expect(isSpecialtyBoardCommodity("Residual")).toBe(true);
    expect(customersWithSpecialtyLanes(store).sort()).toEqual([
      "GraysLake",
      "Northlake",
      "Wheeling",
    ]);
  });
});

describe("lane-book commodities and destinations", () => {
  it("lists only that customer's commodities and destinations", () => {
    const store = seededCustomerLaneStore();
    const commodities = commoditiesForCustomer(store, "Melrose", "2026-09-16");
    expect(commodities.length).toBeGreaterThan(0);
    expect(commodities.every((c) => typeof c === "string")).toBe(true);
    // Melrose trash goes to DeKalb in seed — not every station catalog dest
    const dests = destinationsForCustomer(store, "Melrose", "Trash (MSW)", "2026-09-16");
    expect(dests.some((d) => placesMatch(d, "DeKalb"))).toBe(true);
    expect(destinationsForCustomer(store, "Melrose", "Leachate (tanker)", "2026-09-16")).toEqual([]);
  });

  it("cascades commodity then destination from the lane book", () => {
    const store = seededCustomerLaneStore();
    const empty = cascadeCustomerLaneRoute(store, "Melrose", "", "", "2026-09-16");
    expect(empty.commodity).toBeTruthy();
    expect(empty.destination).toBeTruthy();
    const keep = cascadeCustomerLaneRoute(
      store,
      "Melrose",
      empty.commodity,
      empty.destination,
      "2026-09-16",
    );
    expect(commoditiesMatch(keep.commodity, empty.commodity)).toBe(true);
    expect(placesMatch(keep.destination, empty.destination)).toBe(true);
    const bad = cascadeCustomerLaneRoute(
      store,
      "Melrose",
      "Not A Real Commodity",
      "Nowhere",
      "2026-09-16",
    );
    expect(bad.commodity).toBe(empty.commodity);
    expect(placesMatch(bad.destination, empty.destination)).toBe(true);
  });

  it("ignores stubs and future effective dates", () => {
    let store: CustomerLaneStore = { lanes: {} };
    store = upsertCustomerLane(store, {
      customer: "Acme Yard",
      destination: "",
      commodity: "Trash (MSW)",
      effectiveDate: "2025-01-01",
    }).store;
    store = upsertCustomerLane(store, {
      customer: "Acme Yard",
      destination: "CID",
      commodity: "Recycle",
      effectiveDate: "2027-01-01",
      tier1: 50,
    }).store;
    store = upsertCustomerLane(store, {
      customer: "Acme Yard",
      destination: "Pontiac",
      commodity: "Yard Waste",
      effectiveDate: "2025-06-01",
      tier1: 70,
    }).store;
    expect(commoditiesForCustomer(store, "Acme Yard", "2026-09-16")).toEqual(["Yard Waste"]);
    expect(destinationsForCustomer(store, "Acme Yard", "Yard Waste", "2026-09-16")).toEqual([
      "Pontiac",
    ]);
  });
});

describe("defaultCustomerLaneRoute", () => {
  it("prefers Trash when there is no load history", () => {
    let store: CustomerLaneStore = { lanes: {} };
    store = upsertCustomerLane(store, {
      customer: "Arc",
      destination: "Organix",
      commodity: "Yard Waste",
      effectiveDate: "2025-01-01",
      tier1: 80,
    }).store;
    store = upsertCustomerLane(store, {
      customer: "Arc",
      destination: "Winnebago",
      commodity: "Trash (MSW)",
      effectiveDate: "2025-01-01",
      tier1: 100,
    }).store;
    store = upsertCustomerLane(store, {
      customer: "Arc",
      destination: "Hodgkins",
      commodity: "Recycle",
      effectiveDate: "2025-01-01",
      tier1: 90,
    }).store;
    const route = defaultCustomerLaneRoute(store, "Arc", "2026-09-16");
    expect(commoditiesMatch(route.commodity, "Trash (MSW)")).toBe(true);
    expect(placesMatch(route.destination, "Winnebago")).toBe(true);
  });

  it("defaults to the most-logged valid combo for that pickup", () => {
    let store: CustomerLaneStore = { lanes: {} };
    store = upsertCustomerLane(store, {
      customer: "Arc",
      destination: "Organix",
      commodity: "Yard Waste",
      effectiveDate: "2025-01-01",
      tier1: 80,
    }).store;
    store = upsertCustomerLane(store, {
      customer: "Arc",
      destination: "Winnebago",
      commodity: "Trash (MSW)",
      effectiveDate: "2025-01-01",
      tier1: 100,
    }).store;
    store = upsertCustomerLane(store, {
      customer: "Arc",
      destination: "Rockford",
      commodity: "Trash (MSW)",
      effectiveDate: "2025-01-01",
      tier1: 95,
    }).store;
    const loads = [
      { pickup: "Arc", commodity: "Yard Waste", destination: "Organix" },
      { pickup: "Arc", commodity: "Trash (MSW)", destination: "Winnebago" },
      { pickup: "Arc", commodity: "Trash (MSW)", destination: "Winnebago" },
      { pickup: "Arc", commodity: "Trash (MSW)", destination: "Rockford" },
      // Invalid / other pickup — ignored
      { pickup: "Arc", commodity: "Cardboard", destination: "DuPage" },
      { pickup: "Elgin", commodity: "Trash (MSW)", destination: "DeKalb" },
    ];
    const route = defaultCustomerLaneRoute(store, "Arc", "2026-09-16", loads);
    expect(commoditiesMatch(route.commodity, "Trash (MSW)")).toBe(true);
    expect(placesMatch(route.destination, "Winnebago")).toBe(true);
  });

  it("Elgin seed has Trash only — never invents Cardboard→DuPage", () => {
    const store = seededCustomerLaneStore();
    expect(commoditiesForCustomer(store, "Elgin", "2026-09-16")).toEqual([
      "Trash (MSW)",
    ]);
    expect(
      destinationsForCustomer(store, "Elgin", "Cardboard", "2026-09-16"),
    ).toEqual([]);
    expect(
      destinationsForCustomer(store, "Elgin", "Trash (MSW)", "2026-09-16").sort(),
    ).toEqual(["DeKalb", "Rockford"]);
    const route = defaultCustomerLaneRoute(store, "Elgin", "2026-09-16");
    expect(commoditiesMatch(route.commodity, "Trash (MSW)")).toBe(true);
    expect(["DeKalb", "Rockford"].some((d) => placesMatch(d, route.destination))).toBe(
      true,
    );
  });
});

describe("cascade prefers Trash when current commodity is invalid", () => {
  it("picks Trash over alphabetically-first Yard Waste", () => {
    let store: CustomerLaneStore = { lanes: {} };
    store = upsertCustomerLane(store, {
      customer: "Arc",
      destination: "Organix",
      commodity: "Yard Waste",
      effectiveDate: "2025-01-01",
      tier1: 80,
    }).store;
    store = upsertCustomerLane(store, {
      customer: "Arc",
      destination: "Winnebago",
      commodity: "Trash (MSW)",
      effectiveDate: "2025-01-01",
      tier1: 100,
    }).store;
    const route = cascadeCustomerLaneRoute(store, "Arc", "", "", "2026-09-16");
    expect(commoditiesMatch(route.commodity, "Trash (MSW)")).toBe(true);
    expect(placesMatch(route.destination, "Winnebago")).toBe(true);
  });
});

describe("Medill seed lanes (Log Load regression)", () => {
  it("is a real lane customer with station-catalog Trash and Yard dests", () => {
    const store = seededCustomerLaneStore();
    expect(customersWithRealLanes(store).some((n) => placesMatch(n, "Medill"))).toBe(
      true,
    );
    expect(commoditiesForCustomer(store, "Medill", "2026-09-28").sort()).toEqual([
      "Trash (MSW)",
      "Yard Waste",
    ]);
    expect(
      destinationsForCustomer(store, "Medill", "Trash (MSW)", "2026-09-28").sort(),
    ).toEqual(["Newton County", "Pontiac"]);
    expect(
      destinationsForCustomer(store, "Medill", "Yard Waste", "2026-09-28").sort(),
    ).toEqual(["Organix", "Willow Ranch"]);
    // Recycle stays empty — do not invent catalog leftovers.
    expect(
      destinationsForCustomer(store, "Medill", "Recycle", "2026-09-28"),
    ).toEqual([]);
    const route = defaultCustomerLaneRoute(store, "Medill", "2026-09-28", [
      { pickup: "Medill", commodity: "Trash (MSW)", destination: "Newton County" },
      { pickup: "Medill", commodity: "Trash (MSW)", destination: "Newton County" },
      { pickup: "Medill", commodity: "Trash (MSW)", destination: "Pontiac" },
    ]);
    expect(commoditiesMatch(route.commodity, "Trash (MSW)")).toBe(true);
    expect(placesMatch(route.destination, "Newton County")).toBe(true);
  });

  it("mergeSeededLanes upgrades an old Medill stub store with real routes", () => {
    let store: CustomerLaneStore = { lanes: {} };
    store = upsertCustomerLane(store, {
      customer: "Medill",
      destination: "",
      commodity: "Trash (MSW)",
      effectiveDate: "2021-01-01",
    }).store;
    expect(customersWithRealLanes(store)).toEqual([]);
    store = mergeSeededLanes(store);
    expect(customersWithRealLanes(store).some((n) => placesMatch(n, "Medill"))).toBe(
      true,
    );
    expect(
      destinationsForCustomer(store, "Medill", "Trash (MSW)", "2026-09-28"),
    ).toEqual(expect.arrayContaining(["Newton County", "Pontiac"]));
  });

  it("stub-only customers stay off the Log Load chip list (Custom path)", () => {
    const store = seededCustomerLaneStore();
    // LRS remains a stub in seed — Custom is how you log it until lanes exist.
    expect(customersWithRealLanes(store).some((n) => placesMatch(n, "LRS"))).toBe(
      false,
    );
  });
});
