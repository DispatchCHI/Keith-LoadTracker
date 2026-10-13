import { afterEach, describe, expect, it } from "vitest";

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
  },
  configurable: true,
});

import { formatCustomSpecialtyChip, writeCustomSpecialtyName } from "./customSpecialty";
import {
  addSpecialtySlot,
  boardForDate,
  consumeSpecialtyOpensTracked,
  countSpecialtyOpensAny,
  resolveSpecialtyBoardMatch,
} from "./specialtyBoard";

afterEach(() => memory.clear());

function hearthside() {
  writeCustomSpecialtyName("custom-1", "Hearthside");
  return addSpecialtySlot({}, "2026-10-14", "custom-1", formatCustomSpecialtyChip("Trash (MSW)", "Newton"));
}

function dispatch(store: ReturnType<typeof hearthside>, date: string, dest: string, commodity: string) {
  const lane = resolveSpecialtyBoardMatch(undefined, "Hearthside", dest, commodity);
  expect(lane?.specialtyId).toBe("custom-1");
  expect(countSpecialtyOpensAny(store, date, lane!.specialtyId, lane!.chips)).toBe(1);
  return consumeSpecialtyOpensTracked(store, date, lane!.specialtyId, lane!.chips, 1);
}

describe("Odd-ball lanes consume on dispatch", () => {
  it("burns a Trash lane on its own day", () => {
    const out = dispatch(hearthside(), "2026-10-14", "Newton", "Trash (MSW)");
    expect(out.burned).toBe(1);
    expect(boardForDate(out.store, "2026-10-14")).toEqual([]);
  });

  it("burns even when the dest is typed differently or commodity differs", () => {
    expect(dispatch(hearthside(), "2026-10-14", "Newton Landfill", "Trash").burned).toBe(1);
    expect(dispatch(hearthside(), "2026-10-14", "Newton", "C&D").burned).toBe(1);
  });

  it("burns tomorrow's lane when the truck is logged today and today has none", () => {
    const out = dispatch(hearthside(), "2026-10-13", "Newton", "Trash (MSW)");
    expect(out.burned).toBe(1);
    expect(boardForDate(out.store, "2026-10-14")).toEqual([]);
  });
});
