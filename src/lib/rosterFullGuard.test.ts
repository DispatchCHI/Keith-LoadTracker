import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROSTER_REMOVE_FULL_RPC, splitExplicitFullDeletes } from "./rosterDeleteGuard";
import { MIN_SYNC_VERSION, SYNC_VERSION } from "./syncVersion";

const DAVID = "d6dd5316-a3c9-4991-be4a-0a3ba7b3f8b0";

describe("Full Roster delete guard (rehire David Perez)", () => {
  it("only ids Keith removed with x go to the Full remove RPC", () => {
    const split = splitExplicitFullDeletes([DAVID, "sat-1"], new Set(["other-full"]));
    expect(split.explicitFull).toEqual([]);
    expect(split.other).toEqual([DAVID, "sat-1"]);
    const explicit = splitExplicitFullDeletes([DAVID, "sat-1"], new Set([DAVID]));
    expect(explicit.explicitFull).toEqual([DAVID]);
    expect(explicit.other).toEqual(["sat-1"]);
  });

  it("this build speaks sync v3 (needed by remove_full_roster_rows) without pausing v2 desks", () => {
    expect(SYNC_VERSION).toBeGreaterThanOrEqual(3);
    expect(MIN_SYNC_VERSION).toBeLessThanOrEqual(SYNC_VERSION);
    expect(ROSTER_REMOVE_FULL_RPC).toBe("remove_full_roster_rows");
  });

  it("only explicit x paths mark Full rows for the remove RPC", () => {
    const src = readFileSync(new URL("../store/DriverRosterContext.tsx", import.meta.url), "utf8");
    expect(src.match(/markExplicitFull\(/g)?.length).toBe(2);
  });

  it("server SQL blocks every other Full delete", () => {
    const sql = readFileSync(new URL("../../Load-Tracker-roster-full-guard.sql", import.meta.url), "utf8");
    expect(sql).toContain("driver_roster_full_delete_guard");
    expect(sql).toContain("lt.explicit_full_remove");
    expect(sql).toContain("p_sync_version, 0) < 3");
  });
});
