import { describe, expect, it } from "vitest";
import {
  analyticsWeeks,
  dailyCounts,
  formatPercentChange,
  formatSignedCount,
  sumDailyCounts,
  weekComparison,
} from "./analytics";
import { addDays, weekStartingSunday } from "./chicagoDate";
import type { Load } from "../types";

function load(id: string, date: string): Load {
  return {
    id,
    truck: "418",
    pickup: "Melrose",
    commodity: "Trash (MSW)",
    destination: "Covanta",
    stationId: "melrose",
    date,
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
  };
}

describe("dailyCounts", () => {
  it("keeps each Chicago date's own load count when another date is selected", () => {
    const loads = [
      load("a", "2026-09-03"),
      load("b", "2026-09-03"),
      load("c", "2026-09-04"),
      load("d", "2026-09-05"),
      load("e", "2026-09-05"),
      load("f", "2026-09-05"),
    ];
    const week = [
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ];
    const selected = "2026-09-05";
    const rows = dailyCounts(loads, week);

    expect(rows.find((row) => row.date === selected)?.count).toBe(3);
    expect(rows.find((row) => row.date === "2026-09-03")?.count).toBe(2);
    expect(rows.find((row) => row.date === "2026-09-04")?.count).toBe(1);
    expect(rows.find((row) => row.date === "2026-09-06")?.count).toBe(0);
    expect(new Set(rows.map((row) => row.count)).size).toBeGreaterThan(1);
  });
});

describe("week comparisons", () => {
  it("sums a week's daily counts", () => {
    expect(
      sumDailyCounts([
        { date: "2026-09-27", count: 18 },
        { date: "2026-09-28", count: 47 },
      ]),
    ).toBe(65);
  });

  it("formats a signed count and a one-decimal percent", () => {
    expect(formatSignedCount(538)).toBe("+538");
    expect(formatSignedCount(-13)).toBe("-13");
    expect(formatSignedCount(0)).toBe("0");
    expect(formatPercentChange(8642, 8104)).toBe("+6.6%");
    expect(formatPercentChange(208, 221)).toBe("-5.9%");
    expect(formatPercentChange(5, 0)).toBeNull();
  });
});

describe("analyticsWeeks and weekComparison", () => {
  const today = "2026-11-02"; // Monday, week of Nov 1

  it("runs every week back to the week holding Jan 1 and stays newest first", () => {
    const weeks = analyticsWeeks(["2026-01-01", "2026-06-10", "2026-11-02"], today);
    expect(weeks[0][0]).toBe("2026-11-01");
    expect(weeks[weeks.length - 1][0]).toBe("2025-12-28");
    expect(weeks).toHaveLength(45);
    const starts = weeks.map((w) => w[0]);
    expect([...starts].sort().reverse()).toEqual(starts);
    for (const w of weeks) expect(w).toHaveLength(7);
  });

  it("stops at the earliest week that has data, but never shows fewer than 6", () => {
    const weeks = analyticsWeeks(["2026-09-15", "2026-11-02"], today);
    expect(weeks[weeks.length - 1][0]).toBe("2026-09-13");
    expect(weeks).toHaveLength(8);
    expect(analyticsWeeks([], today)).toHaveLength(6);
  });

  it("ignores last-year loads when picking the first week", () => {
    const weeks = analyticsWeeks(["2025-03-03", "2026-10-20"], today);
    expect(weeks[weeks.length - 1][0]).toBe("2026-09-27");
    expect(weeks).toHaveLength(6);
  });

  it("compares the first week of the year with Dec 2025 and with 364 days back", () => {
    const counts: Record<string, number> = {
      "2026-01-01": 5, // Thu
      "2026-01-02": 3, // Fri
      "2025-12-28": 10, // Sun, the prior week's Sunday is Dec 21 -> use Dec 21
      "2025-12-21": 7,
      "2025-12-25": 4, // Thu, prior-week match for Jan 1
      "2025-01-02": 6, // Thu 364 days before Jan 1 2026
    };
    const countOn = (iso: string) => counts[iso] ?? 0;
    const first = weekStartingSunday("2026-01-01");
    const cmp = weekComparison(countOn, first, today);
    expect(first[0]).toBe("2025-12-28");
    expect(cmp.total).toBe(8 + 10);
    // prior week (Dec 21-27): Dec 21 = 7, Dec 25 = 4
    expect(cmp.prior).toBe(7 + 4);
    // last year: Dec 29 2024 .. Jan 4 2025 -> Jan 2 2025 = 6
    expect(cmp.lastYear).toBe(6);
  });

  it("only counts elapsed days in the current week", () => {
    const countOn = (iso: string) => (iso <= "2026-11-02" ? 1 : 100);
    const cmp = weekComparison(countOn, weekStartingSunday(today), today);
    expect(cmp.total).toBe(2);
  });

  it("handles about 44 weeks of data quickly", () => {
    const dates: string[] = [];
    for (let i = 0; i < 307; i++) dates.push(addDays("2026-01-01", i));
    const t0 = Date.now();
    const weeks = analyticsWeeks(dates, today);
    const countOn = () => 1;
    for (const w of weeks) weekComparison(countOn, w, today);
    expect(weeks.length).toBe(45);
    expect(Date.now() - t0).toBeLessThan(200);
  });
});
