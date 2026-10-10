import { describe, expect, it } from "vitest";
import { addRosterEntry, emptyDriverRosterStore } from "./driverRoster";
import { resolveDuplicateAssignedTrucks } from "./rosterAssignedTruck";

describe("duplicate unit resolution uses real instants", () => {
  it("picks the same keeper whichever desk's timestamp format it sees", () => {
    let store = emptyDriverRosterStore();
    const a = addRosterEntry(store, { kind: "full", yard: "burnham", truckNumber: "1", name: "Al One", assignedTruck: "418" } as never, { id: "a-row" });
    store = a.store;
    const b = addRosterEntry(store, { kind: "full", yard: "burnham", truckNumber: "2", name: "Bo Two", assignedTruck: "418" } as never, { id: "b-row" });
    store = b.store;
    const sameInstant = (zFor: string) => ({
      entries: {
        "a-row": { ...store.entries["a-row"], assignedTruck: "418", updatedAt: zFor === "a" ? "2026-10-09T20:00:00.000Z" : "2026-10-09T20:00:00.000000+00:00" },
        "b-row": { ...store.entries["b-row"], assignedTruck: "418", updatedAt: zFor === "b" ? "2026-10-09T20:00:00.000Z" : "2026-10-09T20:00:00.000000+00:00" },
      },
    });
    const one = resolveDuplicateAssignedTrucks(sameInstant("a"), "2026-10-09T21:00:00.000Z");
    const two = resolveDuplicateAssignedTrucks(sameInstant("b"), "2026-10-09T21:00:00.000Z");
    expect(one.cleared.map((row) => row.id)).toEqual(two.cleared.map((row) => row.id));
    expect(one.cleared).toHaveLength(1);
  });
});