import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addRosterEntry,
  emptyDriverRosterStore,
  updateRosterEntry,
} from "./driverRoster";
import {
  assignedTrucksNeedingUpload,
  preserveAssignedTrucks,
  resolveDuplicateAssignedTrucks,
  syncAssignedTrucks,
} from "./rosterAssignedTruck";

function hired(name: string, truck: string | null) {
  return addRosterEntry(emptyDriverRosterStore(), {
    kind: "full",
    yard: "burnham",
    truckNumber: "185",
    assignedTruck: truck,
    name,
  }).store;
}

describe("preserveAssignedTrucks", () => {
  it("keeps a saved unit when the incoming row has none", () => {
    const local = hired("Alice Smith", "418");
    const id = Object.keys(local.entries)[0]!;
    const incoming = {
      entries: {
        [id]: { ...local.entries[id]!, assignedTruck: null },
      },
    };
    expect(preserveAssignedTrucks(local, incoming).entries[id]?.assignedTruck).toBe("418");
  });

  it("lets a dispatcher clear the unit", () => {
    const local = hired("Alice Smith", null);
    const id = Object.keys(local.entries)[0]!;
    const incoming = {
      entries: {
        [id]: { ...local.entries[id]!, assignedTruck: null },
      },
    };
    expect(preserveAssignedTrucks(local, incoming).entries[id]?.assignedTruck).toBeNull();
  });

  it("queues a local unit for upload when cloud is blank", () => {
    const local = hired("Alice Smith", "418");
    const id = Object.keys(local.entries)[0]!;
    const incoming = {
      entries: {
        [id]: { ...local.entries[id]!, assignedTruck: null },
      },
    };
    expect(assignedTrucksNeedingUpload(local, incoming).map((row) => row.assignedTruck)).toEqual([
      "418",
    ]);
  });

  it("keeps a unit when the incoming row uses a different id for the same driver", () => {
    const local = hired("Alice Smith", "418");
    const oldId = Object.keys(local.entries)[0]!;
    const incoming = {
      entries: {
        "new-id": {
          ...local.entries[oldId]!,
          id: "new-id",
          assignedTruck: null,
        },
      },
    };
    expect(preserveAssignedTrucks(local, incoming).entries["new-id"]?.assignedTruck).toBe("418");
  });

  it("lets a newer cloud clear replace a saved unit", () => {
    const local = hired("Alice Smith", "418");
    const id = Object.keys(local.entries)[0]!;
    const incoming = {
      entries: {
        [id]: {
          ...local.entries[id]!,
          assignedTruck: null,
          updatedAt: "2099-01-01T00:00:00.000Z",
        },
      },
    };
    expect(
      preserveAssignedTrucks(local, incoming, { blankIsAuthoritative: true }).entries[id]
        ?.assignedTruck,
    ).toBeNull();
  });

  it("still keeps a saved unit when the blank is not newer", () => {
    const local = hired("Alice Smith", "418");
    const id = Object.keys(local.entries)[0]!;
    const incoming = {
      entries: {
        [id]: { ...local.entries[id]!, assignedTruck: null },
      },
    };
    expect(
      preserveAssignedTrucks(local, incoming, { blankIsAuthoritative: true }).entries[id]
        ?.assignedTruck,
    ).toBe("418");
  });

  it("does not push a stale unit over a newer cloud clear", () => {
    const local = hired("Alice Smith", "418");
    const id = Object.keys(local.entries)[0]!;
    const remote = {
      entries: {
        [id]: {
          ...local.entries[id]!,
          assignedTruck: null,
          updatedAt: "2099-01-01T00:00:00.000Z",
        },
      },
    };
    expect(assignedTrucksNeedingUpload(local, remote)).toEqual([]);
  });

  it("uploads a newer local clear instead of leaving the old unit in cloud", () => {
    const local = hired("Alice Smith", "418");
    const id = Object.keys(local.entries)[0]!;
    const cleared = updateRosterEntry(local, id, { assignedTruck: null }, "2099-01-01T00:00:00.000Z");
    expect(assignedTrucksNeedingUpload(cleared, local).map((row) => row.assignedTruck)).toEqual([
      null,
    ]);
  });
});

describe("syncAssignedTrucks", () => {
  it("does not resurrect a cleared unit from a stale local copy", () => {
    const local = hired("Alice Smith", "418");
    const id = Object.keys(local.entries)[0]!;
    const remote = {
      entries: {
        [id]: {
          ...local.entries[id]!,
          assignedTruck: null,
          updatedAt: "2099-01-01T00:00:00.000Z",
        },
      },
    };
    const synced = syncAssignedTrucks({
      local,
      remote,
      reconciled: remote,
      assignedTruckKnown: true,
    });
    expect(synced.store.entries[id]?.assignedTruck).toBeNull();
    expect(synced.toUpload).toEqual([]);
  });

  it("keeps the unit when the cloud column was not in the pull", () => {
    const local = hired("Alice Smith", "418");
    const id = Object.keys(local.entries)[0]!;
    const remote = {
      entries: {
        [id]: {
          ...local.entries[id]!,
          assignedTruck: null,
          updatedAt: "2099-01-01T00:00:00.000Z",
        },
      },
    };
    const synced = syncAssignedTrucks({
      local,
      remote,
      reconciled: remote,
      assignedTruckKnown: false,
    });
    expect(synced.store.entries[id]?.assignedTruck).toBe("418");
    expect(synced.toUpload.map((row) => row.id)).toEqual([id]);
  });

  it("clears the older driver when two Full Roster rows share a truck", () => {
    let store = addRosterEntry(emptyDriverRosterStore(), {
      kind: "full",
      yard: "burnham",
      truckNumber: "56",
      assignedTruck: "0418",
      name: "Dave Vanderbilt",
    }, { id: "dave", at: "2026-09-01T00:00:00.000Z" }).store;
    store = addRosterEntry(store, {
      kind: "full",
      yard: "rockford",
      truckNumber: "185",
      assignedTruck: "418",
      name: "Christopher Oleson",
    }, { id: "chris", at: "2026-09-02T00:00:00.000Z" }).store;
    const synced = syncAssignedTrucks({
      local: store,
      remote: store,
      reconciled: store,
      assignedTruckKnown: true,
      at: "2026-09-03T00:00:00.000Z",
    });
    expect(synced.store.entries.chris?.assignedTruck).toBe("418");
    expect(synced.store.entries.dave?.assignedTruck).toBeNull();
    expect(synced.toUpload.map((row) => row.id)).toEqual(["dave"]);
    expect(synced.store.entries.dave?.updatedAt > "2026-09-01T00:00:00.000Z").toBe(true);
  });
});

describe("roster truck cloud wiring", () => {
  it("sends JSON null for a cleared unit and does not prune Gone names", () => {
    const src = readFileSync(new URL("../store/DriverRosterContext.tsx", import.meta.url), "utf8");
    expect(src).toContain("assigned_truck: entry.assignedTruck ?? null");
    expect(src).toContain("syncAssignedTrucks");
    expect(src).toContain("assignedTruckKnown");
    expect(src).not.toContain("stripRosterEntriesMatchingGone");
  });
});

describe("resolveDuplicateAssignedTrucks", () => {
  it("leaves a single assignment alone", () => {
    const store = hired("Alice Smith", "418");
    const resolved = resolveDuplicateAssignedTrucks(store, "2099-01-01T00:00:00.000Z");
    expect(resolved.cleared).toEqual([]);
    expect(resolved.store).toBe(store);
  });
});
