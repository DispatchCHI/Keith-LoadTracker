import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dropConfirmedSyncedOps,
  dropImplicitDeletes,
  enqueueDelete,
  enqueueUpsert,
  isExplicitDeleteOp,
  NON_EXPLICIT_REMOTE_DELETE_WARN,
  QUEUE_KEY,
  readQueue,
  removeFlushedOp,
  takeFlushUpsertBatch,
  writeQueue,
  type QueueOp,
} from "./queue";
import type { Load } from "../types";

const memory = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => memory.clear(),
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

afterEach(() => {
  memory.clear();
});

describe("explicit remote delete queue", () => {
  it("refuses to enqueue a delete that is not from UI deleteLoad", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(enqueueDelete("auto-prune-id")).toEqual([]);
    expect(readQueue()).toEqual([]);
    expect(
      warn.mock.calls.some((call) =>
        String(call[0]).includes(NON_EXPLICIT_REMOTE_DELETE_WARN),
      ),
    ).toBe(true);
    warn.mockRestore();
  });

  it("enqueues an explicit UI delete", () => {
    const queued = enqueueDelete("user-deleted", { explicit: true });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      kind: "delete",
      loadId: "user-deleted",
      explicit: true,
    });
    expect(isExplicitDeleteOp(queued[0])).toBe(true);
  });

  it("drops leftover implicit / auto-prune deletes from the queue", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const leftover: QueueOp[] = [
      {
        opId: "old-prune",
        kind: "delete",
        loadId: "4fb99b04-5a3d-474f-a756-0181e17050fc",
        queuedAt: "2026-09-12T02:00:00.000Z",
      },
      {
        opId: "user-del",
        kind: "delete",
        loadId: "keep-me",
        queuedAt: "2026-09-12T02:01:00.000Z",
        explicit: true,
      },
    ];
    writeQueue(leftover);
    expect(memory.get(QUEUE_KEY)).toContain("4fb99b04");
    const kept = dropImplicitDeletes();
    expect(kept.map((op) => op.kind === "delete" && op.loadId)).toEqual(["keep-me"]);
    expect(readQueue()).toEqual(kept);
    expect(
      warn.mock.calls.some((call) =>
        String(call[0]).includes("4fb99b04-5a3d-474f-a756-0181e17050fc"),
      ),
    ).toBe(true);
    warn.mockRestore();
  });
});


function sampleLoad(id: string, updatedAt = "2026-09-28T12:00:00.000Z"): Load {
  return {
    id,
    truck: "100",
    pickup: "Yard",
    commodity: "MSW",
    destination: "Landfill",
    stationId: "medill",
    date: "2026-09-28",
    createdAt: "2026-09-28T11:00:00.000Z",
    updatedAt,
  };
}

describe("enqueueUpsert preserves in-flight op identity", () => {
  it("keeps opId and position when refresh re-enqueues the same load", () => {
    const first = enqueueUpsert(sampleLoad("load-a", "2026-09-28T12:00:00.000Z"));
    enqueueUpsert(sampleLoad("load-b"));
    expect(first[0]?.opId).toBeTruthy();
    const opIdA = first[0]!.opId;

    const next = enqueueUpsert(sampleLoad("load-a", "2026-09-28T12:05:00.000Z"));
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({
      opId: opIdA,
      kind: "upsert",
      load: expect.objectContaining({ id: "load-a", updatedAt: "2026-09-28T12:05:00.000Z" }),
    });
    expect(next[1]).toMatchObject({ kind: "upsert", load: expect.objectContaining({ id: "load-b" }) });
  });

  it("removeFlushedOp drops by load id if opId was rewritten", () => {
    writeQueue([
      {
        opId: "stale-in-flight",
        kind: "upsert",
        load: sampleLoad("load-a"),
        queuedAt: "2026-09-28T12:00:00.000Z",
      },
    ]);
    // Simulate a bad rewriter that changed the UUID (pre-fix behavior).
    writeQueue([
      {
        opId: "rewritten",
        kind: "upsert",
        load: sampleLoad("load-a", "2026-09-28T12:01:00.000Z"),
        queuedAt: "2026-09-28T12:01:00.000Z",
      },
    ]);
    const left = removeFlushedOp({
      opId: "stale-in-flight",
      kind: "upsert",
      load: sampleLoad("load-a"),
      queuedAt: "2026-09-28T12:00:00.000Z",
    });
    expect(left).toEqual([]);
    expect(readQueue()).toEqual([]);
  });
});


describe("dropConfirmedSyncedOps", () => {
  it("drops upserts already on cloud at same or newer updatedAt", () => {
    const ops: QueueOp[] = [
      {
        opId: "a",
        kind: "upsert",
        load: sampleLoad("load-a", "2026-09-28T12:00:00.000Z"),
        queuedAt: "2026-09-28T12:00:00.000Z",
      },
      {
        opId: "b",
        kind: "upsert",
        load: sampleLoad("load-b", "2026-09-28T13:00:00.000Z"),
        queuedAt: "2026-09-28T13:00:00.000Z",
      },
      {
        opId: "del",
        kind: "delete",
        loadId: "load-c",
        queuedAt: "2026-09-28T13:00:00.000Z",
        explicit: true,
      },
    ];
    const remote = new Map([
      ["load-a", "2026-09-28T12:00:00.000Z"], // same → drop
      ["load-b", "2026-09-28T12:59:00.000Z"], // older → keep
    ]);
    const kept = dropConfirmedSyncedOps(ops, remote);
    expect(kept.map((op) => op.opId)).toEqual(["b", "del"]);
  });

  it("drops an upsert whose cloud echo is the same instant in PostgREST form", () => {
    const ops: QueueOp[] = [
      {
        opId: "a",
        kind: "upsert",
        load: sampleLoad("load-a", "2026-09-30T18:32:00.123Z"),
        queuedAt: "2026-09-30T18:32:00.123Z",
      },
    ];
    const remote = new Map([["load-a", "2026-09-30T18:32:00.123000+00:00"]]);
    expect(dropConfirmedSyncedOps(ops, remote)).toEqual([]);
  });
});

describe("takeFlushUpsertBatch", () => {
  it("batches contiguous head upserts and stops at delete", () => {
    const ops: QueueOp[] = [
      {
        opId: "1",
        kind: "upsert",
        load: sampleLoad("a"),
        queuedAt: "2026-09-28T12:00:00.000Z",
      },
      {
        opId: "2",
        kind: "upsert",
        load: sampleLoad("b"),
        queuedAt: "2026-09-28T12:00:00.000Z",
      },
      {
        opId: "3",
        kind: "delete",
        loadId: "c",
        queuedAt: "2026-09-28T12:00:00.000Z",
        explicit: true,
      },
      {
        opId: "4",
        kind: "upsert",
        load: sampleLoad("d"),
        queuedAt: "2026-09-28T12:00:00.000Z",
      },
    ];
    expect(takeFlushUpsertBatch(ops, 25).map((op) => op.opId)).toEqual(["1", "2"]);
    expect(takeFlushUpsertBatch(ops, 1).map((op) => op.opId)).toEqual(["1"]);
    expect(takeFlushUpsertBatch(ops.slice(2), 25)).toEqual([]);
  });
});
