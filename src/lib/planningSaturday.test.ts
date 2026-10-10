import { describe, expect, it } from "vitest";
import {
  addRosterEntry,
  isStalePlanningSaturday,
  planningSaturdayForYard,
  resetSatRosterFromFull,
  satDateForYard,
  setSatDateForYard,
  type DriverRosterStore,
} from "./driverRoster";
import { readFileSync } from "node:fs";

function satStore(dates: (string | null)[]): DriverRosterStore {
  let store: DriverRosterStore = { entries: {} };
  dates.forEach((forDate, index) => {
    store = addRosterEntry(store, {
      kind: "sat",
      yard: "burnham",
      truckNumber: String(1000 + index),
      name: `Driver ${index}`,
      sortOrder: index,
      forDate,
    }).store;
  });
  return store;
}

describe("Planning Saturday", () => {
  const friday = "2026-10-09";

  it("ignores a saved date before the coming Saturday and uses the coming Saturday", () => {
    const store = satStore(["2026-09-19", "2026-09-19"]);
    expect(satDateForYard(store, "burnham")).toBe("2026-09-19");
    expect(satDateForYard(store, "burnham", { today: friday })).toBeNull();
    expect(planningSaturdayForYard(store, "burnham", friday)).toBe("2026-10-10");
  });

  it("keeps an explicitly chosen future Saturday", () => {
    const store = satStore(["2026-10-17"]);
    expect(planningSaturdayForYard(store, "burnham", friday)).toBe("2026-10-17");
    expect(planningSaturdayForYard(satStore(["2026-10-10"]), "burnham", "2026-10-10")).toBe("2026-10-10");
    expect(planningSaturdayForYard(satStore(["2026-10-10"]), "burnham", "2026-10-11")).toBe("2026-10-17");
  });

  it("latest row date wins so one stale row cannot drag the yard back", () => {
    const store = satStore(["2026-09-19", "2026-10-10", null]);
    expect(planningSaturdayForYard(store, "burnham", friday)).toBe("2026-10-10");
  });

  it("stale check is relative to Chicago today", () => {
    expect(isStalePlanningSaturday("2026-09-19", friday)).toBe(true);
    expect(isStalePlanningSaturday("2026-10-10", friday)).toBe(false);
  });

  it("setSatDateForYard still saves a chosen date on every row", () => {
    const store = setSatDateForYard(satStore(["2026-09-19", "2026-09-19"]), "burnham", "2026-10-10");
    expect(Object.values(store.entries).every((entry) => entry.forDate === "2026-10-10")).toBe(true);
  });

  it("Reset with the effective date does not carry a stale date onto fresh rows", () => {
    let store = satStore(["2026-09-19"]);
    store = addRosterEntry(store, { kind: "full", yard: "burnham", truckNumber: "2000", name: "Full Driver" }).store;
    const reset = resetSatRosterFromFull(store, "burnham", {
      forDate: satDateForYard(store, "burnham", { today: friday }),
    });
    const sat = Object.values(reset.store.entries).filter((entry) => entry.kind === "sat");
    expect(sat.length).toBeGreaterThan(0);
    expect(sat.every((entry) => entry.forDate == null)).toBe(true);
  });

  it("Driver screen and Reset use the effective (stale-ignoring) date", () => {
    const screen = readFileSync("src/screens/DriverScreen.tsx", "utf8");
    expect(screen).toContain("satDateForYard(store, yard, { today })");
    expect(screen).toContain("satDateForYard(store, item, { today })");
    const ctx = readFileSync("src/store/DriverRosterContext.tsx", "utf8");
    expect(ctx).toMatch(/resetSatRosterFromFull\(storeRef\.current, yard, \{\s*forDate: satDateForYard\(storeRef\.current, yard, \{ today: chicagoToday\(\) \}\)/);
  });
});
