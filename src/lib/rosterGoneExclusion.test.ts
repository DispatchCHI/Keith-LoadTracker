import { describe, expect, it } from "vitest";
import type { DriverGoneEntry } from "./driverGone";
import type { DriverRosterEntry, DriverRosterStore } from "./driverRoster";
import {
  fullRowsOnGone,
  goneEntriesForPerson,
  goneEntryForFullRow,
  onlyRowsCloudStillHas,
  withoutGoneFullRows,
} from "./rosterGoneExclusion";

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

const buddyGone: DriverGoneEntry = {
  id: "38e17270-8937-4999-ac91-ed59d23b7725",
  employeeNumber: "31147",
  name: "Buddy Johnson",
  hireDate: "2016-03-09",
  terminationDate: "2026-09-01",
  notes: null,
  yard: "rockford",
  createdAt: "2026-09-25T12:00:00.000Z",
  updatedAt: "2026-09-25T12:00:00.000Z",
} as DriverGoneEntry;

function store(...rows: DriverRosterEntry[]): DriverRosterStore {
  return { entries: Object.fromEntries(rows.map((r) => [r.id, r])) } as DriverRosterStore;
}

describe("Gone list keeps people off the Full Roster", () => {
  it("matches a terminated driver by emp #", () => {
    expect(goneEntryForFullRow(row(), [buddyGone])?.id).toBe(buddyGone.id);
    expect(fullRowsOnGone(store(row()), [buddyGone]).map((r) => r.id)).toEqual([row().id]);
  });

  it("matches by name when a side has no emp #", () => {
    expect(goneEntryForFullRow(row({ truckNumber: null }), [buddyGone])).not.toBeNull();
    expect(
      goneEntryForFullRow(row(), [{ ...buddyGone, employeeNumber: null }]),
    ).not.toBeNull();
  });

  it("does not match a different emp # with the same name", () => {
    expect(goneEntryForFullRow(row({ truckNumber: "99999" }), [buddyGone])).toBeNull();
  });

  it("keeps a rehire (hire date after termination)", () => {
    expect(goneEntryForFullRow(row({ hireDate: "2026-10-01" }), [buddyGone])).toBeNull();
  });

  it("keeps a rehire re-added with the OLD hire date (David Perez case)", () => {
    const rehire = row({
      name: "David Perez",
      truckNumber: "31147",
      hireDate: "2016-03-09",
      createdAt: "2026-10-12T11:30:00.000Z",
      updatedAt: "2026-10-12T11:30:00.000Z",
    });
    expect(goneEntryForFullRow(rehire, [buddyGone])).toBeNull();
    expect(withoutGoneFullRows([rehire], [buddyGone])).toHaveLength(1);
  });

  it("keeps a row edited after the Gone entry was saved", () => {
    const edited = row({ createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" });
    expect(goneEntryForFullRow(edited, [buddyGone])).toBeNull();
  });

  it("keeps rows when timestamps are missing", () => {
    expect(goneEntryForFullRow(row({ createdAt: "", updatedAt: "" }), [buddyGone])).toBeNull();
  });

  it("finds the Gone entry for a person being re-added", () => {
    expect(goneEntriesForPerson({ truckNumber: "31147", name: "Buddy Johnson" }, [buddyGone])).toHaveLength(1);
    expect(goneEntriesForPerson({ truckNumber: "99999", name: "Buddy Johnson" }, [buddyGone])).toHaveLength(0);
  });

  it("keeps a row added after the Gone entry when there is no hire date", () => {
    const rehire = row({ hireDate: null, createdAt: "2026-10-05T00:00:00.000Z" });
    expect(goneEntryForFullRow(rehire, [buddyGone])).toBeNull();
    const old = row({ hireDate: null, createdAt: "2026-09-01T00:00:00.000Z" });
    expect(goneEntryForFullRow(old, [buddyGone])).not.toBeNull();
  });

  it("never touches Sat rows", () => {
    expect(goneEntryForFullRow(row({ kind: "sat", id: "sat-1" }), [buddyGone])).toBeNull();
  });

  it("hides Gone people from a display list", () => {
    const other = row({ id: "x", truckNumber: "12345", name: "Someone Else" });
    expect(withoutGoneFullRows([row(), other], [buddyGone]).map((r) => r.id)).toEqual(["x"]);
    expect(withoutGoneFullRows([row(), other], [])).toHaveLength(2);
  });
});

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
