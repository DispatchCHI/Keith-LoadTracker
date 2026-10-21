import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  __resetLoadStorageForTests,
  isIdbLoadKey,
  loadStorageHealthy,
  loadStoreGet,
  loadStoreSet,
  onLoadStorageChange,
} from "./loadsDb";
import { isProtectedDeviceLoad, mergeCloudLoads } from "./cloudMerge";
import type { Load } from "../types";

const load = (id: string, updatedAt: string, date = "2026-10-19"): Load =>
  ({
    id,
    truck: "1",
    pickup: "Melrose",
    commodity: "Trash (MSW)",
    destination: "DeKalb",
    stationId: "melrose",
    date,
    createdAt: updatedAt,
    updatedAt,
  }) as Load;
const store = (loads: Load[]) => ({
  version: 1 as const,
  loadsByDate: loads.reduce<Record<string, Load[]>>((acc, l) => {
    (acc[l.date] ??= []).push(l);
    return acc;
  }, {}),
});

afterEach(() => __resetLoadStorageForTests());

describe("1.1.42 load storage + sync safety", () => {
  it("only the two big load keys move to IndexedDB", () => {
    expect(isIdbLoadKey("chitrader.load-tracker.v1")).toBe(true);
    expect(isIdbLoadKey("chitrader.load-tracker.cloud-cache.v1")).toBe(true);
    expect(isIdbLoadKey("chitrader.load-tracker.queue.v1")).toBe(false);
  });

  it("a failed write flips health and notifies (loud error + sync pause)", () => {
    const orig = Storage.prototype.setItem;
    let calls = 0;
    const off = onLoadStorageChange(() => (calls += 1));
    Storage.prototype.setItem = function () {
      const e = new DOMException("full", "QuotaExceededError");
      throw e;
    };
    try {
      expect(loadStoreSet("chitrader.load-tracker.v1", "x")).toBe(false);
    } finally {
      Storage.prototype.setItem = orig;
      off();
    }
    expect(loadStorageHealthy()).toBe(false);
    expect(calls).toBe(1);
  });

  it("a stale device copy never re-uploads loads missing from the cloud (Oct 19 resurrection)", () => {
    const remote = [load("live", "2026-10-19T15:00:00Z")];
    const stale = store([load("live", "2026-10-19T15:00:00Z"), load("deleted-elsewhere", "2026-10-17T07:47:00Z")]);
    const out = mergeCloudLoads({
      remote,
      cache: { version: 1, loadsByDate: {} },
      local: stale,
      pending: [],
      extra: [stale],
      lastSuccessfulSyncAt: "2026-10-16T00:00:00Z",
      refreshStartedAt: "2026-10-19T23:55:00Z",
    });
    expect(out.toUpsert.map((l) => l.id)).toEqual([]);
    expect(out.toDelete).toEqual([]);
    expect(out.merged.map((l) => l.id)).toEqual(["live"]);
    expect(
      isProtectedDeviceLoad(load("x", "2026-10-17T07:47:00Z"), {
        pending: [],
        deleted: new Set(),
        lastSuccessfulSyncAt: "2026-10-16T00:00:00Z",
        refreshStartedAt: "2026-10-19T23:55:00Z",
      }),
    ).toBe(false);
  });

  it("queued saves still upload; empty remote re-uploads only the queue", () => {
    const mine = load("mine", "2026-10-19T23:50:00Z");
    const old = load("old", "2026-10-17T07:47:00Z");
    const pending = [{ kind: "upsert", load: mine, opId: "op1" }] as never;
    const full = mergeCloudLoads({
      remote: [load("live", "2026-10-19T15:00:00Z")],
      cache: { version: 1, loadsByDate: {} },
      local: store([old]),
      pending,
      lastSuccessfulSyncAt: "2026-10-16T00:00:00Z",
      refreshStartedAt: "2026-10-19T23:55:00Z",
    });
    expect(full.toUpsert.map((l) => l.id)).toEqual(["mine"]);
    const empty = mergeCloudLoads({
      remote: [],
      cache: { version: 1, loadsByDate: {} },
      local: store([old, mine]),
      pending,
      lastSuccessfulSyncAt: "2026-10-16T00:00:00Z",
    });
    expect(empty.toUpsert.map((l) => l.id)).toEqual(["mine"]);
  });

  it("LoadsContext: full re-check on launch, paged with stable order, pause on storage failure", () => {
    const src = readFileSync("src/store/LoadsContext.tsx", "utf8").replace(/\r\n/g, "\n");
    expect(src).toContain("const lastFullReconcileAtRef = useRef<string | null>(null);");
    expect(src).toContain('.order("id", { ascending: true })');
    expect(src).toMatch(/if \(!loadStorageHealthy\(\)\) \{/);
    expect(src).toContain("if (!writeCloudCache(next)) {");
  });
});
