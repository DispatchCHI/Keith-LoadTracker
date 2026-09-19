import { describe, expect, it } from "vitest";
import { FREQUENT_STATION_IDS, STATIONS } from "../data/stations";
import {
  countPickupsByStationId,
  filterStationsByCustomerLanes,
  rankPickupChoices,
  rankPickupStations,
  unmatchedLaneCustomers,
} from "./pickupRank";

function load(stationId: string, pickup: string) {
  return { stationId, pickup };
}

describe("countPickupsByStationId", () => {
  it("counts stationId and pickup-name matches, skipping unmatched custom sites", () => {
    const counts = countPickupsByStationId([
      load("medill", "Medill"),
      load("medill", "Medill"),
      load("wheeling", "Wheeling"),
      load("custom", "Wheeling"),
      load("custom", "Mystery Yard"),
    ]);
    expect(counts.get("medill")).toBe(2);
    expect(counts.get("wheeling")).toBe(2);
    expect(counts.get("custom")).toBeUndefined();
    expect(counts.size).toBe(2);
  });
});

describe("rankPickupStations", () => {
  it("keeps frequent chips first when nothing is logged", () => {
    const ranked = rankPickupStations(STATIONS, []);
    expect(ranked.slice(0, FREQUENT_STATION_IDS.length).map((s) => s.id)).toEqual(
      STATIONS.filter((s) =>
        (FREQUENT_STATION_IDS as readonly string[]).includes(s.id),
      ).map((s) => s.id),
    );
    expect(ranked.map((s) => s.id).sort()).toEqual(
      [...STATIONS.map((s) => s.id)].sort(),
    );
  });

  it("lifts high-frequency pickups to the front of the visible grid", () => {
    const loads = [
      load("medill", "Medill"),
      load("medill", "Medill"),
      load("medill", "Medill"),
      load("wheeling", "Wheeling"),
      load("wheeling", "Wheeling"),
      load("apollo", "Apollo"),
    ];
    const ranked = rankPickupStations(STATIONS, loads);
    expect(ranked.slice(0, 3).map((s) => s.id)).toEqual([
      "medill",
      "wheeling",
      "apollo",
    ]);
    expect(ranked.map((s) => s.id)).toContain("melrose");
    expect(ranked).toHaveLength(STATIONS.length);
  });

  it("uses catalog order when frequencies tie", () => {
    const loads = [load("calumet", "Calumet"), load("apollo", "Apollo")];
    const ranked = rankPickupStations(STATIONS, loads);
    const calumet = STATIONS.findIndex((s) => s.id === "calumet");
    const apollo = STATIONS.findIndex((s) => s.id === "apollo");
    expect(calumet).toBeLessThan(apollo);
    expect(ranked.slice(0, 2).map((s) => s.id)).toEqual(["calumet", "apollo"]);
  });
});

describe("filterStationsByCustomerLanes", () => {
  it("keeps only stations that match lane customers", () => {
    const filtered = filterStationsByCustomerLanes(STATIONS, ["Melrose", "Batavia"]);
    expect(filtered.map((s) => s.name).sort()).toEqual(["Batavia", "Melrose"]);
  });

  it("lists lane customers with no catalog station", () => {
    expect(unmatchedLaneCustomers(["Acme Hauling", "Melrose"], STATIONS)).toEqual([
      "Acme Hauling",
    ]);
  });
});


describe("rankPickupChoices", () => {
  it("puts the most-used pickups first, including lane-only customers", () => {
    const stations = [
      { id: "melrose", name: "Melrose", commodities: [], destinations: [] },
      { id: "rockdale", name: "Rockdale", commodities: [], destinations: [] },
    ];
    const loads = [
      ...Array.from({ length: 5 }, (_, i) => ({
        stationId: "rockdale",
        pickup: "Rockdale",
        date: "2026-09-18",
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        stationId: "melrose",
        pickup: "Melrose",
        date: "2026-09-18",
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        stationId: "custom",
        pickup: "Freedman Seeding",
        date: "2026-09-18",
      })),
    ];
    const ranked = rankPickupChoices(
      stations as never,
      ["Freedman Seeding", "Quiet Yard"],
      loads,
      { asOf: "2026-09-19" },
    );
    expect(ranked.map((c) => (c.kind === "station" ? c.station.name : c.name))).toEqual([
      "Freedman Seeding",
      "Rockdale",
      "Melrose",
      "Quiet Yard",
    ]);
  });
});
