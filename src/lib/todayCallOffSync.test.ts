import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addDays } from "./chicagoDate";
import { callOffLogRowVisible, type CallOffLogEntry } from "./callOffLog";
import { fullDayOffCount, reasonForKind, withManualOffs, type CallOffKind } from "./driverAvailability";
import { deletedManualKey } from "./manualCallOffs";
import {
  canRemoveTodayCallOff,
  logIdsRemovedWithManual,
  manualMirrorId,
  mirrorEntryFromManual,
  reconcileTodayCallOffs,
} from "./todayCallOffSync";

const DAY = "2026-09-30";
const TODAY = DAY;

function row(partial: Partial<CallOffLogEntry> & Pick<CallOffLogEntry, "id" | "name" | "start">): CallOffLogEntry {
  return {
    end: null,
    reason: "Call Off",
    createdAt: "2026-09-30T15:00:00.000Z",
    updatedAt: "2026-09-30T15:00:00.000Z",
    ...partial,
  };
}

describe("Today call-off → Call Offs log", () => {
  it("mirrors a Today manual onto that Chicago day and keeps Vacation Day", () => {
    const kinds: CallOffKind[] = [
      "call-off",
      "p-day",
      "okd-off",
      "ncns",
      "late-early",
      "fmla",
      "vacation",
    ];
    for (const kind of kinds) {
      const entry = mirrorEntryFromManual(DAY, { name: "Francisco Ramirez", kind }, "2026-09-30T16:00:00.000Z");
      expect(entry?.reason).toBe(reasonForKind(kind));
      expect(entry?.reason).not.toBe(kind === "call-off" ? "Vacation Day" : "Call Off");
      expect(entry?.start).toBe(DAY);
      expect(entry?.end).toBeNull();
      expect(entry?.id).toBe(manualMirrorId(DAY, "Francisco Ramirez"));
    }
    const vacation = mirrorEntryFromManual(
      DAY,
      { name: "Francisco Ramirez", kind: "vacation" },
      "2026-09-30T16:00:00.000Z",
    );
    expect(vacation?.reason).toBe("Vacation Day");

    const first = reconcileTodayCallOffs({
      manuals: { [DAY]: [{ name: "Francisco Ramirez", kind: "vacation" }] },
      rows: [],
      deletedIds: [],
    });
    expect(first.logUpserts).toEqual([
      { date: DAY, off: { name: "Francisco Ramirez", kind: "vacation" } },
    ]);
    expect(first.changed).toBe(false);

    const mirrored = mirrorEntryFromManual(
      DAY,
      first.logUpserts[0].off,
      "2026-09-30T16:00:00.000Z",
    )!;
    const cutoff = addDays(TODAY, -30);
    const yesterday = "2026-09-29";
    expect(callOffLogRowVisible(mirrored, "all", TODAY, yesterday, cutoff)).toBe(true);
    expect(callOffLogRowVisible(mirrored, "today", TODAY, yesterday, cutoff)).toBe(true);
    expect(callOffLogRowVisible(mirrored, "upcoming", TODAY, yesterday, cutoff)).toBe(true);
    expect(callOffLogRowVisible(mirrored, "yesterday", TODAY, yesterday, cutoff)).toBe(false);

    const settled = reconcileTodayCallOffs({
      manuals: first.manuals,
      rows: [mirrored],
      deletedIds: [],
    });
    expect(settled.logUpserts).toEqual([]);
    expect(settled.changed).toBe(false);
    expect(settled.manuals[DAY]).toEqual([{ name: "Francisco Ramirez", kind: "vacation" }]);
  });

  it("does not mirror a Sunday manual into the log", () => {
    const sunday = "2026-09-27";
    const result = reconcileTodayCallOffs({
      manuals: { [sunday]: [{ name: "Glen Barker", kind: "vacation" }] },
      rows: [],
      deletedIds: [],
    });
    expect(result.logUpserts).toEqual([]);
  });

  it("does not add a second log row when Call Offs already covers that Chicago day", () => {
    const existing = row({
      id: "log-1",
      name: "Glen Barker",
      start: DAY,
      reason: "P-Day",
    });
    const result = reconcileTodayCallOffs({
      manuals: { [DAY]: [{ name: "glen barker", kind: "call-off" }] },
      rows: [existing],
      deletedIds: [],
    });
    expect(result.logUpserts).toEqual([]);
    expect(result.manuals[DAY]?.map((off) => off.kind)).toEqual(["call-off"]);
  });

  it("drops the Today manual when Call Offs deletes the mirror, and does not resurrect it", () => {
    const id = manualMirrorId(DAY, "Glen Barker");
    const dropped = reconcileTodayCallOffs({
      manuals: { [DAY]: [{ name: "Glen Barker", kind: "p-day" }] },
      rows: [],
      deletedIds: [id],
    });
    expect(dropped.manuals[DAY]).toBeUndefined();
    expect(dropped.manualDeletedKeys).toContain(deletedManualKey(DAY, "Glen Barker"));
    expect(dropped.logUpserts).toEqual([]);

    const again = reconcileTodayCallOffs({
      manuals: dropped.manuals,
      rows: [],
      deletedIds: [id],
      manualDeletedKeys: dropped.manualDeletedKeys,
    });
    expect(again.changed).toBe(false);
    expect(again.logUpserts).toEqual([]);
    expect(again.manuals).toEqual({});
  });

  it("follows a Call Offs edit of the mirrored reason and date", () => {
    const id = manualMirrorId(DAY, "Francisco Ramirez");
    const edited = row({
      id,
      name: "Francisco Ramirez",
      start: "2026-10-01",
      reason: "Vacation Day",
    });
    const result = reconcileTodayCallOffs({
      manuals: { [DAY]: [{ name: "Francisco Ramirez", kind: "call-off" }] },
      rows: [edited],
      deletedIds: [],
    });
    expect(result.manuals[DAY]).toBeUndefined();
    expect(result.manuals["2026-10-01"]).toEqual([
      { name: "Francisco Ramirez", kind: "vacation" },
    ]);
    expect(result.remoteUpserts).toEqual([
      { date: "2026-10-01", off: { name: "Francisco Ramirez", kind: "vacation" } },
    ]);
    expect(result.logUpserts).toEqual([]);
    expect(result.manualDeletedKeys).toContain(deletedManualKey(DAY, "Francisco Ramirez"));

    const stable = reconcileTodayCallOffs({
      manuals: result.manuals,
      rows: [edited],
      deletedIds: [],
      manualDeletedKeys: result.manualDeletedKeys,
    });
    expect(stable.changed).toBe(false);
    expect(stable.logUpserts).toEqual([]);
    expect(stable.manuals["2026-10-01"]?.[0].kind).toBe("vacation");
  });

  it("removes only the single-day log rows for that Chicago day", () => {
    const mirror = manualMirrorId(DAY, "Glen Barker");
    const rows = [
      row({ id: mirror, name: "Glen Barker", start: DAY, reason: "Call Off" }),
      row({ id: "other-single", name: "Glen Barker", start: DAY, reason: "NCNS" }),
      row({
        id: "range",
        name: "Glen Barker",
        start: DAY,
        end: "2026-10-02",
        reason: "Vacation Day",
      }),
      row({ id: "other-day", name: "Glen Barker", start: "2026-10-03", reason: "P-Day" }),
    ];
    expect(logIdsRemovedWithManual(rows, DAY, "Glen Barker").sort()).toEqual(
      [mirror, "other-single"].sort(),
    );
    expect(
      canRemoveTodayCallOff({
        name: "Glen Barker",
        date: DAY,
        manuals: [{ name: "Glen Barker", kind: "call-off" }],
        rows,
      }),
    ).toBe(false);
    expect(
      canRemoveTodayCallOff({
        name: "Glen Barker",
        date: DAY,
        manuals: [{ name: "Glen Barker", kind: "vacation" }],
        rows: [rows[0]],
      }),
    ).toBe(true);
    expect(
      canRemoveTodayCallOff({
        name: "Solo Manual",
        date: DAY,
        manuals: [{ name: "Solo Manual", kind: "fmla" }],
        rows: [],
      }),
    ).toBe(true);
    expect(
      canRemoveTodayCallOff({
        name: "Nobody",
        date: DAY,
        manuals: [],
        rows: [],
      }),
    ).toBe(false);
  });

  it("does not double-count a manual and its log mirror, and ignores yard and the load queue", () => {
    const mirrored = mirrorEntryFromManual(
      DAY,
      { name: "Pablo Cruz", kind: "call-off" },
      "2026-09-30T16:00:00.000Z",
    )!;
    const rows = withManualOffs(
      [{ name: mirrored.name, start: mirrored.start, end: null, reason: mirrored.reason }],
      [{ name: "Pablo Cruz", kind: "call-off" }],
      DAY,
    );
    expect(fullDayOffCount(rows, DAY)).toBe(1);
    const late = withManualOffs(
      [],
      [{ name: "Late Guy", kind: "late-early" }],
      DAY,
    );
    expect(fullDayOffCount(late, DAY)).toBe(0);

    const src = readFileSync(new URL("./todayCallOffSync.ts", import.meta.url), "utf8");
    expect(src).not.toContain("enqueueUpsert");
    expect(src).not.toContain("QUEUE_KEY");
    expect(src).not.toMatch(/\byard\b/i);
    const context = readFileSync(new URL("../store/DriversContext.tsx", import.meta.url), "utf8");
    expect(context).toContain("reconcileTodayCallOffs");
    expect(context).not.toContain("enqueueUpsert");
  });
});
