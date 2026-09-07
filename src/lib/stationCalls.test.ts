import { describe, expect, it } from "vitest";
import {
  effectiveClose,
  emptyBoard,
  setStationClose,
  setStationHour,
  startForStation,
  type StationCallStore,
} from "./stationCalls";

describe("station call carry-over", () => {
  it("uses prior Close as next Start", () => {
    let store: StationCallStore = {};
    store = setStationClose(store, "2026-09-05", "melrose", 15);
    expect(startForStation(store, "2026-09-06", "melrose")).toBe(15);
    expect(startForStation(store, "2026-09-06", "calumet")).toBe(0);
  });

  it("falls back to last hour when Close is blank", () => {
    let store: StationCallStore = {};
    store = setStationHour(store, "2026-09-05", "northlake", "6", 10);
    store = setStationHour(store, "2026-09-05", "northlake", "9", 12);
    const row = store["2026-09-05"]!.northlake!;
    expect(effectiveClose(row, 0)).toBe(12);
    expect(startForStation(store, "2026-09-06", "northlake")).toBe(12);
  });

  it("starts empty hours", () => {
    const board = emptyBoard();
    expect(board["apollo"]?.hours).toEqual({});
    expect(board["apollo"]?.close).toBeNull();
  });
});
