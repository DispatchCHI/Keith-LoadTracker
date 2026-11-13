import { describe, expect, it } from "vitest";
import { vacationDaysLeftForDriver, vacationWeeksForCompletedYears } from "./driverVacation";

const AS_OF = "2026-11-10";

function entry(
  name: string,
  weekOf: string,
  note = "",
  startOn: string | null = null,
  endOn: string | null = null,
) {
  return { name, weekOf, startOn, endOn, note };
}

describe("driver vacation weeks", () => {
  it("follows completed years: 0 / 1 / 2 / 3 / 4 weeks", () => {
    expect(vacationWeeksForCompletedYears(0)).toBe(0);
    expect(vacationWeeksForCompletedYears(0.9)).toBe(0);
    expect(vacationWeeksForCompletedYears(1)).toBe(1);
    expect(vacationWeeksForCompletedYears(2)).toBe(1);
    expect(vacationWeeksForCompletedYears(3)).toBe(2);
    expect(vacationWeeksForCompletedYears(8)).toBe(2);
    expect(vacationWeeksForCompletedYears(9)).toBe(3);
    expect(vacationWeeksForCompletedYears(14)).toBe(3);
    expect(vacationWeeksForCompletedYears(15)).toBe(4);
    expect(vacationWeeksForCompletedYears(27)).toBe(4);
  });
});

describe("vacation days left", () => {
  it("is 0 weeks before the first anniversary and 1 week on it", () => {
    const before = vacationDaysLeftForDriver({
      name: "New Driver",
      hireDate: "2025-11-11",
      asOf: AS_OF,
    });
    expect(before).toMatchObject({ known: true, years: 0, weeks: 0, grantedDays: 0, left: 0 });
    const onDay = vacationDaysLeftForDriver({
      name: "New Driver",
      hireDate: "2025-11-10",
      asOf: AS_OF,
    });
    expect(onDay).toMatchObject({ years: 1, weeks: 1, grantedDays: 5, usedDays: 0, left: 5 });
  });

  it("steps up at 3, 9, and 15 completed years", () => {
    expect(
      vacationDaysLeftForDriver({ name: "A", hireDate: "2023-11-10", asOf: AS_OF }).grantedDays,
    ).toBe(10);
    expect(
      vacationDaysLeftForDriver({ name: "A", hireDate: "2017-11-10", asOf: AS_OF }).grantedDays,
    ).toBe(15);
    expect(
      vacationDaysLeftForDriver({ name: "A", hireDate: "2011-11-10", asOf: AS_OF }).grantedDays,
    ).toBe(20);
  });

  it("spends a normal week, a paid-out week, and a single weekday", () => {
    const normal = vacationDaysLeftForDriver({
      name: "Samuel Feliciano",
      hireDate: "2025-11-10",
      asOf: AS_OF,
      entries: [entry("Samuel Feliciano", "2026-01-04")],
    });
    expect(normal.usedDays).toBe(5);
    expect(normal.left).toBe(0);

    const paid = vacationDaysLeftForDriver({
      name: "Samuel Feliciano",
      hireDate: "2023-11-10",
      asOf: AS_OF,
      entries: [entry("Samuel Feliciano", "2026-01-04", "paid out")],
    });
    expect(paid.grantedDays).toBe(10);
    expect(paid.usedDays).toBe(5);
    expect(paid.left).toBe(5);

    const oneDay = vacationDaysLeftForDriver({
      name: "Samuel Feliciano",
      hireDate: "2025-11-10",
      asOf: AS_OF,
      entries: [entry("Samuel Feliciano", "2026-01-04", "", "2026-01-05", "2026-01-05")],
    });
    expect(oneDay.usedDays).toBe(1);
    expect(oneDay.left).toBe(4);
  });

  it("counts a Vacation Day that is not already on the board", () => {
    const tally = vacationDaysLeftForDriver({
      name: "Samuel Feliciano",
      hireDate: "2025-11-10",
      asOf: AS_OF,
      entries: [entry("Samuel Feliciano", "2026-01-04", "", "2026-01-05", "2026-01-05")],
      logRows: [{ name: "Samuel Feliciano", start: "2026-01-05", end: null, reason: "Vacation Day" }, { name: "Samuel Feliciano", start: "2026-02-02", end: null, reason: "Vacation Day" }],
    });
    expect(tally.usedDays).toBe(2);
    expect(tally.left).toBe(3);
  });

  it("shows unknown instead of zero when the hire date is missing", () => {
    const tally = vacationDaysLeftForDriver({
      name: "Samuel Feliciano",
      hireDate: null,
      asOf: AS_OF,
      entries: [entry("Samuel Feliciano", "2026-01-04", "paid out")],
    });
    expect(tally.known).toBe(false);
    expect(tally.left).toBeNull();
  });
});
