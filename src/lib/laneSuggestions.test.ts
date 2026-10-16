import { describe, expect, it } from "vitest";
import { suggestLanesForDriver } from "./laneSuggestions";
import { makeRosterNameResolver } from "./rosterVacation";
import type { Load } from "../types";

let n = 0;
const load = (driverName: string, date: string, destination: string, pickup = "Wheeling"): Load =>
  ({ id: `l${n++}`, truck: "2769", pickup, commodity: "MSW", destination, stationId: "wheeling", date, createdAt: date, updatedAt: date, driverName }) as Load;

const today = "2026-10-16";
const resolve = makeRosterNameResolver(["Robert Jones", "Robert Jones Jr.", "Tim Rozzoni"]);

describe("suggestLanesForDriver", () => {
  it("recency beats raw count and caps at 3", () => {
    const loads = [
      ...Array.from({ length: 3 }, () => load("Tim Rozzoni", "2026-09-05", "Old Landfill")),
      load("Tim Rozzoni", "2026-10-15", "Prairie Hill"),
      load("Tim Rozzoni", "2026-10-14", "Prairie Hill"),
      load("Tim Rozzoni", "2026-10-10", "CID"),
      load("Tim Rozzoni", "2026-10-01", "Kankakee"),
      load("Tim Rozzoni", "2026-09-28", "Reworld"),
    ];
    const out = suggestLanesForDriver({ loads, driverName: "Tim Rozzoni", today, resolveName: resolve });
    expect(out.map((l) => l.destination)).toEqual(["Prairie Hill", "CID", "Kankakee"]);
    expect(out[0].count).toBe(2);
  });

  it("ignores loads outside the window and empty history", () => {
    const loads = [load("Tim Rozzoni", "2026-07-01", "CID")];
    expect(suggestLanesForDriver({ loads, driverName: "Tim Rozzoni", today })).toEqual([]);
    expect(suggestLanesForDriver({ loads, driverName: null, today })).toEqual([]);
  });

  it("keeps Robert Jones and Robert Jones Jr. apart", () => {
    const loads = [load("Robert Jones Jr.", "2026-10-15", "CID"), load("Robert Jones", "2026-10-15", "Prairie Hill")];
    expect(suggestLanesForDriver({ loads, driverName: "Robert Jones", today, resolveName: resolve }).map((l) => l.destination)).toEqual(["Prairie Hill"]);
    expect(suggestLanesForDriver({ loads, driverName: "Robert Jones Jr.", today, resolveName: resolve }).map((l) => l.destination)).toEqual(["CID"]);
  });

  it("closed lanes sort last but stay visible", () => {
    const loads = [load("Tim Rozzoni", "2026-10-15", "Prairie Hill"), load("Tim Rozzoni", "2026-10-01", "CID")];
    const out = suggestLanesForDriver({ loads, driverName: "Tim Rozzoni", today, isClosed: (l) => l.destination === "Prairie Hill" });
    expect(out.map((l) => [l.destination, l.closed])).toEqual([["CID", false], ["Prairie Hill", true]]);
  });
});
