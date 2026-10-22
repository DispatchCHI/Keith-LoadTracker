import { describe, expect, it } from "vitest";
import { payForLoad, weekPayForDriver } from "./loadPay";
import type { Load } from "../types";
import type { CustomerLaneStore } from "./customerLanes";

const lanes = {
  version: 1,
  lanes: {
    a: {
      id: "a", customer: "Tri-State", destination: "Liberty", commodity: "Trash (MSW)",
      effectiveDate: "2021-01-01", tier1: 136.36, tier2: 138.71, tier3: 141.06, tier4: 143.41, tier5: 150.46,
    },
  },
} as unknown as CustomerLaneStore;
const load = (id: string, name: string): Load =>
  ({
    id, truck: "2206", pickup: "Tri-State", destination: "Liberty", commodity: "Trash (MSW)",
    stationId: "tri-state", date: "2026-10-22", createdAt: "2026-10-22T13:14:00Z", driverName: name,
  }) as Load;

describe("1.1.48 driver with no start date still gets paid (Tier 1)", () => {
  it("TKeyton Abrams, no start date: two Tri-State -> Liberty trash loads = 2 x T1", () => {
    const w = weekPayForDriver({
      loads: [load("1", "TKeyton Abrams"), load("2", "tkeyton  abrams ")],
      lanes, driverName: "TKeyton Abrams", hireDate: null, asOf: "2026-10-22",
    });
    expect(w.totalCents).toBe(27272);
    expect(w.assumedTier1).toBe(true);
  });
  it("with a start date the real tier is used", () => {
    expect(payForLoad(load("1", "x"), lanes, "2020-01-01")?.tier).toBe(5);
    expect(payForLoad(load("1", "x"), lanes, null)?.tier).toBe(1);
  });
  it("Bob Jones and Bob Jones Jr stay separate", () => {
    const loads = [load("1", "Bob Jones"), load("2", "Bob Jones Jr")];
    const w = weekPayForDriver({ loads, lanes, driverName: "Bob Jones", hireDate: null, asOf: "2026-10-22" });
    expect(w.loadCount ?? w.days.reduce((n, d) => n + d.loads, 0)).toBe(1);
  });
});
