import { describe, expect, it } from "vitest";
import { parseSheetDate } from "./chicagoDate";
import {
  availableDrivers,
  callOffAppliesToDay,
  fullDayOffCount,
  isFullDayOff,
  parseCallOffCsv,
  type CallOffRow,
} from "./driverAvailability";

const SUBTRACT = [
  "P-Day",
  "P-day",
  "1 P-Day",
  "Call Off",
  "Call Off, taking kid to school",
  "FMLA Day",
  "ok'd off",
  "Ok'd Off",
  "Ok'd day off",
  "ok'd off.",
  "ok'd off, told when hired",
  "Ok'd off, when hired",
  "Jury Duty",
  "Court at 1pm.",
  "Vacation Day",
  "1 vacation day",
  "Bereavement, father died",
  "Last Day , retiring",
  "Last Day, Retiring",
];

const KEEP = [
  "Needs to be parked by noon",
  "needs to park by 11am.",
  "needs to park by 1pm",
  "Parked at 3:30Pm",
  "Parked by Noon",
  "Parked by 1:30pm",
  "coming in a bit late, needs to sign papers",
  "ok'd to do 1 load",
  "ok'd to do 2 loads, dr. apt.",
  "Ok'd to do 2 loads",
  "ok'd to come in at noon",
  "Ok'd to come in late, 11am",
  "ok'd to come in late, kid going to school",
  "Ok'd to park empty, need trailer work",
  "ok'd to park by 3 pm",
  "ok;d to park early",
  "dr. apt in the morning, coming in after.",
  "taking daughter to dr. need to park at noon",
  "needing to park by noon",
  "",
  "dr. apt",
];

describe("isFullDayOff", () => {
  it("subtracts full-day / status offs from the live sheet", () => {
    for (const reason of SUBTRACT) {
      expect(isFullDayOff(reason), reason).toBe(true);
    }
  });

  it("does not subtract operational notes or unsure reasons", () => {
    for (const reason of KEEP) {
      expect(isFullDayOff(reason), reason).toBe(false);
    }
  });
});

describe("through-date ranges", () => {
  const row: CallOffRow = {
    name: "Jovan Morris",
    start: "2026-08-26",
    end: "2026-08-29",
    reason: "ok'd off, told when hired",
  };

  it("counts each inclusive day in the through range", () => {
    expect(callOffAppliesToDay(row, "2026-08-25")).toBe(false);
    expect(callOffAppliesToDay(row, "2026-08-26")).toBe(true);
    expect(callOffAppliesToDay(row, "2026-08-27")).toBe(true);
    expect(callOffAppliesToDay(row, "2026-08-28")).toBe(true);
    expect(callOffAppliesToDay(row, "2026-08-29")).toBe(true);
    expect(callOffAppliesToDay(row, "2026-08-30")).toBe(false);
  });

  it("treats a blank through date as that call-off day only", () => {
    const single: CallOffRow = {
      name: "Crandall Wells",
      start: "2026-08-06",
      end: null,
      reason: "Call Off",
    };
    expect(callOffAppliesToDay(single, "2026-08-06")).toBe(true);
    expect(callOffAppliesToDay(single, "2026-08-07")).toBe(false);
  });
});

describe("availableDrivers", () => {
  it("is L13 minus unique full-day offs, floored at 0", () => {
    const rows: CallOffRow[] = [
      { name: "A", start: "2026-09-05", end: null, reason: "P-Day" },
      { name: "B", start: "2026-09-05", end: null, reason: "Needs to be parked by noon" },
      { name: "C", start: "2026-09-05", end: null, reason: "ok'd off" },
    ];
    expect(availableDrivers(143, rows, "2026-09-05")).toEqual({
      date: "2026-09-05",
      base: 143,
      offs: 2,
      available: 141,
    });
    expect(availableDrivers(1, rows, "2026-09-05").available).toBe(0);
  });

  it("does not double-count the same driver twice on one day", () => {
    const rows: CallOffRow[] = [
      { name: "Jim Schroeder", start: "2026-08-03", end: null, reason: "P-Day" },
      { name: "Jim Schroeder", start: "2026-08-03", end: null, reason: "Call Off" },
    ];
    expect(fullDayOffCount(rows, "2026-08-03")).toBe(1);
  });
});

describe("parseSheetDate + CSV", () => {
  it("reads US sheet dates", () => {
    expect(parseSheetDate("8/3/26")).toBe("2026-08-03");
    expect(parseSheetDate("9/1/2026")).toBe("2026-09-01");
    expect(parseSheetDate("8/29/2026")).toBe("2026-08-29");
  });

  it("parses the live header row and a through-date line", () => {
    const csv = [
      "Name,Call Off ,Through Date,Reason",
      "Tim Rozzoni,8/3/26,,Jury Duty",
      'Jovan Morris,8/26/26,8/29/2026,"ok\'d off, told when hired"',
      "Martell Beasley,8/6/26,,Needs to be parked by noon",
    ].join("\n");
    const rows = parseCallOffCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({
      name: "Jovan Morris",
      start: "2026-08-26",
      end: "2026-08-29",
    });
    expect(isFullDayOff(rows[2].reason)).toBe(false);
  });
});
