import { describe, expect, it } from "vitest";
import type { Load } from "../types";
import { loadsForDate, upsertLoad, type Persisted } from "./storage";

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

describe("loadsByDate isolation", () => {
  it("does not rewrite other dates when a load is saved on the selected day", () => {
    let store: Persisted = { version: 1, loadsByDate: {} };
    store = upsertLoad(store, load("fri", "2026-09-04"));
    store = upsertLoad(store, load("fri-2", "2026-09-04"));
    store = upsertLoad(store, load("sat", "2026-09-05"));

    expect(loadsForDate(store, "2026-09-04")).toHaveLength(2);
    expect(loadsForDate(store, "2026-09-05")).toHaveLength(1);

    store = upsertLoad(store, load("sat-2", "2026-09-05"));

    expect(loadsForDate(store, "2026-09-04").map((row) => row.id)).toEqual([
      "fri",
      "fri-2",
    ]);
    expect(loadsForDate(store, "2026-09-05")).toHaveLength(2);
    expect(loadsForDate(store, "2026-09-03")).toHaveLength(0);
  });
});
