import { describe, expect, it } from "vitest";
import {
  DISPATCH_ACTIVE_VACATION_YEAR,
  DISPATCH_HIRE_DATES,
  addVacationDay,
  anniversaryInYear,
  applyDispatchVacationSeed,
  bankDays,
  daysLeft,
  daysUsed,
  dutyLabel,
  ensureDispatchVacationSeed,
  removeVacation,
  saturdaysOfYear,
  seedBoard,
  setCrewStart,
  setCrewWeeks,
  setSaturdayDuty,
  setSaturdayNote,
  vacationChipLabel,
  vacationWeeksForBank,
  vacationWeeksFromTenure,
  isPlausibleHireDate,
  yearsEmployed,
  type DispatchStore,
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
    let board = seedBoard(2027);
    board = addVacationDay(board, "tim", "2027-03-16");
    board = addVacationDay(board, "tim", "2027-03-17");
    board = addVacationDay(board, "tim", "2027-03-16");
    expect(daysUsed(board.vacations, "tim")).toBe(2);
    expect(daysLeft(board, "tim")).toBe(13);
    expect(daysLeft(board, "mike")).toBe(10);
    expect(vacationChipLabel(board.vacations[0])).toBe("Mar 16");
  });

  it("drops a day when the chip is removed", () => {
    let board = addVacationDay(seedBoard(2027), "keith", "2027-04-06", "k1");
    board = removeVacation(board, "k1");
    expect(daysUsed(board.vacations, "keith")).toBe(0);
    expect(daysLeft(board, "keith")).toBe(15);
  });

  it("allows a date in the next calendar year on a bank-year board", () => {
    // 2025 seed already includes Tim 2026-01-19; add a fresh cross-year day.
    const board = addVacationDay(seedBoard(2025), "tim", "2026-10-01", "t1");
    expect(board.vacations.some((use) => use.id === "t1" && use.start === "2026-10-01")).toBe(true);
    expect(daysUsed(board.vacations, "tim")).toBe(13);
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
    let board = seedBoard(2027);
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

  it("computes weeks from tenure at the bank-year anniversary, not today", () => {
    expect(vacationWeeksFromTenure(0)).toBe(1);
    expect(vacationWeeksFromTenure(4)).toBe(1);
    expect(vacationWeeksFromTenure(5)).toBe(2);
    expect(vacationWeeksFromTenure(8)).toBe(2);
    expect(vacationWeeksFromTenure(9)).toBe(3);
    expect(anniversaryInYear(DISPATCH_HIRE_DATES.keith, 2025)).toBe("2025-05-12");
    expect(anniversaryInYear(DISPATCH_HIRE_DATES.keith, 2026)).toBe("2026-05-12");
    // As of today Keith has 9 years, but the 2025 bank opened at 8 years → 2 weeks.
    expect(yearsEmployed(DISPATCH_HIRE_DATES.keith, "2026-10-05")).toBe(9);
    expect(yearsEmployed(DISPATCH_HIRE_DATES.keith, "2025-05-12")).toBe(8);
    expect(vacationWeeksForBank("keith", DISPATCH_HIRE_DATES.keith, 2025)).toBe(2);
    expect(vacationWeeksForBank("keith", DISPATCH_HIRE_DATES.keith, 2026)).toBe(3);
    expect(vacationWeeksForBank("tim", DISPATCH_HIRE_DATES.tim, 2025)).toBe(3);
    expect(vacationWeeksForBank("mike", DISPATCH_HIRE_DATES.mike, 2025)).toBe(2);
    expect(vacationWeeksForBank("mike", DISPATCH_HIRE_DATES.mike, 2026)).toBe(2);
    expect(DISPATCH_ACTIVE_VACATION_YEAR).toEqual({ tim: 2025, keith: 2025, mike: 2026 });
  });
});

