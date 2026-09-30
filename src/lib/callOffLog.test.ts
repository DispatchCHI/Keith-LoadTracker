import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CALL_OFF_LOG_SEED_CSV } from "../data/callOffLogSeed";
import {
  addCallOffLogEntry,
  kindForLogEntry,
  logEntriesToRows,
  logEntrySubtracts,
  mergeCallOffLog,
  reconcileCallOffLogCloud,
  rowsFromSeedCsv,
  seedIdForRow,
  type CallOffLogEntry,
} from "./callOffLog";
import { fullDayOffCount, fullDayOffEntries } from "./driverAvailability";

describe("call-off log", () => {
  it("parses the seeded sheet and subtracts full-day offs only", () => {
    const rows = logEntriesToRows(rowsFromSeedCsv(CALL_OFF_LOG_SEED_CSV));
    expect(rows.length).toBeGreaterThan(80);
    expect(fullDayOffCount(rows, "2026-08-15")).toBe(5);
    expect(
      fullDayOffEntries(rows, [], "2026-08-15")
        .map((row) => row.kind)
        .sort(),
    ).toEqual(["okd-off", "okd-off", "okd-off", "okd-off", "vacation"]);
    expect(fullDayOffCount(rows, "2026-08-14")).toBe(1);
    expect(fullDayOffCount(rows, "2026-09-15")).toBe(3);
  });

  it("keeps through-date ranges on the Available subtract", () => {
    const rows = logEntriesToRows(rowsFromSeedCsv(CALL_OFF_LOG_SEED_CSV));
    const jovan = rows.find((row) => row.name === "Jovan Morris");
    expect(jovan?.end).toBe("2026-08-29");
    expect(fullDayOffCount(rows, "2026-08-26")).toBeGreaterThanOrEqual(1);
    expect(fullDayOffCount(rows, "2026-08-29")).toBeGreaterThanOrEqual(1);
  });

  it("does not subtract park / late working notes", () => {
    expect(logEntrySubtracts({ reason: "ok'd to park by 3 pm" })).toBe(false);
    expect(logEntrySubtracts({ reason: "ok'd to do 1 load" })).toBe(false);
    expect(logEntrySubtracts({ reason: "Ok'd to come in late, 11am" })).toBe(false);
    expect(kindForLogEntry({ reason: "P-Day" })).toBe("p-day");
    expect(kindForLogEntry({ reason: "ok'd off" })).toBe("okd-off");
    expect(kindForLogEntry({ reason: "Call Off" })).toBe("call-off");
    expect(kindForLogEntry({ reason: "Vacation Day" })).toBe("vacation");
    expect(kindForLogEntry({ reason: "FMLA Day" })).toBe("fmla");
    expect(kindForLogEntry({ reason: "Late/Early" })).toBe("late-early");
    expect(logEntrySubtracts({ reason: "Vacation Day" })).toBe(true);
  });

  it("persists Vacation Day reason without rewriting it to Call Off", () => {
    const { entry } = addCallOffLogEntry([], {
      name: "Francisco Ramirez",
      start: "2026-09-30",
      reason: "Vacation Day",
    });
    expect(entry).not.toBeNull();
    expect(entry?.reason).toBe("Vacation Day");
    expect(kindForLogEntry(entry!)).toBe("vacation");
    expect(logEntrySubtracts(entry!)).toBe(true);
  });

  it("adds and merges without duplicating seed ids", () => {
    const seeded = rowsFromSeedCsv(CALL_OFF_LOG_SEED_CSV);
    const id = seedIdForRow({
      name: "Mike Smith",
      start: "2026-08-14",
      end: null,
      reason: "P-Day",
    });
    expect(seeded.some((row) => row.id === id)).toBe(true);
    const { entry } = addCallOffLogEntry(seeded, {
      name: "Test Driver",
      start: "2026-09-16",
      reason: "P-Day",
    });
    expect(entry?.name).toBe("Test Driver");
    const merged = mergeCallOffLog(seeded, seeded, []);
    expect(merged).toHaveLength(seeded.length);
  });
});

describe("call-off cloud reconcile timestamps", () => {
  const base: CallOffLogEntry = {
    id: "co-1",
    name: "Mike Smith",
    start: "2026-09-30",
    end: null,
    reason: "P-Day",
    createdAt: "2026-09-30T18:32:00.123Z",
    updatedAt: "2026-09-30T18:32:00.123Z",
  };

  it("does not re-upload a row PostgREST echoed in +00:00 form", () => {
    const remote: CallOffLogEntry = {
      ...base,
      createdAt: "2026-09-30T18:32:00.123000+00:00",
      updatedAt: "2026-09-30T18:32:00.123000+00:00",
    };
    const result = reconcileCallOffLogCloud({
      local: [base],
      remote: [remote],
      deletedIds: [],
      seenIds: [base.id],
    });
    expect(result.toUpload).toEqual([]);
  });

  it("still uploads a later local edit", () => {
    const local: CallOffLogEntry = {
      ...base,
      reason: "ok'd off",
      updatedAt: "2026-09-30T19:05:00.000Z",
    };
    const result = reconcileCallOffLogCloud({
      local: [local],
      remote: [base],
      deletedIds: [],
      seenIds: [base.id],
    });
    expect(result.toUpload.map((row) => row.id)).toEqual([base.id]);
  });
});

describe("Call-Off's screen filters", () => {
  it("includes Yesterday next to All / Upcoming / Today", () => {
    const src = readFileSync(new URL("../screens/CallOffsScreen.tsx", import.meta.url), "utf8");
    expect(src).toContain('"yesterday"');
    expect(src).toContain("Yesterday (");
    // "Yesterday" means the last working day, not a plain calendar day back —
    // from a Monday that's Saturday, since the yard doesn't run Sundays.
    expect(src).toContain("previousWorkingDay(today)");
  });
});
