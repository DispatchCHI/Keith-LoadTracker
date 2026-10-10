import { describe, expect, it } from "vitest";
import {
  addRosterEntry,
  autoSeedSatRosters,
  emptyDriverRosterStore,
  entriesForRoster,
  reconcileDriverRosterCloud,
  type DriverRosterStore,
} from "./driverRoster";

function hired(store: DriverRosterStore, yard: "burnham" | "pontiac", emp: string, name: string) {
  return addRosterEntry(store, { kind: "full", yard, truckNumber: emp, name }).store;
}

function sat(store: DriverRosterStore, yard: "burnham" | "pontiac", emp: string, name: string) {
  return addRosterEntry(store, { kind: "sat", yard, truckNumber: emp, name }, {
    at: "2026-10-09T20:00:00.000Z",
  }).store;
}

/** Cloud snapshot Keith set up: Burnham trimmed to one name, Pontiac emptied on purpose. */
function cloudSnapshot(): DriverRosterStore {
  let store = emptyDriverRosterStore();
  store = hired(store, "burnham", "56", "Dave Vanderbilt");
  store = hired(store, "burnham", "102", "Dan Kasprzycki");
  store = hired(store, "pontiac", "300", "Pat Pontiac");
  store = hired(store, "pontiac", "301", "Sam Pontiac");
  store = sat(store, "burnham", "56", "Dave Vanderbilt");
  return store;
}

describe("fresh desk never overwrites the cloud Sat Roster", () => {
  it("a brand-new desk adopts the cloud Sat list and uploads nothing", () => {
    const remote = cloudSnapshot();
    const result = reconcileDriverRosterCloud({
      local: emptyDriverRosterStore(),
      remote,
      deletedEntryIds: [],
      seenRemoteEntryIds: [],
    });
    expect(result.toUploadEntries).toEqual([]);
    expect(result.toDeleteRemoteEntries).toEqual([]);
    expect(entriesForRoster(result.next, "sat", "burnham").map((row) => row.name)).toEqual([
      "Dave Vanderbilt",
    ]);
    expect(entriesForRoster(result.next, "sat", "pontiac")).toEqual([]);
  });

  it("does not auto-refill a deliberately empty Sat yard when cloud is configured", () => {
    const store = cloudSnapshot();
    const result = autoSeedSatRosters(store, { cloudConfigured: true });
    expect(result.added).toBe(0);
    expect(result.seededYards).toEqual([]);
    expect(result.store).toBe(store);
    expect(entriesForRoster(result.store, "sat", "pontiac")).toEqual([]);
  });

  it("still seeds an empty Sat yard for a local-only (no cloud) desk", () => {
    const result = autoSeedSatRosters(cloudSnapshot(), {
      cloudConfigured: false,
      yards: ["pontiac"],
    });
    expect(result.seededYards).toEqual(["pontiac"]);
    expect(entriesForRoster(result.store, "sat", "pontiac").map((row) => row.name)).toEqual([
      "Pat Pontiac",
      "Sam Pontiac",
    ]);
  });

  it("a Z stamp does not beat the PostgREST +00:00 echo of the same instant", () => {
    const remote = cloudSnapshot();
    const [id, row] = Object.entries(remote.entries).find(([, entry]) => entry.kind === "sat")!;
    const remoteRow = { ...row, updatedAt: "2026-10-09T20:00:00.000400+00:00", sortOrder: 7 };
    const localRow = { ...row, updatedAt: "2026-10-09T20:00:00.000Z", sortOrder: 0 };
    const result = reconcileDriverRosterCloud({
      local: { entries: { [id]: localRow } },
      remote: { entries: { ...remote.entries, [id]: remoteRow } },
      deletedEntryIds: [],
      seenRemoteEntryIds: [id],
    });
    expect(result.toUploadEntries).toEqual([]);
    expect(result.next.entries[id].sortOrder).toBe(7);
  });

  it("a real later local edit still uploads", () => {
    const remote = cloudSnapshot();
    const [id, row] = Object.entries(remote.entries).find(([, entry]) => entry.kind === "sat")!;
    const remoteRow = { ...row, updatedAt: "2026-10-09T20:00:00.000+00:00" };
    const localRow = { ...row, updatedAt: "2026-10-09T21:00:00.000Z", sortOrder: 3 };
    const result = reconcileDriverRosterCloud({
      local: { entries: { [id]: localRow } },
      remote: { entries: { ...remote.entries, [id]: remoteRow } },
      deletedEntryIds: [],
      seenRemoteEntryIds: [id],
    });
    expect(result.toUploadEntries.map((entry) => entry.id)).toEqual([id]);
  });
});

