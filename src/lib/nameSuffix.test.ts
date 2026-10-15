import { describe, expect, it } from "vitest";
import { makeRosterNameResolver, nameBelongsToDriver, rosterNamesMatch } from "./rosterVacation";
import { allotmentForName } from "./rosterAllotment";
import { weekPayForDriver } from "./loadPay";
import { emptyCustomerLaneStore } from "./customerLanes";

const roster = ["Bob Jones", "Bob Jones Jr", "Tim Rozzoni"];

describe("Bob Jones (Rockford) vs Bob Jones Jr (Burnham)", () => {
  it("suffixes are significant", () => {
    expect(rosterNamesMatch("Bob Jones", "Bob Jones Jr")).toBe(false);
    expect(rosterNamesMatch("Bob Jones Jr.", "Bob Jones Jr")).toBe(true);
    expect(rosterNamesMatch("Bob Jones Sr", "Bob Jones Jr")).toBe(false);
    expect(rosterNamesMatch("Bob Jones III", "Bob Jones")).toBe(false);
    expect(rosterNamesMatch("Robert Jones Jr", "Bob Jones Jr")).toBe(rosterNamesMatch("Robert Jones", "Bob Jones"));
  });

  it("exact name wins; ambiguous fuzzy names count for nobody", () => {
    const resolve = makeRosterNameResolver(roster);
    expect(resolve("Bob Jones")).toBe("Bob Jones");
    expect(resolve("bob jones jr")).toBe("Bob Jones Jr");
    expect(nameBelongsToDriver("Bob Jones", "Bob Jones Jr", resolve)).toBe(false);
    expect(nameBelongsToDriver("Bob Jones Jr", "Bob Jones", resolve)).toBe(false);
    const twins = makeRosterNameResolver(["Jon Smithe", "Jon Smithy"]);
    expect(twins("Jon Smith")).toBeNull();
  });

  it("weekly pay attributes each load to exactly one driver", () => {
    const lanes = emptyCustomerLaneStore();
    const resolve = makeRosterNameResolver(roster);
    const loads = [
      { id: "a", date: "2026-10-13", driverName: "Bob Jones", truck: "2769", createdAt: "x" },
      { id: "b", date: "2026-10-13", driverName: "Bob Jones Jr", truck: "3100", createdAt: "x" },
      { id: "c", date: "2026-10-14", driverName: "Bob Jones Jr", truck: "3100", createdAt: "x" },
    ] as never[];
    const sr = weekPayForDriver({ loads, lanes, driverName: "Bob Jones", hireDate: null, asOf: "2026-10-14", resolveName: resolve });
    const jr = weekPayForDriver({ loads, lanes, driverName: "Bob Jones Jr", hireDate: null, asOf: "2026-10-14", resolveName: resolve });
    expect(sr.loadCount).toBe(1);
    expect(jr.loadCount).toBe(2);
  });

  it("P-Day / Call-off / OK'd Off stay with the right driver", () => {
    const resolve = makeRosterNameResolver(roster);
    const uses = [
      { name: "Bob Jones Jr", kind: "call-off" },
      { name: "Bob Jones", kind: "p-day" },
    ] as never[];
    expect(allotmentForName("Bob Jones", uses, resolve).callOffUsed).toBe(0);
    expect(allotmentForName("Bob Jones", uses, resolve).pDayUsed).toBe(1);
    expect(allotmentForName("Bob Jones Jr", uses, resolve).callOffUsed).toBe(1);
    expect(allotmentForName("Bob Jones Jr", uses, resolve).pDayUsed).toBe(0);
  });
});
