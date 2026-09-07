import { describe, expect, it } from "vitest";
import { dailyCounts } from "./analytics";
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
