import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CALL_OFF_LOG_SEED_CSV } from "../data/callOffLogSeed";
import {
  addCallOffLogEntry,
  CALL_OFF_REASON_PRESETS,
  cleanCallOffLogEntry,
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
    // "Court at 9am, will be in after" is typed text, not a chip → Notes only.
    expect(fullDayOffCount(rows, "2026-09-15")).toBe(2);
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

describe("custom reasons are Notes only", () => {
  it("keeps every preset chip on its category", () => {
    const expected = {
      "P-Day": "p-day",
      "ok'd off": "okd-off",
      "Call Off": "call-off",
      "Vacation Day": "vacation",
      "FMLA Day": "fmla",
      "Late/Early": "late-early",
      Notes: "note",
    } as const;
    for (const preset of CALL_OFF_REASON_PRESETS) {
      expect(kindForLogEntry({ reason: preset }), preset).toBe(expected[preset]);
      expect(logEntrySubtracts({ reason: preset }), preset).toBe(
        preset !== "Late/Early" && preset !== "Notes",
      );
    }
  });

  it("keeps chip + suffix on the chip's category", () => {
    for (const reason of ["Late/Early 7am", "Late/Early 8:15a", "Late/Early In after court", "Late/Early 9am"]) {
      expect(kindForLogEntry({ reason }), reason).toBe("late-early");
      expect(logEntrySubtracts({ reason }), reason).toBe(false);
    }
    expect(kindForLogEntry({ reason: "Call Off, sick" })).toBe("call-off");
    expect(logEntrySubtracts({ reason: "Call Off, sick" })).toBe(true);
    expect(kindForLogEntry({ reason: "Call-off - car trouble" })).toBe("call-off");
    expect(kindForLogEntry({ reason: "P-Day (half)" })).toBe("p-day");
    expect(kindForLogEntry({ reason: "1 P-Day" })).toBe("p-day");
    expect(kindForLogEntry({ reason: "Vacation Day thru Fri" })).toBe("vacation");
    expect(kindForLogEntry({ reason: "FMLA" })).toBe("fmla");
    expect(kindForLogEntry({ reason: "Ok'd Off" })).toBe("okd-off");
  });

  it("treats Today-card mirror reasons as presets", () => {
    for (const reason of ["P-Day", "Ok'd Off", "NCNS", "FMLA", "Vacation Day", "Call Off"]) {
      expect(logEntrySubtracts({ reason }), reason).toBe(true);
    }
    expect(kindForLogEntry({ reason: "Late/Early" })).toBe("late-early");
  });

  it("classifies typed-over text as Notes only and never subtracts it", () => {
    for (const reason of [
      "Sick",
      "Doctor appointment",
      "In after court",
      "Court at 9am, will be in after",
      "Last Day, Retiring",
      "Last Day , retiring",
      "Family emergency",
      "Car trouble, will call",
      "Doctor - call off",
      "Ok'd to do 2 loads - Sick",
    ]) {
      expect(kindForLogEntry({ reason }), reason).toBe("note");
      expect(logEntrySubtracts({ reason }), reason).toBe(false);
    }
  });

  it("still subtracts typed Bereavement / Jury Duty as Call Off", () => {
    for (const reason of ["Bereavement", "Bereavement, father died", "Jury Duty", "jury duty thru Wed", "Out - jury duty"]) {
      expect(kindForLogEntry({ reason }), reason).toBe("call-off");
      expect(logEntrySubtracts({ reason }), reason).toBe(true);
    }
  });

  it("keeps the Notes chip (and anything typed after it) Notes only", () => {
    for (const reason of ["Notes", "Notes, coming in at 9", "notes - jury duty next week", "Notes: call off tomorrow"]) {
      expect(kindForLogEntry({ reason }), reason).toBe("note");
      expect(logEntrySubtracts({ reason }), reason).toBe(false);
    }
    const rows = [
      { name: "Notes Driver", start: "2026-10-06", end: null, reason: "Notes, coming in at 9" },
      { name: "Jury Driver", start: "2026-10-06", end: null, reason: "Jury Duty" },
      { name: "Retiring Driver", start: "2026-10-06", end: null, reason: "Last Day, Retiring" },
    ];
    expect(fullDayOffCount(rows, "2026-10-06")).toBe(1);
    expect(fullDayOffEntries(rows, [], "2026-10-06").map((row) => row.name)).toEqual(["Jury Driver"]);
  });

  it("keeps custom-text rows out of Available and the Today call-off list", () => {
    const rows = [
      { name: "James Wolf", start: "2026-10-06", end: null, reason: "Ok'd to do 2 loads - Sick" },
      { name: "Typed Driver", start: "2026-10-06", end: null, reason: "In after court" },
      { name: "Mike Davy", start: "2026-10-06", end: null, reason: "Call Off" },
      { name: "Bryan Alvarado", start: "2026-10-06", end: null, reason: "Late/Early 7am" },
    ];
    expect(fullDayOffCount(rows, "2026-10-06")).toBe(1);
    expect(fullDayOffEntries(rows, [], "2026-10-06").map((row) => [row.name, row.kind])).toEqual([
      ["Bryan Alvarado", "late-early"],
      ["Mike Davy", "call-off"],
    ]);
  });

  it("re-derives the category from stored reason text, so old rows are fixed too", () => {
    const old = cleanCallOffLogEntry({
      id: "co-old",
      name: "Old Row",
      start: "2026-10-05",
      end: null,
      reason: "In after court",
      createdAt: "2026-10-05T12:00:00.000Z",
      updatedAt: "2026-10-05T12:00:00.000Z",
    });
    expect(old).not.toBeNull();
    expect(Object.keys(old!).sort()).toEqual(
      ["createdAt", "end", "id", "name", "reason", "start", "updatedAt"].sort(),
    );
    expect(kindForLogEntry(old!)).toBe("note");
    expect(logEntrySubtracts(old!)).toBe(false);
  });

  it("adds a custom reason verbatim and it lands in Notes only", () => {
    const { entry } = addCallOffLogEntry([], {
      name: "Typed Driver",
      start: "2026-10-06",
      reason: "  Doctor appt  ",
    });
    expect(entry?.reason).toBe("Doctor appt");
    expect(kindForLogEntry(entry!)).toBe("note");
    expect(logEntrySubtracts(entry!)).toBe(false);
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


describe("call-off merge heals Z timestamps", () => {
  it("keeps PostgREST +00:00 over local Z at the same instant", () => {
    const local: CallOffLogEntry = {
      id: "co-heal",
      name: "Mike Smith",
      start: "2026-09-30",
      end: null,
      reason: "P-Day",
      createdAt: "2026-09-30T18:32:00.123Z",
      updatedAt: "2026-09-30T18:32:00.123Z",
    };
    const remote: CallOffLogEntry = {
      ...local,
      createdAt: "2026-09-30T18:32:00.123000+00:00",
      updatedAt: "2026-09-30T18:32:00.123000+00:00",
    };
    const merged = mergeCallOffLog([local], [remote], []);
    expect(merged[0]?.updatedAt).toBe(remote.updatedAt);
    const result = reconcileCallOffLogCloud({
      local: [local],
      remote: [remote],
      deletedIds: [],
      seenIds: [local.id],
    });
    expect(result.toUpload).toEqual([]);
    expect(result.next[0]?.updatedAt).toBe(remote.updatedAt);
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
