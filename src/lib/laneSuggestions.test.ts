import { describe, expect, it } from "vitest";
import { suggestLanesForDriver, workingDaysBetween } from "./laneSuggestions";
import { makeRosterNameResolver } from "./rosterVacation";
import type { Load } from "../types";

let n = 0;
const load = (driverName: string, date: string, destination: string, pickup = "Wheeling"): Load =>
  ({ id: `l${n++}`, truck: "2769", pickup, commodity: "MSW", destination, stationId: "wheeling", date, createdAt: date, updatedAt: date, driverName }) as Load;

// Wed Oct 28 2026 (log date can be tomorrow / "Not today").
const today = "2026-10-28";
const resolve = makeRosterNameResolver(["Robert Jones", "Robert Jones Jr.", "Tim Rozzoni", "Rolando Rogers"]);
const dests = (out: { destination: string }[]) => out.map((l) => l.destination);

describe("workingDaysBetween", () => {
  it("skips Sundays", () => {
    expect(workingDaysBetween("2026-10-27", "2026-10-28")).toBe(1);
    expect(workingDaysBetween("2026-10-24", "2026-10-26")).toBe(1); // Sat -> Mon
    expect(workingDaysBetween("2026-10-28", "2026-10-28")).toBe(0);
  });
});

describe("suggestLanesForDriver (1.1.52 recent-first)", () => {
  it("last few days beat last week even when last week was far more frequent", () => {
    const loads = [
      // last week: Northlake -> Pontiac x5, Kent -> Pontiac x3 (stale)
      ...Array.from({ length: 5 }, () => load("Rolando Rogers", "2026-10-20", "Pontiac", "Northlake")),
      ...Array.from({ length: 3 }, () => load("Rolando Rogers", "2026-10-21", "Pontiac", "Kent")),
      // this week
      load("Rolando Rogers", "2026-10-27", "RSI", "Elgin"),
      load("Rolando Rogers", "2026-10-26", "Homewood", "Batavia"),
      load("Rolando Rogers", "2026-10-26", "Homewood", "Batavia"),
    ];
    const out = suggestLanesForDriver({ loads, driverName: "Rolando Rogers", today, resolveName: resolve });
    expect(dests(out)).toEqual(["Homewood", "RSI", "Pontiac"]);
    expect(out.slice(0, 2).every((l) => l.recent)).toBe(true);
    expect(out[2].recent).toBe(false); // thin recent history -> frequent fallback fills slot 3
    expect(out[2].pickup).toBe("Northlake");
  });

  it("recent window is relative to the log date, and caps at 3", () => {
    const loads = [
      load("Tim Rozzoni", "2026-10-27", "A"),
      load("Tim Rozzoni", "2026-10-27", "B"),
      load("Tim Rozzoni", "2026-10-26", "C"),
      load("Tim Rozzoni", "2026-10-26", "C"),
      load("Tim Rozzoni", "2026-10-24", "D"),
      load("Tim Rozzoni", "2026-10-23", "E"),
    ];
    const out = suggestLanesForDriver({ loads, driverName: "Tim Rozzoni", today, resolveName: resolve });
    expect(out).toHaveLength(3);
    expect(out.every((l) => l.recent)).toBe(true);
  });

  it("uses the longer window only to fill; older than 30 days never shows", () => {
    const loads = [
      load("Tim Rozzoni", "2026-10-02", "CID"),
      load("Tim Rozzoni", "2026-10-01", "CID"),
      load("Tim Rozzoni", "2026-09-10", "Old"),
    ];
    const out = suggestLanesForDriver({ loads, driverName: "Tim Rozzoni", today });
    expect(dests(out)).toEqual(["CID"]);
    expect(out[0].count).toBe(2);
    expect(suggestLanesForDriver({ loads, driverName: null, today })).toEqual([]);
  });

  it("keeps Robert Jones and Robert Jones Jr. apart", () => {
    const loads = [load("Robert Jones Jr.", "2026-10-27", "CID"), load("Robert Jones", "2026-10-27", "Prairie Hill")];
    expect(dests(suggestLanesForDriver({ loads, driverName: "Robert Jones", today, resolveName: resolve }))).toEqual(["Prairie Hill"]);
    expect(dests(suggestLanesForDriver({ loads, driverName: "Robert Jones Jr.", today, resolveName: resolve }))).toEqual(["CID"]);
  });

  it("closed lanes stay visible and keep their recency order (flag only)", () => {
    const loads = [load("Tim Rozzoni", "2026-10-27", "Prairie Hill"), load("Tim Rozzoni", "2026-10-24", "CID")];
    const out = suggestLanesForDriver({ loads, driverName: "Tim Rozzoni", today, isClosed: (l) => l.destination === "Prairie Hill" });
    expect(out.map((l) => [l.destination, l.closed])).toEqual([["Prairie Hill", true], ["CID", false]]);
  });
});