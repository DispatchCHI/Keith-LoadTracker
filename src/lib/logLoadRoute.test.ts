import { describe, expect, it } from "vitest";
import { destinationsFor } from "../data/stations";
import { formComplete, type FormState } from "../components/LoadForm";
import {
  emptyCustomerLaneStore,
  laneDestinationsMatch,
  seededCustomerLaneStore,
  upsertCustomerLane,
} from "./customerLanes";
import {
  commodityChipsForLogLoad,
  defaultStationCatalogRoute,
  destinationAfterCommoditySelect,
  destinationChipsForLogLoad,
  routeForPickupSelect,
} from "./logLoadRoute";

describe("defaultStationCatalogRoute", () => {
  it("prefers Trash + first dest for Medill", () => {
    expect(defaultStationCatalogRoute("medill")).toEqual({
      commodity: "Trash (MSW)",
      destination: "Pontiac",
    });
  });

  it("fills Apollo transfer station from catalog", () => {
    const route = defaultStationCatalogRoute("apollo");
    expect(route.commodity).toBe("Trash (MSW)");
    expect(route.destination.trim()).toBeTruthy();
    expect(route.destination).not.toBe("Other...");
  });
});

describe("routeForPickupSelect enables Save after common pickup", () => {
  it("seeded Medill → formComplete without hunting chips", () => {
    const route = routeForPickupSelect({
      stationId: "medill",
      pickupName: "Medill",
      store: seededCustomerLaneStore(),
      asOf: "2026-09-28",
      loads: [],
    });
    expect(route.commodity.trim()).toBeTruthy();
    expect(route.destination.trim()).toBeTruthy();
    const form: FormState = {
      truck: "6473",
      stationId: "medill",
      pickup: "Medill",
      commodity: route.commodity,
      destination: route.destination,
    };
    expect(formComplete(form)).toBe(true);
  });

  it("empty lane book still catalog-fills Medill → formComplete", () => {
    const route = routeForPickupSelect({
      stationId: "medill",
      pickupName: "Medill",
      store: emptyCustomerLaneStore(),
      asOf: "2026-09-28",
      loads: [],
    });
    expect(route).toEqual({
      commodity: "Trash (MSW)",
      destination: "Pontiac",
    });
    const form: FormState = {
      truck: "101",
      stationId: "medill",
      pickup: "Medill",
      commodity: route.commodity,
      destination: route.destination,
    };
    expect(formComplete(form)).toBe(true);
  });

  it("empty lane book catalog-fills Apollo transfer station → formComplete", () => {
    const route = routeForPickupSelect({
      stationId: "apollo",
      pickupName: "Apollo",
      store: emptyCustomerLaneStore(),
      asOf: "2026-09-28",
    });
    expect(route.commodity).toBe("Trash (MSW)");
    expect(route.destination.trim()).toBeTruthy();
    const form: FormState = {
      truck: "55",
      stationId: "apollo",
      pickup: "Apollo",
      commodity: route.commodity,
      destination: route.destination,
    };
    expect(formComplete(form)).toBe(true);
  });

  it("uses most-logged lane combo when history exists", () => {
    const route = routeForPickupSelect({
      stationId: "medill",
      pickupName: "Medill",
      store: seededCustomerLaneStore(),
      asOf: "2026-09-28",
      loads: [
        {
          pickup: "Medill",
          commodity: "Trash (MSW)",
          destination: "Newton County",
        },
        {
          pickup: "Medill",
          commodity: "Trash (MSW)",
          destination: "Newton County",
        },
        {
          pickup: "Medill",
          commodity: "Trash (MSW)",
          destination: "Pontiac",
        },
      ],
    });
    expect(route).toEqual({
      commodity: "Trash (MSW)",
      destination: "Newton County",
    });
  });
});

