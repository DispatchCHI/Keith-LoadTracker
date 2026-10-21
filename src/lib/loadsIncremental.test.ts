import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  LOADS_FULL_RECONCILE_INTERVAL_MS,
  loadsIncrementalFilter,
  shouldFullReconcileLoads,
} from "./cloud";

describe("1.1.44 late-arriving loads reach every browser", () => {
  it("incremental pull also re-reads today and the 2 days before", () => {
    expect(loadsIncrementalFilter("2026-10-21T15:00:00.000Z", "2026-10-21")).toBe(
      'updated_at.gt."2026-10-21T15:00:00.000Z",date.gte.2026-10-19',
    );
    expect(loadsIncrementalFilter("2026-11-01T00:00:00.000Z", "2026-11-01")).toContain("date.gte.2026-10-30");
  });

  it("full re-check runs at least every 10 minutes", () => {
    expect(LOADS_FULL_RECONCILE_INTERVAL_MS).toBe(10 * 60_000);
    const now = Date.parse("2026-10-21T16:00:00Z");
    expect(
      shouldFullReconcileLoads({
        lastSuccessfulSyncAt: "2026-10-21T15:59:00Z",
        lastFullReconcileAt: "2026-10-21T15:49:59Z",
        now,
      }),
    ).toBe(true);
  });

  it("1.1.46 hotfix: incremental pulls are plain updated_at deltas again (window re-read reverted)", () => {
    const src = readFileSync("src/store/LoadsContext.tsx", "utf8");
    expect(src).toContain('query.gt("updated_at", since)');
    expect(src).not.toContain("loadsIncrementalFilter");
  });
});
