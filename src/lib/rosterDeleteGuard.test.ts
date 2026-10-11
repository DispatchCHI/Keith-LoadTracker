import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groupDeletesByTime, isMissingRpcError } from "./rosterDeleteGuard";

const NOW = "2026-10-11T01:00:00.000Z";

describe("groupDeletesByTime", () => {
  it("uses the recorded tombstone time, then the last-seen cloud time, then now", () => {
    const stamps: Record<string, string> = { a: "2026-10-10T12:00:00.000Z", b: "2026-10-10T12:00:00.000Z" };
    const seen: Record<string, string> = { c: "2026-10-01T00:00:00+00:00" };
    const out = groupDeletesByTime(["a", "b", "c", "d", "a"], (id) => stamps[id], (id) => seen[id], NOW);
    expect(out).toEqual([
      { at: "2026-10-10T12:00:00.000Z", ids: ["a", "b"] },
      { at: "2026-10-01T00:00:00+00:00", ids: ["c"] },
      { at: NOW, ids: ["d"] },
    ]);
  });

  it("falls back to now for an unparseable stamp", () => {
    expect(groupDeletesByTime(["x"], () => "garbage", () => undefined, NOW)).toEqual([{ at: NOW, ids: ["x"] }]);
  });
});

describe("isMissingRpcError", () => {
  it("detects the guard function not being installed yet", () => {
    expect(isMissingRpcError({ code: "PGRST202", message: "Could not find the function public.delete_roster_rows" })).toBe(true);
    expect(isMissingRpcError({ code: "42883", message: "function public.delete_roster_rows(uuid[], timestamptz) does not exist" })).toBe(true);
  });
  it("does not treat permission / paused / network errors as missing", () => {
    expect(isMissingRpcError(null)).toBe(false);
    expect(isMissingRpcError({ code: "42501", message: "permission denied for table driver_roster_entries" })).toBe(false);
    expect(isMissingRpcError({ code: "", message: "TypeError: Cloud writes paused" })).toBe(false);
  });
});

describe("DriverRosterContext deletes", () => {
  it("go through delete_roster_rows with a time, falling back to the direct delete only when missing", () => {
    const src = readFileSync(new URL("../store/DriverRosterContext.tsx", import.meta.url), "utf8");
    expect(src).toContain("supabase.rpc(ROSTER_DELETE_RPC");
    expect(src).toContain("p_deleted_at: batch.at");
    expect(src).toMatch(/isMissingRpcError\(error\)[\s\S]*\.from\("driver_roster_entries"\)\.delete\(\)\.in\("id", ids\)/);
  });
});

describe("guard SQL", () => {
  const sql = readFileSync(new URL("../../Load-Tracker-roster-guard-history.sql", import.meta.url), "utf8");
  it("creates the guarded delete function and revokes direct deletes", () => {
    expect(sql).toMatch(/create or replace function public\.delete_roster_rows\(\s*p_ids uuid\[\],\s*p_deleted_at timestamptz/);
    expect(sql).toContain("security definer");
    expect(sql).toMatch(/updated_at <= p_deleted_at/);
    expect(sql).toContain('drop policy if exists "crew_delete_driver_roster_entries"');
    expect(sql).toMatch(/revoke delete, truncate on public\.driver_roster_entries from anon, authenticated/);
  });
  it("adds history + updated_by triggers", () => {
    expect(sql).toContain("create table if not exists public.driver_roster_entries_history");
    expect(sql).toMatch(/after insert or update or delete on public\.driver_roster_entries/);
    expect(sql).toContain("add column if not exists updated_by uuid");
  });
  it("migration matches the paste file", () => {
    const mig = readFileSync(
      new URL("../../supabase/migrations/20261011010000_roster_guard_history.sql", import.meta.url),
      "utf8",
    );
    expect(mig.replace(/\r\n/g, "\n")).toBe(sql.replace(/\r\n/g, "\n"));
  });
});
