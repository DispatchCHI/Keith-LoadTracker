import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DriverGoneEntry } from "./driverGone";
import type { DriverRosterEntry, DriverRosterStore } from "./driverRoster";
import { searchAssignableDrivers, trucksNeedingDriver } from "./truckAssignPrompt";

let n = 0;
function full(over: Partial<DriverRosterEntry>): DriverRosterEntry {
  n += 1;
  return {
    id: `id-${n}`,
    kind: "full",
    yard: "rockford",
    truckNumber: null,
    assignedTruck: null,
    name: "Driver",
    status: null,
    hireDate: "2020-01-01",
    phone: null,
    sortOrder: n,
    forDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function store(...rows: DriverRosterEntry[]): DriverRosterStore {
  return { entries: Object.fromEntries(rows.map((r) => [r.id, r])) } as DriverRosterStore;
}

const maria = full({ name: "Maria Lopez", truckNumber: "30210", assignedTruck: "207" });
const mark = full({ name: "Mark Mills", truckNumber: "30555" });
const buddy = full({ name: "Buddy Johnson", truckNumber: "31147", hireDate: "2016-03-09" });
const sat = { ...full({ name: "Sat Only", truckNumber: "40000" }), kind: "sat" as const };
const roster = store(maria, mark, buddy, sat);
const gone: DriverGoneEntry[] = [
  {
    id: "g1",
    employeeNumber: "31147",
    name: "Buddy Johnson",
    hireDate: "2016-03-09",
    terminationDate: "2026-09-01",
    notes: null,
    yard: "rockford",
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
  } as DriverGoneEntry,
];

describe("trucksNeedingDriver", () => {
  it("prompts only for company units nobody has", () => {
    expect(trucksNeedingDriver(roster, ["207", "2181", "VZ", "CGH", "214"])).toEqual([
      "2181",
      "214",
    ]);
  });

  it("never prompts for broker / sub codes", () => {
    expect(trucksNeedingDriver(roster, ["VZ", "G2", "AB12"])).toEqual([]);
  });
});

describe("searchAssignableDrivers", () => {
  it("matches name prefixes and EMP #", () => {
    expect(searchAssignableDrivers(roster, gone, "ma").map((r) => r.name)).toEqual([
      "Maria Lopez",
      "Mark Mills",
    ]);
    expect(searchAssignableDrivers(roster, gone, "30555").map((r) => r.name)).toEqual([
      "Mark Mills",
    ]);
    expect(searchAssignableDrivers(roster, gone, "mi").map((r) => r.name)).toEqual([
      "Mark Mills",
    ]);
  });

  it("leaves out Gone drivers and Sat rows", () => {
    expect(searchAssignableDrivers(roster, gone, "buddy")).toEqual([]);
    expect(searchAssignableDrivers(roster, [], "buddy").map((r) => r.name)).toEqual([
      "Buddy Johnson",
    ]);
    expect(searchAssignableDrivers(roster, gone, "sat")).toEqual([]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchAssignableDrivers(roster, gone, "  ")).toEqual([]);
  });
});

describe("Log Load truck step wiring", () => {
  const log = readFileSync(new URL("../screens/LogLoadScreen.tsx", import.meta.url), "utf8");
  const prompt = readFileSync(
    new URL("../components/TruckAssignPrompt.tsx", import.meta.url),
    "utf8",
  );

  it("assigns through the same roster path as the Drivers page", () => {
    expect(log).toMatch(/setDriverAssignedTruck\(entry\.id, assignQueue\.trucks\[0\]\)/);
    expect(log).toMatch(/trucksNeedingDriver\(rosterStore, trucks\)/);
  });

  it("is keyboard friendly: Enter assigns, Esc skips", () => {
    expect(prompt).toMatch(/e\.key === "Enter"/);
    expect(prompt).toMatch(/e\.key === "Escape"[\s\S]*onSkip\(\)/);
    expect(prompt).toMatch(/Skip/);
  });
});