describe("dispatch vacation sheet import", () => {
  it("seeds Tim/Keith on 2025 and Mike on 2025+2026 without wiping Saturdays", () => {
    const empty: DispatchStore = { version: 1, years: {} };
    const store = ensureDispatchVacationSeed(empty);
    const y2025 = store.years["2025"];
    const y2026 = store.years["2026"];
    expect(y2025).toBeTruthy();
    expect(y2026).toBeTruthy();

    expect(daysUsed(y2025.vacations, "tim")).toBe(12);
    expect(daysLeft(y2025, "tim")).toBe(3);
    expect(y2025.crew.find((m) => m.id === "tim")).toMatchObject({
      startDate: "2005-05-01",
      weeks: 3,
    });

    expect(daysUsed(y2025.vacations, "keith")).toBe(7);
    expect(daysLeft(y2025, "keith")).toBe(3);
    expect(y2025.crew.find((m) => m.id === "keith")).toMatchObject({
      startDate: "2017-05-12",
      weeks: 2,
    });
    // 2026 bank (not started yet) would be 3 weeks after the May 2026 anniversary.
    expect(y2026.crew.find((m) => m.id === "keith")).toMatchObject({
      startDate: "2017-05-12",
      weeks: 3,
    });

    expect(daysUsed(y2025.vacations, "mike")).toBe(8);
    expect(daysUsed(y2026.vacations, "mike")).toBe(5);
    expect(daysLeft(y2026, "mike")).toBe(5);
    expect(y2026.crew.find((m) => m.id === "mike")).toMatchObject({
      startDate: "2022-02-22",
      weeks: 2,
    });

    // Saturday 2026 sheet still present
    expect(y2026.saturdays.find((row) => row.date === "2026-10-03")?.duty).toBe("keith");
    expect(y2026.log).toHaveLength(4);

    // Re-seed is a no-op for vacation chips
    const again = applyDispatchVacationSeed(y2025);
    expect(daysUsed(again.vacations, "tim")).toBe(12);
  });



  it("keeps epoch updatedAt on brand-new seeded boards so cloud Saturdays win", () => {
    const store = ensureDispatchVacationSeed({ version: 1, years: {} });
    expect(store.years["2026"]?.updatedAt).toBe("1970-01-01T00:00:00.000Z");
    expect(store.years["2025"]?.updatedAt).toBe("1970-01-01T00:00:00.000Z");
    expect(store.years["2026"]?.saturdays.find((row) => row.date === "2026-10-10")?.duty).toBe("mike");
  });

  it("stamps now only when healing an existing board", () => {
    let board = seedBoard(2025);
    board = { ...board, updatedAt: "2026-10-01T00:00:00.000Z" };
    board = setCrewWeeks(board, "keith", 3);
    const store = ensureDispatchVacationSeed({ version: 1, years: { "2025": board } });
    expect(store.years["2025"]?.crew.find((m) => m.id === "keith")?.weeks).toBe(2);
    expect(store.years["2025"]?.updatedAt > "2026-10-01T00:00:00.000Z").toBe(true);
  });

    it("preserves manual week edits and only heals Keith 2025 3?2", () => {
    let board = seedBoard(2025);
    board = setCrewWeeks(board, "mike", 4);
    board = setCrewWeeks(board, "keith", 3);
    const seeded = applyDispatchVacationSeed(board);
    expect(seeded.crew.find((m) => m.id === "mike")?.weeks).toBe(4);
    expect(seeded.crew.find((m) => m.id === "keith")?.weeks).toBe(2);
    expect(applyDispatchVacationSeed(seeded)).toBe(seeded);
  });
  it("does not overwrite existing vacation chips", () => {
    let board = seedBoard(2027);
    board = {
      ...board,
      year: 2025,
      vacations: [],
      crew: board.crew.map((m) => ({ ...m, startDate: null })),
    };
    board = addVacationDay(board, "tim", "2025-06-01", "manual-tim");
    const seeded = applyDispatchVacationSeed(board);
    expect(daysUsed(seeded.vacations, "tim")).toBe(1);
    expect(seeded.vacations[0].id).toBe("manual-tim");
  });
});
