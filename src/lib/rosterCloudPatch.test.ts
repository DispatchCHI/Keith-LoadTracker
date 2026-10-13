import { describe, expect, it } from "vitest";
import type { DriverRosterEntry, DriverRosterStore } from "./driverRoster";
import { onlyRowsCloudStillHas } from "./rosterCloudPatch";

function row(over: Partial<DriverRosterEntry> = {}): DriverRosterEntry {
  return {
    id: "64b817fa-4032-52b8-b359-425913ff36f4",
    kind: "full",
    yard: "rockford",
    truckNumber: "31147",
    assignedTruck: null,
    name: "Buddy Johnson",
    status: null,
    hireDate: "2016-03-09",
    phone: null,
    sortOrder: 0,
    forDate: null,
    createdAt: "2026-09-14T12:00:00.000Z",
    updatedAt: "2026-09-20T03:53:30.000Z",
    ...over,
  };
}

function store(...rows: DriverRosterEntry[]): DriverRosterStore {
  return { entries: Object.fromEntries(rows.map((r) => [r.id, r])) } as DriverRosterStore;
}

describe("field-patch uploads only for rows the cloud still has", () => {
  it("does not re-upload a row another desk deleted", () => {
    const deletedElsewhere = row();
    const remote = store();
    expect(onlyRowsCloudStillHas([deletedElsewhere], remote, new Set())).toEqual([]);
  });

  it("still patches rows the cloud has and brand-new local rows", () => {
    const inCloud = row({ id: "a" });
    const brandNew = row({ id: "b" });
    const out = onlyRowsCloudStillHas([inCloud, brandNew], store(inCloud), new Set(["b"]));
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
