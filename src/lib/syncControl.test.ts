import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HUGE_QUEUE_THRESHOLD,
  _resetCloudFetchGateForTests,
  clearNetworkSyncBackoff,
  createSingleFlight,
  errorText,
  hugeQueueMessage,
  isNetworkSyncBackoffActive,
  isNetworkSyncError,
  noteNetworkSyncFailure,
  withCloudFetchSlot,
} from "./syncControl";

afterEach(() => {
  _resetCloudFetchGateForTests();
  clearNetworkSyncBackoff();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isNetworkSyncError", () => {
  it("detects Failed to fetch and TypeError", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(isNetworkSyncError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkSyncError(new Error("Failed to fetch"))).toBe(true);
    expect(
      isNetworkSyncError({ message: "net::ERR_INSUFFICIENT_RESOURCES" }),
    ).toBe(true);
    expect(isNetworkSyncError(new Error("duplicate key value"))).toBe(false);
  });

  it("treats offline as network failure", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isNetworkSyncError(new Error("anything"))).toBe(true);
  });
});

describe("network backoff", () => {
  it("arms backoff on network failure and clears", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(isNetworkSyncBackoffActive()).toBe(false);
    noteNetworkSyncFailure(new TypeError("Failed to fetch"));
    expect(isNetworkSyncBackoffActive()).toBe(true);
    clearNetworkSyncBackoff();
    expect(isNetworkSyncBackoffActive()).toBe(false);
  });

  it("ignores non-network errors while online", () => {
    vi.stubGlobal("navigator", { onLine: true });
    noteNetworkSyncFailure(new Error("row-level security"));
    expect(isNetworkSyncBackoffActive()).toBe(false);
  });
});

describe("withCloudFetchSlot", () => {
  it("never runs more than two calls at once", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const job = async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      concurrent -= 1;
      return true;
    };
    await Promise.all([
      withCloudFetchSlot(job),
      withCloudFetchSlot(job),
      withCloudFetchSlot(job),
      withCloudFetchSlot(job),
      withCloudFetchSlot(job),
    ]);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });
});

describe("createSingleFlight", () => {
  it("coalesces overlapping calls", async () => {
    let runs = 0;
    const flight = createSingleFlight(async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 30));
      return runs;
    });
    const [a, b, c] = await Promise.all([flight(), flight(), flight()]);
    expect(runs).toBe(1);
    expect([a, b, c]).toEqual([1, 1, 1]);
  });
});

describe("hugeQueueMessage", () => {
  it("surfaces only for large queues", () => {
    expect(hugeQueueMessage(HUGE_QUEUE_THRESHOLD - 1)).toBeNull();
    expect(hugeQueueMessage(HUGE_QUEUE_THRESHOLD)).toMatch(/Large sync queue/);
    expect(errorText(new Error("x"))).toBe("x");
  });
});
