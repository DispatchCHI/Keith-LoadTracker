import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addRosterEntry, emptyDriverRosterStore } from "./driverRoster";
import { computeAvailability } from "./driverDays";
import {
  chicagoFullRosterTally,
  chicagoSatRosterTally,
  dropOffsAlreadyUnavailable,
  liveSheetFromRoster,
  rosterOotNames,
} from "./rosterAvailability";
import { addVacationEntry, emptyVacationStore } from "./vacationBoard";

function rosterWith(
  rows: Array<{
    yard?: "burnham" | "rockford" | "pontiac" | "arc" | "zion";
    name: string;
    status?: string | null;
  }>,
) {
  let store = emptyDriverRosterStore();
  for (const row of rows) {
    store = addRosterEntry(store, {
      kind: "full",
      yard: row.yard ?? "burnham",
      name: row.name,
      status: row.status ?? null,
    }).store;
  }
  return store;
}

describe("chicago Full Roster available base", () => {
  it("sums hired − status − Vacation VAC across all yards", () => {
    const roster = rosterWith([
      { yard: "burnham", name: "Working One" },
      { yard: "burnham", name: "Glen Barker", status: "oot" },
      { yard: "rockford", name: "Working Two" },
      { yard: "zion", name: "Sergio Valadez", status: "wc" },
    ]);
    let vacation = emptyVacationStore();
    vacation = addVacationEntry(vacation, "2026-01-04", "Working Two", {
      yard: "rockford",
    }).store;
    const tally = chicagoFullRosterTally(roster, vacation, "2026-01-07");
    expect(tally).toEqual({ hired: 4, unavailable: 3, available: 1 });
  });

  it("does not subtract a call-off already marked out on the roster", () => {
    const roster = rosterWith([
      { name: "Glen Barker", status: "oot" },
      { name: "Dave Vanderbilt" },
    ]);
    const live = liveSheetFromRoster({
      roster,
      vacation: emptyVacationStore(),
      date: "2026-09-04",
      offs: [
        { name: "Glen Barker", start: "2026-09-04", end: null, reason: "Call Off" },
        { name: "Dave Vanderbilt", start: "2026-09-04", end: null, reason: "P-Day" },
      ],
      saturdayUsesWeekdayBase: false,
    });
    expect(live.base).toBe(1);
    expect(live.rosterTotal).toBe(2);
    expect(live.offs.map((row) => row.name)).toEqual(["Dave Vanderbilt"]);
    expect(computeAvailability(live, "2026-09-04")).toMatchObject({
      base: 1,
      offs: 1,
      available: 0,
      rosterTotal: 2,
    });
  });

  it("lists OOT names from Full Roster status, not a sheet L13 pull", () => {
    const roster = rosterWith([
      { yard: "burnham", name: "Glen Barker", status: "oot" },
      { yard: "rockford", name: "Ken Bryant", status: "wc" },
      { yard: "pontiac", name: "Randy Mesarchik", status: "oot" },
    ]);
    expect(rosterOotNames(roster)).toEqual(["Glen Barker", "Randy Mesarchik"]);
  });

  it("on Saturday uses Sat Roster remaining names, not Full Roster", () => {
    let roster = emptyDriverRosterStore();
    for (const row of [
      { kind: "full" as const, name: "Working One" },
      { kind: "full" as const, name: "Working Two" },
      { kind: "full" as const, name: "Out", status: "vac" },
      { kind: "full" as const, name: "Trimmed Off" },
    ]) {
      roster = addRosterEntry(roster, {
        kind: row.kind,
        yard: "burnham",
        name: row.name,
        status: row.status ?? null,
      }).store;
    }
    // Sat trimmed: only two of the four Full names remain.
    for (const name of ["Working One", "Out"]) {
      roster = addRosterEntry(roster, {
        kind: "sat",
        yard: "burnham",
        name,
      }).store;
    }
    const satDay = "2026-09-12"; // Saturday
    const weekday = "2026-09-11"; // Friday
    const satTally = chicagoSatRosterTally(roster, emptyVacationStore(), satDay);
    expect(satTally).toEqual({ hired: 2, unavailable: 1, available: 1 });

    const satLive = liveSheetFromRoster({
      roster,
      vacation: emptyVacationStore(),
      date: satDay,
      offs: [],
      saturdayUsesWeekdayBase: false,
    });
    expect(satLive.base).toBe(1);
    expect(satLive.rosterTotal).toBe(2);
    expect(satLive.saturdayUsesWeekdayBase).toBe(false);
    expect(computeAvailability(satLive, satDay)).toMatchObject({
      base: 1,
      available: 1,
      rosterTotal: 2,
    });

    // Callers must not force saturday-weekday on a normal Saturday — flag is clamped false.
    const forced = liveSheetFromRoster({
      roster,
      vacation: emptyVacationStore(),
      date: satDay,
      offs: [],
      saturdayUsesWeekdayBase: true,
    });
    expect(forced.saturdayUsesWeekdayBase).toBe(false);
    expect(forced.rosterTotal).toBe(2);
    expect(forced.base).toBe(1);

    const weekLive = liveSheetFromRoster({
      roster,
      vacation: emptyVacationStore(),
      date: weekday,
      offs: [],
      saturdayUsesWeekdayBase: true,
    });
    expect(weekLive.base).toBe(3);
    expect(weekLive.rosterTotal).toBe(4);
  });

  it("DriversContext never pulls Work-Dispatch or the call-off sheet", () => {
    const src = readFileSync(new URL("../store/DriversContext.tsx", import.meta.url), "utf8");
    expect(src).not.toContain("fetchDriverSnapshot");
    expect(src).not.toContain("readDriverCache");
    expect(src).not.toContain("calloffFetchUrl");
    expect(src).not.toContain("rosterFetchUrl");
    expect(src).not.toContain("saturdayBodyFetchUrl");
  });

  it("live snapshot helper does not fetch L13, Sat sums, or call-offs", () => {
    const src = readFileSync(new URL("./sheets.ts", import.meta.url), "utf8");
    expect(src).not.toContain("extractHeadcount");
    expect(src).not.toContain("export function rosterFetchUrl");
    expect(src).not.toContain("export function calloffFetchUrl");
    expect(src).not.toContain("export function saturdayFetchUrl");
    expect(src).not.toContain("export function saturdayBodyFetchUrl");
    expect(src).not.toMatch(/fetchText\(rosterFetchUrl/);
    expect(src).not.toMatch(/fetchText\(calloffFetchUrl/);
    expect(src).not.toMatch(/fetchText\(saturday/);
  });

  it("Analytics copy does not imply a Sat-yard sheet sum", () => {
    const src = readFileSync(new URL("../screens/AnalyticsScreen.tsx", import.meta.url), "utf8");
    expect(src).not.toContain("sat-yard sum");
    expect(src).toMatch(/Sat Roster/);
    expect(src).toMatch(/Full Roster/);
  });

  it("Available-drivers card uses rosterTotal, not the reduced working base", () => {
    const src = readFileSync(new URL("../components/DriversCard.tsx", import.meta.url), "utf8");
    expect(src).toContain("formatAvailableOutOf");
    expect(src).not.toMatch(/out of \$\{dayAvail\.base\}/);
    expect(src).toContain("Sat Roster");
    expect(src).toContain("sat names");
    expect(src).toContain("drivers");
    expect(src).toContain("Sat Roster empty");
  });

  it("DriversContext does not hardcode saturdayUsesWeekdayBase true on Saturdays", () => {
    const src = readFileSync(new URL("../store/DriversContext.tsx", import.meta.url), "utf8");
    expect(src).toContain("isChicagoSaturday");
    expect(src).toMatch(/saturdayUsesWeekdayBase:\s*!isChicagoSaturday/);
    expect(src).not.toMatch(/liveSheetFromRoster\(\{[\s\S]*?saturdayUsesWeekdayBase:\s*true/);
  });

  it("DriversContext always recomputes today — never returns stored today snapshot as-is", () => {
    const src = readFileSync(new URL("../store/DriversContext.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/if \(date === today\) return stored/);
    expect(src).toContain("lockedDayFromLiveSheet");
    expect(src).toContain("liveSheetFromRoster");
  });

  it("empty Sat Roster stays at 0 — never falls back to Full hired", () => {
    const roster = rosterWith([
      { name: "Full Only One" },
      { name: "Full Only Two" },
    ]);
    // No sat entries at all.
    const satDay = "2026-09-12";
    const live = liveSheetFromRoster({
      roster,
      vacation: emptyVacationStore(),
      date: satDay,
      offs: [],
      saturdayUsesWeekdayBase: true, // even if forced
    });
    expect(live.rosterTotal).toBe(0);
    expect(live.base).toBe(0);
    expect(live.saturdayUsesWeekdayBase).toBe(false);
    const full = chicagoFullRosterTally(roster, emptyVacationStore(), satDay);
    expect(full.hired).toBe(2);
    expect(live.rosterTotal).not.toBe(full.hired);
  });

  it("dev proxy has no Google Sheets roster paths", () => {
    const src = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
    expect(src).not.toContain("/sheets/roster-full/");
    expect(src).not.toContain("/sheets/roster-sat/");
    expect(src).not.toContain("/sheets/roster-gone");
    expect(src).not.toContain('"/sheets/offs"');
    expect(src).not.toContain("/sheets/sat-body/");
    expect(src).not.toContain('"/sheets/roster"');
    expect(src).not.toContain("DISPATCH_BOARD_PAGES_PATH");
    expect(src).not.toContain("docs.google.com");
    expect(src).not.toContain("spreadsheets.google.com");
  });

  it("dropOffsAlreadyUnavailable is a no-op when names do not match", () => {
    const leftover = dropOffsAlreadyUnavailable(
      [{ name: "Pablo Cruz", start: "2026-09-12", end: null, reason: "Call Off" }],
      [{ name: "Glen Barker" }],
    );
    expect(leftover).toHaveLength(1);
  });

  it("keeps available math on the reduced base and exposes hired as rosterTotal", () => {
    const roster = rosterWith(
      Array.from({ length: 162 }, (_, i) => ({
        yard: (["burnham", "rockford", "pontiac", "arc", "zion"] as const)[i % 5],
        name: `Driver ${i + 1}`,
        status: i < 23 ? "oot" : null,
      })),
    );
    const live = liveSheetFromRoster({
      roster,
      vacation: emptyVacationStore(),
      date: "2026-09-18",
      offs: [
        { name: "Driver 24", start: "2026-09-18", end: null, reason: "Call Off" },
        { name: "Driver 25", start: "2026-09-18", end: null, reason: "P-Day" },
        { name: "Driver 26", start: "2026-09-18", end: null, reason: "ok'd off" },
      ],
      saturdayUsesWeekdayBase: true,
    });
    expect(live.rosterTotal).toBe(162);
    expect(live.base).toBe(139);
    const day = computeAvailability(live, "2026-09-18");
    expect(day).toMatchObject({
      rosterTotal: 162,
      base: 139,
      offs: 3,
      available: 136,
    });
  });
});