describe("DriverRosterProvider guards", () => {
  it("routes auto Sat seeding through the cloud guard and skips work when the pull fails", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/store/DriverRosterContext.tsx", "utf8");
    expect(src).toMatch(/autoSeedSatRosters\(storeRef\.current, \{\s*cloudConfigured: configured/);
    expect(src).not.toMatch(/seedEmptySatRostersFromFull\(/);
    expect(src).toMatch(/if \(!pulled\) return;/);
  });
});

describe("stale Sat tombstones never delete names put back on the cloud list", () => {
  function satRow(store: DriverRosterStore) {
    return Object.values(store.entries).find((entry) => entry.kind === "sat")!;
  }

  it("a legacy tombstone (old desk / old desktop install) yields to the live cloud row", () => {
    const remote = cloudSnapshot();
    const row = satRow(remote);
    const result = reconcileDriverRosterCloud({
      local: emptyDriverRosterStore(),
      remote,
      deletedEntryIds: [row.id],
      seenRemoteEntryIds: [row.id],
    });
    expect(result.toDeleteRemoteEntries).toEqual([]);
    expect(result.deletedEntryIds).not.toContain(row.id);
    expect(result.next.entries[row.id]?.name).toBe("Dave Vanderbilt");
  });

  it("a tombstone older than a Reset / re-add yields to the cloud row", () => {
    const remote = cloudSnapshot();
    const row = satRow(remote);
    const result = reconcileDriverRosterCloud({
      local: emptyDriverRosterStore(),
      remote,
      deletedEntryIds: [row.id],
      deletedEntryAt: { [row.id]: "2026-09-20T15:00:00.000Z" },
      seenRemoteEntryIds: [row.id],
    });
    expect(result.toDeleteRemoteEntries).toEqual([]);
    expect(result.next.entries[row.id]).toBeTruthy();
  });

  it("a delete newer than the cloud row is still retried", () => {
    const remote = cloudSnapshot();
    const row = satRow(remote);
    const result = reconcileDriverRosterCloud({
      local: emptyDriverRosterStore(),
      remote,
      deletedEntryIds: [row.id],
      deletedEntryAt: { [row.id]: "2026-10-09T21:00:00.000Z" },
      seenRemoteEntryIds: [row.id],
    });
    expect(result.toDeleteRemoteEntries).toEqual([row.id]);
    expect(result.next.entries[row.id]).toBeUndefined();
    expect(result.deletedEntryAt[row.id]).toBe("2026-10-09T21:00:00.000Z");
  });

  it("a Sat name deleted on another desk is dropped here and stamped", () => {
    const remote = cloudSnapshot();
    const row = satRow(remote);
    const withoutRow = { entries: { ...remote.entries } };
    delete withoutRow.entries[row.id];
    const result = reconcileDriverRosterCloud({
      local: remote,
      remote: withoutRow,
      deletedEntryIds: [],
      seenRemoteEntryIds: [row.id],
      now: "2026-10-09T22:30:00.000Z",
    });
    expect(result.next.entries[row.id]).toBeUndefined();
    expect(result.toUploadEntries.map((entry) => entry.id)).not.toContain(row.id);
    expect(result.deletedEntryAt[row.id]).toBe("2026-10-09T22:30:00.000Z");
  });

  it("Full Roster tombstones keep their old behavior", () => {
    const remote = cloudSnapshot();
    const full = Object.values(remote.entries).find((entry) => entry.kind === "full")!;
    const result = reconcileDriverRosterCloud({
      local: emptyDriverRosterStore(),
      remote,
      deletedEntryIds: [full.id],
      seenRemoteEntryIds: [full.id],
    });
    expect(result.toDeleteRemoteEntries).toEqual([full.id]);
  });
});
