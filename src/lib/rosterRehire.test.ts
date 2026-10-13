import { describe, expect, it } from "vitest";
import { reconcileDriverRosterCloud, type DriverRosterEntry } from "./driverRoster";

const david: DriverRosterEntry = {
  id: "d1",
  kind: "full",
  yard: "rockford",
  truckNumber: "40111",
  assignedTruck: null,
  name: "David Perez",
  status: null,
  hireDate: null,
  phone: null,
  sortOrder: 0,
  forDate: null,
  createdAt: "2026-10-12T15:00:00.000Z",
  updatedAt: "2026-10-12T15:00:00.000Z",
} as DriverRosterEntry;

describe("rehire on Full Roster beats a stale tombstone", () => {
  it("keeps the cloud row when the tombstone is older (old Gone prune)", () => {
    const r = reconcileDriverRosterCloud({
      local: { entries: {} },
      remote: { entries: { d1: david } },
      deletedEntryIds: ["d1"],
      deletedEntryAt: { d1: "2026-10-12T02:00:00.000Z" },
      seenRemoteEntryIds: ["d1"],
    });
    expect(r.next.entries.d1?.name).toBe("David Perez");
    expect(r.toDeleteRemoteEntries).toEqual([]);
    expect(r.deletedEntryIds).not.toContain("d1");
  });

  it("keeps the cloud row for a tombstone with no time", () => {
    const r = reconcileDriverRosterCloud({
      local: { entries: {} },
      remote: { entries: { d1: david } },
      deletedEntryIds: ["d1"],
      seenRemoteEntryIds: ["d1"],
    });
    expect(r.next.entries.d1).toBeTruthy();
    expect(r.toDeleteRemoteEntries).toEqual([]);
  });

  it("still sends a fresh explicit delete", () => {
    const r = reconcileDriverRosterCloud({
      local: { entries: {} },
      remote: { entries: { d1: david } },
      deletedEntryIds: ["d1"],
      deletedEntryAt: { d1: "2026-10-12T16:00:00.000Z" },
      seenRemoteEntryIds: ["d1"],
    });
    expect(r.next.entries.d1).toBeUndefined();
    expect(r.toDeleteRemoteEntries).toEqual(["d1"]);
  });
});
