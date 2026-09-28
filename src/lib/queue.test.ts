import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dropImplicitDeletes,
  enqueueDelete,
  enqueueUpsert,
  isExplicitDeleteOp,
  NON_EXPLICIT_REMOTE_DELETE_WARN,
  QUEUE_KEY,
  readQueue,
  removeFlushedOp,
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
