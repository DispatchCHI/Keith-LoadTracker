import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  entryToRow,
  isEvanstonPickup,
  isMissingCheckoffTable,
  mergeCheckoffRows,
  parseCheckoffStore,
  pendingCheckoffs,
  toggleCheckoff,
} from "./evanstonCheckoff";

describe("Evanston shared check-off (1.1.45)", () => {
  it("only Evanston pickups sync", () => {
    expect(isEvanstonPickup("Evanston")).toBe(true);
    expect(isEvanstonPickup(" evanston ")).toBe(true);
    expect(isEvanstonPickup("Melrose", "melrose")).toBe(false);
    expect(isEvanstonPickup("x", "evanston")).toBe(true);
  });

  it("check and un-check both queue with time and who", () => {
    let s = toggleCheckoff({}, "L1", false, "K Lawson", "2026-10-21T15:41:00.000Z");
    expect(s.L1).toMatchObject({ checked: true, checkedAt: "2026-10-21T15:41:00.000Z", checkedBy: "K Lawson", pending: true });
    s = toggleCheckoff({ L1: { ...s.L1, pending: false } }, "L1", true, "T Reyling", "2026-10-21T15:42:00.000Z");
    expect(s.L1).toMatchObject({ checked: false, checkedAt: null, pending: true });
    expect(pendingCheckoffs(s).map(entryToRow)).toEqual([
      { load_id: "L1", checked: false, checked_at: null, checked_by: null, updated_at: "2026-10-21T15:42:00.000Z" },
    ]);
  });

  it("pull: newer remote wins, newer local pending click is kept", () => {
    const local = toggleCheckoff({}, "L1", false, "K", "2026-10-21T15:41:00.000Z");
    const keep = mergeCheckoffRows(local, [
      { load_id: "L1", checked: false, checked_at: null, checked_by: null, updated_at: "2026-10-21T15:40:00.000Z" },
    ]);
    expect(keep.L1.checked).toBe(true);
    const take = mergeCheckoffRows(local, [
      { load_id: "L1", checked: false, checked_at: null, checked_by: null, updated_at: "2026-10-21T15:45:00.000Z" },
      { load_id: "L2", checked: true, checked_at: "2026-10-21T15:46:00.000Z", checked_by: "T Reyling", updated_at: "2026-10-21T15:46:00.000Z" },
    ]);
    expect(take.L1).toMatchObject({ checked: false, pending: false });
    expect(take.L2).toMatchObject({ checked: true, checkedBy: "T Reyling" });
    expect(parseCheckoffStore(JSON.stringify(take))).toEqual(take);
  });

  it("missing table is tolerated", () => {
    expect(isMissingCheckoffTable({ code: "PGRST205", message: "Could not find the table 'public.load_checkoffs' in the schema cache" })).toBe(true);
    expect(isMissingCheckoffTable({ code: "42501", message: "permission denied" })).toBe(false);
  });

  it("popup routes Evanston rows to the shared store, others stay local", () => {
    const src = readFileSync("src/screens/YardDeskScreen.tsx", "utf8");
    expect(src).toContain("isEvanstonPickup(load.pickup, load.stationId)");
    expect(src).toContain("toggleEvanstonCheckoff(");
    expect(src).toContain("setCheckedIds(toggleCheckedLoad(load.id))");
  });
});
