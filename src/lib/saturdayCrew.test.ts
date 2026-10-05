import { describe, expect, it } from "vitest";
import {
  addVacationDay,
  bankDays,
  daysLeft,
  daysUsed,
  dutyLabel,
  removeVacation,
  saturdaysOfYear,
  seedBoard,
  setCrewStart,
  setCrewWeeks,
  setSaturdayDuty,
  setSaturdayNote,
  vacationChipLabel,
  isPlausibleHireDate,
  yearsEmployed,
} from "./saturdayCrew";

describe("2026 Saturday sheet", () => {
  const board = seedBoard(2026);

  it("lists every Saturday and the holiday rows from the sheet", () => {
    expect(board.saturdays).toHaveLength(52);
    expect(saturdaysOfYear(2026)).toHaveLength(52);
    const byDate = new Map(board.saturdays.map((row) => [row.date, row]));
    expect(byDate.get("2026-01-03")).toMatchObject({
      duty: "everyone",
      note: "New Years Day",
    });
    expect(byDate.get("2026-05-30")?.duty).toBe("everyone");
    expect(byDate.get("2026-07-04")).toMatchObject({ duty: "open", note: "4th of July" });
    expect(byDate.get("2026-07-11")).toMatchObject({ duty: "mike", with: "tim" });
    expect(byDate.get("2026-07-18")).toMatchObject({ duty: "tim", with: "mike" });
    expect(byDate.get("2026-08-15")).toMatchObject({ duty: "keith", with: "mike" });
    expect(byDate.get("2026-08-22")).toMatchObject({ duty: "mike", with: "keith" });
    expect(byDate.get("2026-09-12")?.note).toBe("Labor Day");
    expect(byDate.get("2026-10-03")?.duty).toBe("keith");
    expect(byDate.get("2026-11-28")?.duty).toBe("everyone");
    expect(byDate.get("2026-12-26")).toMatchObject({ duty: "everyone", note: "Christmas" });
    expect(board.log.map((entry) => entry.text)).toEqual([
      "Jul 11 Mike with Tim",
      "Jul 18 Tim with Mike",
      "Aug 15 Keith with Mike",
      "Aug 22 Mike with Keith",
    ]);
  });
});

describe("vacation days", () => {
  it("counts single days against the bank and ignores a repeat", () => {
    let board = seedBoard(2026);
    board = addVacationDay(board, "tim", "2026-03-16");
    board = addVacationDay(board, "tim", "2026-03-17");
    board = addVacationDay(board, "tim", "2026-03-16");
    expect(daysUsed(board.vacations, "tim")).toBe(2);
    expect(daysLeft(board, "tim")).toBe(13);
    expect(daysLeft(board, "mike")).toBe(10);
    expect(vacationChipLabel(board.vacations[0])).toBe("Mar 16");
  });

  it("drops a day when the chip is removed", () => {
    let board = addVacationDay(seedBoard(2026), "keith", "2026-04-06", "k1");
    board = removeVacation(board, "k1");
    expect(daysUsed(board.vacations, "keith")).toBe(0);
    expect(daysLeft(board, "keith")).toBe(15);
  });

  it("rejects a date outside the board year", () => {
    const board = addVacationDay(seedBoard(2026), "mike", "2025-07-20");
    expect(board.vacations).toHaveLength(0);
  });
});

describe("saturday edits", () => {
  it("records who works and clears a sheet switch", () => {
    const next = setSaturdayDuty(seedBoard(2026), "2026-07-11", "keith");
    const row = next.saturdays.find((item) => item.date === "2026-07-11");
    expect(row).toMatchObject({ duty: "keith", with: null });
    expect(next.log.at(-1)?.text).toBe("Jul 11 set to Keith");
    expect(setSaturdayDuty(next, "2026-07-11", "keith")).toBe(next);
  });

  it("logs a note change", () => {
    const next = setSaturdayNote(seedBoard(2026), "2026-10-03", "Coverage");
    expect(next.saturdays.find((row) => row.date === "2026-10-03")?.note).toBe("Coverage");
    expect(next.log.at(-1)?.text).toBe("Oct 3 note: Coverage");
    expect(dutyLabel("everyone")).toBe("Everyone");
  });
});

describe("crew vacation bank", () => {
  it("turns extra weeks into 5 days each and keeps the start date", () => {
    let board = seedBoard(2026);
    board = setCrewWeeks(board, "mike", 3);
    board = setCrewStart(board, "mike", "2014-03-01");
    expect(bankDays(3)).toBe(15);
    expect(daysLeft(board, "mike")).toBe(15);
    expect(yearsEmployed("2014-03-01", "2026-10-02")).toBe(12);
    expect(yearsEmployed("2014-11-01", "2026-10-02")).toBe(11);
    expect(isPlausibleHireDate("0002-10-05", "2026-10-05")).toBe(false);
    expect(isPlausibleHireDate("0202-10-05", "2026-10-05")).toBe(false);
    expect(isPlausibleHireDate("2014-03-01", "2026-10-05")).toBe(true);
    expect(yearsEmployed("0002-10-05", "2026-10-05")).toBeNull();
    expect(setCrewStart(board, "mike", "0002-10-05")).toBe(board);
    expect(board.crew.find((member) => member.id === "mike")).toMatchObject({
      weeks: 3,
      startDate: "2014-03-01",
    });
    expect(setCrewWeeks(board, "mike", 3)).toBe(board);
  });
});