describe("Prairie Hill RFD Yard Waste chips", () => {
  function prairieHillStore() {
    let store = emptyCustomerLaneStore();
    store = upsertCustomerLane(store, {
      customer: "Prairie Hill RFD",
      destination: "DeKalb",
      commodity: "Yard Waste",
      effectiveDate: "2021-01-01",
      tier1: 40,
    }).store;
    store = upsertCustomerLane(store, {
      customer: "Prairie Hill RFD",
      destination: "Dekalb Sanitary",
      commodity: "Leachate (tanker)",
      effectiveDate: "2021-01-01",
    }).store;
    store = upsertCustomerLane(store, {
      customer: "Prairie Hill RFD",
      destination: "Rochelle WWTP",
      commodity: "Leachate (tanker)",
      effectiveDate: "2021-01-01",
    }).store;
    store = upsertCustomerLane(store, {
      customer: "Prairie Hill RFD",
      destination: "Dixon WWTP",
      commodity: "Leachate (tanker)",
      effectiveDate: "2021-01-01",
    }).store;
    store = upsertCustomerLane(store, {
      customer: "Prairie Hill RFD",
      destination: "CID",
      commodity: "Leachate (tanker)",
      effectiveDate: "2021-01-01",
    }).store;
    return store;
  }

  it("shows only the Yard Waste customer lane, not the station catalog", () => {
    const store = prairieHillStore();
    const asOf = "2026-09-29";
    const catalogDestinations = destinationsFor("prairie-hill-rfd", "Yard Waste");
    expect(catalogDestinations).toEqual([
      "Rochelle WWTP",
      "Dixon WWTP",
      "CID",
      "Dekalb Sanitary",
      "Dekalb",
    ]);

    expect(
      commodityChipsForLogLoad({
        laneBookPickup: "Prairie Hill RFD",
        store,
        asOf,
        catalogCommodities: ["Leachate (tanker)", "Yard Waste", "Trash (MSW)"],
      }).sort(),
    ).toEqual(["Leachate", "Yard Waste"]);

    const chips = destinationChipsForLogLoad({
      laneBookPickup: "Prairie Hill RFD",
      commodity: "Yard Waste",
      store,
      asOf,
      catalogDestinations,
    });
    expect(chips).toEqual(["DeKalb"]);
    expect(chips.filter((chip) => laneDestinationsMatch("DeKalb", chip))).toEqual([
      "DeKalb",
    ]);
    expect(chips.some((chip) => laneDestinationsMatch("Dekalb Sanitary", chip))).toBe(
      false,
    );
  });

  it("does not invent catalog commodities or destinations for a Yard Waste-only lane", () => {
    let store = emptyCustomerLaneStore();
    store = upsertCustomerLane(store, {
      customer: "Prairie Hill RFD",
      destination: "DeKalb",
      commodity: "Yard Waste",
      effectiveDate: "2021-01-01",
      tier1: 40,
    }).store;
    const asOf = "2026-09-29";
    expect(
      commodityChipsForLogLoad({
        laneBookPickup: "Prairie Hill RFD",
        store,
        asOf,
        catalogCommodities: ["Leachate (tanker)", "Yard Waste"],
      }),
    ).toEqual(["Yard Waste"]);
    const chips = destinationChipsForLogLoad({
      laneBookPickup: "Prairie Hill RFD",
      commodity: "Yard Waste",
      store,
      asOf,
      catalogDestinations: destinationsFor("prairie-hill-rfd", "Yard Waste"),
    });
    expect(chips).toEqual(["DeKalb"]);
    const next = destinationAfterCommoditySelect({
      stationId: "prairie-hill-rfd",
      pickupName: "Prairie Hill RFD",
      commodity: "Yard Waste",
      currentDestination: "Dekalb Sanitary",
      store,
      asOf,
      laneBookPickup: "Prairie Hill RFD",
    });
    expect(next).toBe("DeKalb");
    expect(chips.filter((chip) => laneDestinationsMatch(next, chip))).toEqual(["DeKalb"]);
  });

  it("narrows leachate destinations to those lanes and keeps one selection", () => {
    const store = prairieHillStore();
    const chips = destinationChipsForLogLoad({
      laneBookPickup: "Prairie Hill RFD",
      commodity: "Leachate (tanker)",
      store,
      asOf: "2026-09-29",
      catalogDestinations: destinationsFor("prairie-hill-rfd", "Leachate (tanker)"),
    });
    expect(chips).toEqual(["CID", "Dekalb Sanitary", "Dixon WWTP", "Rochelle WWTP"]);
    expect(
      destinationChipsForLogLoad({
        laneBookPickup: "Prairie Hill RFD",
        commodity: "Leachate",
        store,
        asOf: "2026-09-29",
        catalogDestinations: destinationsFor("prairie-hill-rfd"),
      }),
    ).toEqual(chips);
    const selected = chips.filter((chip) => laneDestinationsMatch("DeKalb", chip));
    expect(selected).toEqual([]);
    expect(
      chips.filter((chip) => laneDestinationsMatch("Dekalb Sanitary", chip)),
    ).toEqual(["Dekalb Sanitary"]);
  });

  it("still uses the station catalog when the pickup is not on the lane book", () => {
    const chips = destinationChipsForLogLoad({
      laneBookPickup: null,
      commodity: "Yard Waste",
      store: emptyCustomerLaneStore(),
      asOf: "2026-09-29",
      catalogDestinations: destinationsFor("prairie-hill-rfd", "Yard Waste"),
    });
    expect(chips).toContain("Rochelle WWTP");
    expect(chips).toContain("Dekalb");
  });

  it("defaults Prairie Hill RFD to the most-used Yard Waste → DeKalb lane", () => {
    const route = routeForPickupSelect({
      stationId: "prairie-hill-rfd",
      pickupName: "Prairie Hill RFD",
      store: prairieHillStore(),
      asOf: "2026-09-29",
      loads: [
        {
          pickup: "Prairie Hill RFD",
          commodity: "Yard Waste",
          destination: "DeKalb",
        },
        {
          pickup: "Prairie Hill RFD",
          commodity: "Yard Waste",
          destination: "Dekalb",
        },
        {
          pickup: "Prairie Hill RFD",
          commodity: "Leachate (tanker)",
          destination: "Dekalb Sanitary",
        },
      ],
    });
    expect(route).toEqual({
      commodity: "Yard Waste",
      destination: "DeKalb",
    });
  });
});
