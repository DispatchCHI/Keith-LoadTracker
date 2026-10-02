import { describe, expect, it } from "vitest";
import { dailyCounts, formatPercentChange, formatSignedCount, sumDailyCounts } from "./analytics";
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
