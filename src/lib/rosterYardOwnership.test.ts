import { describe, expect, it } from "vitest";
import { addRosterEntry, emptyDriverRosterStore, updateRosterEntry } from "./driverRoster";
import { enforceOneYardPerDriver } from "./rosterYardOwnership";

describe("enforceOneYardPerDriver", () => {
  it("keeps Jovan Morris on Zion and drops Arc copies", () => {
    let store = emptyDriverRosterStore();
    store = addRosterEntry(store, {
      kind: "full",
      yard: "arc",
      truckNumber: "40100",
      name: "Jovan Morris",
    }).store;
    store = addRosterEntry(store, {
      kind: "full",
      yard: "zion",
      truckNumber: "40100",
      name: "Jovan Morris",
    }).store;
    store = addRosterEntry(store, {
      kind: "sat",
      yard: "arc",
      truckNumber: "40100",
      name: "Jovan Morris",
    }).store;

    const result = enforceOneYardPerDriver(store);
    const leftover = Object.values(result.store.entries);
    expect(leftover).toHaveLength(1);
    expect(leftover[0]?.yard).toBe("zion");
    expect(leftover[0]?.kind).toBe("full");
    expect(result.removed.some((row) => row.yard === "arc")).toBe(true);
  });

  it("does not let the same employee number live on two yards", () => {
    let store = emptyDriverRosterStore();
    store = addRosterEntry(store, {
      kind: "full",
      yard: "burnham",
      truckNumber: "56",
      name: "Dave Vanderbilt",
    }).store;
    store = addRosterEntry(store, {
      kind: "full",
      yard: "rockford",
      truckNumber: "56",
      name: "Different Name Same Emp",
    }).store;
    const result = enforceOneYardPerDriver(store);
    expect(Object.keys(result.store.entries)).toHaveLength(1);
  });

  it("keeps a newer truck clear over an older yard copy that still has the unit", () => {
    let store = addRosterEntry(
      emptyDriverRosterStore(),
      {
        kind: "full",
        yard: "rockford",
        truckNumber: "56",
        assignedTruck: "418",
        name: "Dave Vanderbilt",
      },
      { id: "old", at: "2026-09-01T00:00:00.000Z", createdAt: "2026-08-01T00:00:00.000Z" },
    ).store;
    store = addRosterEntry(
      store,
      {
        kind: "full",
        yard: "burnham",
        truckNumber: "56",
        assignedTruck: "418",
        name: "Dave Vanderbilt",
      },
      { id: "cleared", at: "2026-09-01T00:00:00.000Z", createdAt: "2026-08-01T00:00:00.000Z" },
    ).store;
    store = updateRosterEntry(store, "cleared", { assignedTruck: null }, "2026-09-03T00:00:00.000Z");
    const result = enforceOneYardPerDriver(store);
    const kept = Object.values(result.store.entries).filter((row) => row.kind === "full");
    expect(kept.map((row) => row.id)).toEqual(["cleared"]);
    expect(kept[0]?.assignedTruck).toBeNull();
  });
});
