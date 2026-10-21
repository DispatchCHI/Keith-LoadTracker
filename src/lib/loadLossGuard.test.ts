import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { guardFullPullLoss, MIN_CONFIRM_GAP_MS } from "./loadLossGuard";
import { mergeIncrementalCloudLoads } from "./cloudMerge";
import type { Load } from "../types";

const load = (id: string, date = "2026-10-21"): Load =>
  ({
    id, truck: "1", pickup: "Evanston", commodity: "Trash (MSW)", destination: "Hodgkins",
    stationId: "evanston", date, createdAt: "2026-10-21T15:00:00Z", updatedAt: "2026-10-21T15:00:00Z",
  }) as Load;
const today = Array.from({ length: 50 }, (_, i) => load(`t${i}`));
const tue = Array.from({ length: 50 }, (_, i) => load(`u${i}`, "2026-10-20"));
const device = [...today, ...tue];
const run = (remote: Load[], suspects = new Map<string, number>(), now = 1_000_000) =>
  guardFullPullLoss({
    merged: remote,
    device,
    remoteIds: new Set(remote.map((l) => l.id)),
    remoteCount: remote.length,
    deleted: new Set(),
    suspects,
    now,
  });

describe("1.1.46 no cloud read can make loads vanish", () => {
  it("empty full pull keeps every load", () => {
    const r = run([]);
    expect(r.merged).toHaveLength(100);
    expect(r.trustworthy).toBe(false);
    expect(r.needsFullRepull).toBe(true);
  });

  it("partial / wrong-filter full pull (only Tuesday) keeps today and flags a re-pull", () => {
    const r = run(tue);
    expect(r.merged.map((l) => l.id).sort()).toEqual(device.map((l) => l.id).sort());
    expect(r.thinDates).toEqual(["2026-10-21"]);
    // even a second identical partial pull cannot drop them (not a complete pull)
    const again = run(tue, r.suspects, 1_000_000 + MIN_CONFIRM_GAP_MS + 1);
    expect(again.merged).toHaveLength(100);
    expect(again.confirmedGone).toEqual([]);
  });

  it("a real delete elsewhere disappears only after two complete pulls", () => {
    const remote = device.filter((l) => l.id !== "t7");
    const first = run(remote);
    expect(first.merged.some((l) => l.id === "t7")).toBe(true);
    const tooSoon = run(remote, first.suspects, 1_000_000 + 1_000);
    expect(tooSoon.merged.some((l) => l.id === "t7")).toBe(true);
    const later = run(remote, first.suspects, 1_000_000 + MIN_CONFIRM_GAP_MS);
    expect(later.confirmedGone).toEqual(["t7"]);
    expect(later.merged.some((l) => l.id === "t7")).toBe(false);
  });

  it("failed / empty / filtered incremental pulls never remove loads", () => {
    const store = { version: 1 as const, loadsByDate: { "2026-10-21": today, "2026-10-20": tue } };
    for (const remote of [[], tue.slice(0, 3), [load("new1")]]) {
      const { merged } = mergeIncrementalCloudLoads({
        remote, cache: store, local: store, pending: [], extra: [store],
        lastSuccessfulSyncAt: "2026-10-21T16:00:00Z", refreshStartedAt: "2026-10-21T16:01:00Z",
      });
      for (const l of device) expect(merged.some((m) => m.id === l.id)).toBe(true);
    }
  });

  it("LoadsContext applies the guard on full pulls", () => {
    const src = readFileSync("src/store/LoadsContext.tsx", "utf8");
    expect(src).toContain("guardFullPullLoss(");
    expect(src).toContain("snapshotFromLoads(mergedSafe, keptTombstones)");
  });
});
