import { describe, expect, it } from "vitest";
import { addRosterEntry, emptyDriverRosterStore } from "./driverRoster";
import {
  driverTimeOffRows,
  formatTimeOffDays,
  formatTimeOffWhen,
  loadsForDriverName,
  searchFullRosterDrivers,
} from "./driverSearch";
import type { CallOffLogEntry } from "./callOffLog";
import { addVacationEntry, emptyVacationStore } from "./vacationBoard";
import type { Load } from "../types";

function log(
  name: string,
  start: string,
  reason: string,
  end: string | null = null,
): CallOffLogEntry {
  return {
    id: `${name}-${start}-${reason}`,
    name,
    start,
    end,
    reason,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function hire(name: string, emp: string, truck: string) {
  return addRosterEntry(emptyDriverRosterStore(), {
    kind: "full",
    yard: "burnham",
    name,
    truckNumber: emp,
    assignedTruck: truck,
  }).store;
}

describe("searchFullRosterDrivers", () => {
  it("matches a partial name or an employee number on the full roster", () => {
    let store = hire("Devell Nutall", "575", "1994");
    store = addRosterEntry(store, {
      kind: "full",
      yard: "rockford",
      name: "Dave Vanderbilt",
      truckNumber: "56",
      assignedTruck: "2748",
    }).store;
    store = addRosterEntry(store, {
      kind: "sat",
      yard: "burnham",
      name: "Devell Nutall",
      truckNumber: "575",
    }).store;

    expect(searchFullRosterDrivers(store, "dev").map((row) => row.name)).toEqual([
      "Devell Nutall",
    ]);
    expect(searchFullRosterDrivers(store, "575").map((row) => row.name)).toEqual([
      "Devell Nutall",
    ]);
    expect(searchFullRosterDrivers(store, "dave").map((row) => row.yard)).toEqual(["rockford"]);
  });
});

describe("driver time off", () => {
  it("lists the year newest first and marks the current vacation week", () => {
    const vacation = addVacationEntry(emptyVacationStore(), "2026-09-27", "Devell Nutall", {
      id: "vac-devell",
      yard: "chicago",
    }).store;
    const rows = driverTimeOffRows({
      name: "Devell Nutall",
      year: 2026,
      logRows: [
        log("Devell Nutall", "2026-09-12", "P-Day"),
        log("Devell Nutall", "2026-08-21", "Call Off"),
        log("Devell Nutall", "2026-07-08", "ok'd off", "2026-07-09"),
        log("Devell Nutall", "2025-03-03", "Late/Early"),
      ],
      manuals: {
        "2026-09-12": [{ name: "Devell Nutall", kind: "p-day" }],
        "2026-06-02": [{ name: "Devell Nutall", kind: "call-off" }],
      },
      vacation,
    });

    expect(rows.map((row) => row.reason)).toEqual([
      "Vacation",
      "P-Day",
      "Call Off",
      "ok'd off",
      "Call Off",
    ]);
    expect(formatTimeOffWhen(rows[0].start, rows[0].end)).toBe("Sep 27 - Oct 3");
    expect(formatTimeOffDays(rows[0].start, rows[0].end, "2026-10-02")).toBe("This week");
    expect(formatTimeOffDays("2026-07-08", "2026-07-09", "2026-10-02")).toBe("2");
    expect(formatTimeOffWhen("2026-09-12", "2026-09-12")).toBe("Sep 12");
  });
});

describe("loadsForDriverName", () => {
  it("returns the newest loads for that driver", () => {
    const loads = [
      { id: "old", date: "2026-09-11", createdAt: "2026-09-11T12:00:00.000Z", driverName: "Devell Nutall" },
      { id: "new", date: "2026-09-16", createdAt: "2026-09-16T12:00:00.000Z", driverName: "Devell Nutall" },
      { id: "other", date: "2026-09-20", createdAt: "2026-09-20T12:00:00.000Z", driverName: "Dave Vanderbilt" },
    ] as Load[];
    expect(loadsForDriverName(loads, "Devell Nutall").map((load) => load.id)).toEqual([
      "new",
      "old",
    ]);
  });
});
