import { describe, expect, it } from "vitest";
import {
  addSpecialtySlot,
  consumeSpecialtyOpensAny,
  countSpecialtyOpens,
  countSpecialtyOpensAny,
  resolveSpecialtyBoardMatch,
  specialtyPinnedLaneChips,
  type SpecialtyStore,
} from "./specialtyBoard";

const date = "2026-10-14";

function log(store: SpecialtyStore, pickup: string, dest: string, commodity: string, qty = 1) {
  const lane = resolveSpecialtyBoardMatch("wheeling", pickup, dest, commodity);
  expect(lane).not.toBeNull();
  return consumeSpecialtyOpensAny(store, date, lane!.specialtyId, lane!.chips, qty);
}

describe("Wheeling destination-pinned lanes", () => {
  it("offers Recycle · Groot in the + picker", () => {
    const chips = specialtyPinnedLaneChips("wheeling", ["Recycle", "Yard waste"]);
    expect(chips).toContain("Recycle \u00b7 Groot");
    expect(chips).toContain("Yard waste \u00b7 Thelens");
  });

  it("Recycle → Groot burns the Groot lane before the generic Recycle lane", () => {
    let store = addSpecialtySlot({}, date, "wheeling", "Recycle \u00b7 Groot");
    store = addSpecialtySlot(store, date, "wheeling", "Recycle");
    store = log(store, "Wheeling", "Groot", "Recycle");
    expect(countSpecialtyOpens(store, date, "wheeling", "Recycle \u00b7 Groot")).toBe(0);
    expect(countSpecialtyOpens(store, date, "wheeling", "Recycle")).toBe(1);
  });

  it("Recycle → Hodgkins burns the generic Recycle lane, never the Groot lane", () => {
    let store = addSpecialtySlot({}, date, "wheeling", "Recycle \u00b7 Groot");
    store = addSpecialtySlot(store, date, "wheeling", "Recycle");
    store = log(store, "Wheeling", "Hodgkins", "Recycle");
    expect(countSpecialtyOpens(store, date, "wheeling", "Recycle")).toBe(0);
    expect(countSpecialtyOpens(store, date, "wheeling", "Recycle \u00b7 Groot")).toBe(1);
  });

  it("Customers-book label (Walking Floor Recycling) still burns on a Recycle log", () => {
    let store = addSpecialtySlot({}, date, "wheeling", "Walking Floor Recycling");
    const lane = resolveSpecialtyBoardMatch("wheeling", "Wheeling", "Groot", "Recycle")!;
    expect(countSpecialtyOpensAny(store, date, "wheeling", lane.chips)).toBe(1);
    store = log(store, "Wheeling", "Groot", "Recycle");
    expect(countSpecialtyOpens(store, date, "wheeling", "Walking Floor Recycling")).toBe(0);
  });

  it("Yard waste log does not burn a Recycle lane", () => {
    let store = addSpecialtySlot({}, date, "wheeling", "Recycle");
    store = log(store, "Wheeling", "Thelens", "Yard Waste");
    expect(countSpecialtyOpens(store, date, "wheeling", "Recycle")).toBe(1);
  });

  it("pickup typed as 'Wheeling - Recycle' resolves to the Wheeling card", () => {
    expect(resolveSpecialtyBoardMatch(undefined, "Wheeling - Recycle", "Groot", "Recycle")?.specialtyId).toBe("wheeling");
  });
});
