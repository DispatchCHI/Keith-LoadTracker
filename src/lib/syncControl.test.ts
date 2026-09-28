import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_FETCH_SLOT_WAIT_MS,
  HUGE_QUEUE_THRESHOLD,
  _resetCloudFetchGateForTests,
  clearNetworkSyncBackoff,
  createSingleFlight,
  errorText,
  fetchWithCloudTimeout,
  hugeQueueMessage,
  isAuthSupabaseUrl,
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


describe("isAuthSupabaseUrl", () => {
  it("detects GoTrue paths that must bypass the data gate", () => {
    expect(
      isAuthSupabaseUrl("https://dwcwweublrsgcchkeydq.supabase.co/auth/v1/token?grant_type=refresh_token"),
    ).toBe(true);
    expect(
      isAuthSupabaseUrl("https://dwcwweublrsgcchkeydq.supabase.co/rest/v1/loads"),
    ).toBe(false);
  });
});

describe("fetchWithCloudTimeout", () => {
  it("aborts hung fetches so slots cannot stick forever", async () => {
    vi.useFakeTimers();
    const hung = () => new Promise<Response>(() => {});
    const pending = fetchWithCloudTimeout(hung, "https://example.test", undefined, 1_000);
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    vi.useRealTimers();
  });
});

describe("withCloudFetchSlot wait timeout", () => {
  it("rejects waiters instead of hanging forever when slots are stuck", async () => {
    vi.useFakeTimers();
    const releases: Array<() => void> = [];
    const holdSlot = () =>
      withCloudFetchSlot(
        () =>
          new Promise<void>((resolve) => {
            releases.push(resolve);
          }),
      );

    const held = [holdSlot(), holdSlot()];
    // Let both slots acquire before enqueueing a waiter.
    await Promise.resolve();
    await Promise.resolve();
    expect(releases).toHaveLength(2);

    const waiting = withCloudFetchSlot(async () => "ok");
    const assertion = expect(waiting).rejects.toThrow(/slot wait timed out/i);
    await vi.advanceTimersByTimeAsync(CLOUD_FETCH_SLOT_WAIT_MS);
    await assertion;

    for (const release of releases) release();
    await Promise.allSettled(held);
    vi.useRealTimers();
  });
});
