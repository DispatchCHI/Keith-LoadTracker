import { beforeEach, describe, expect, it } from "vitest";
import { addStationCallYard, stationCallYards } from "./stationCalls";
import {
  addedRowHint,
  customersForCallYard,
  endOfDaySummary,
  looseNameMatch,
} from "./totals";
import type { Load } from "../types";

function load(pickup: string, extra: Partial<Load> = {}): Load {
  return {
    id: `${pickup}-${Math.random()}`,
    truck: "418",
    pickup,
    commodity: "Trash (MSW)",
    destination: "Rockford",
    stationId: "custom",
    date: "2026-11-03",
    createdAt: "2026-11-03T12:00:00.000Z",
    updatedAt: "2026-11-03T12:00:00.000Z",
    ...extra,
  } as Load;
}

const customers = ["Groen Brothers", "Melrose Park Recycling", "Acme Hauling"];

describe("a newly added Load Count row tallies its pickup automatically", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
        clear: () => data.clear(),
      },
    });
  });

  it("shows Groen's dispatched total, ignoring case and spelling", () => {
    const yard = addStationCallYard("Groen");
    expect(yard).not.toBeNull();
    const loads = [
      load("Groen"),
      load("GROEN"),
      load("groen brothers"),
      load("Groenn"), // one typo
      load("Wheeling", { stationId: "wheeling", destination: "Groot" }),
    ];
    const eod = endOfDaySummary(loads, {}, { customerNames: customers });
    const row = eod.stations.find((s) => s.label === "Groen");
    expect(row?.pickedUp).toBe(4);
    expect(row?.msw).toBe(4);
    expect(row?.added).toBe(true);
    expect(row?.customers).toEqual(["Groen Brothers"]);
    expect(row?.linked).toBe(true);
    // Built-in rows are unchanged, and the Wheeling load is not stolen by Groen.
    expect(eod.stations.find((s) => s.id === "wheeling")?.pickedUp).toBe(1);
    expect(stationCallYards().some((y) => y.label === "Groen")).toBe(true);
  });

  it("works for any new row name, not just Groen", () => {
    const yard = addStationCallYard("Acme Hauling");
    expect(yard).not.toBeNull();
    const eod = endOfDaySummary([load("acme hauling"), load("ACME  Hauling")], {}, {
      customerNames: customers,
    });
    expect(eod.stations.find((s) => s.label === "Acme Hauling")?.pickedUp).toBe(2);
  });

  it("flags a new row that matches no customer instead of leaving a silent blank", () => {
    const yard = addStationCallYard("Zebra Disposal")!;
    const eod = endOfDaySummary([load("Melrose", { stationId: "melrose" })], {}, {
      customerNames: customers,
    });
    const row = eod.stations.find((s) => s.id === yard.id);
    expect(row?.pickedUp).toBe(0);
    expect(row?.linked).toBe(false);
    expect(addedRowHint(yard, customers)).toContain("no customer");
    expect(addedRowHint({ id: "groen", label: "Groen" }, customers)).toBeNull();
  });

  it("matches loosely without merging look-alike places", () => {
    expect(looseNameMatch("Groen", "groen brothers")).toBe(true);
    expect(looseNameMatch("C. Heights", "cheights")).toBe(true);
    expect(looseNameMatch("Groen", "Groot")).toBe(false);
    expect(looseNameMatch("Arc", "Arcadia")).toBe(false);
    expect(customersForCallYard({ id: "groen", label: "Groen" }, customers)).toEqual([
      "Groen Brothers",
    ]);
  });
});