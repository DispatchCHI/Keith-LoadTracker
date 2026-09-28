import { describe, expect, it } from "vitest";
import { formComplete, type FormState } from "../components/LoadForm";
import {
  emptyCustomerLaneStore,
  seededCustomerLaneStore,
} from "./customerLanes";
import {
  defaultStationCatalogRoute,
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
