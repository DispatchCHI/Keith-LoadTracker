import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  SPECIALTY_LOADS_OPEN_KEY,
  readSpecialtyLoadsOpen,
  specialtyLocationsWithLoads,
  writeSpecialtyLoadsOpen,
} from "./specialtyLoadsOpen";

const memory = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    get length() {
      return memory.size;
    },
    key: (index: number) => [...memory.keys()][index] ?? null,
  },
  configurable: true,
});

afterEach(() => {
  memory.clear();
});

describe("specialtyLocationsWithLoads", () => {
  it("keeps locations with a count above zero, in board order", () => {
    const rows = [
      { id: "elgin", count: 0 },
      { id: "wheeling", count: 3 },
      { id: "dekalb", count: 1 },
      { id: "ford", count: 0 },
    ];
    expect(specialtyLocationsWithLoads(rows).map((row) => row.id)).toEqual([
      "wheeling",
      "dekalb",
    ]);
  });

  it("is empty when every location is at zero", () => {
    expect(specialtyLocationsWithLoads([{ id: "elgin", count: 0 }])).toEqual([]);
  });
});

describe("specialty loads expanded preference", () => {
  it("remembers the expanded state on this desk", () => {
    expect(readSpecialtyLoadsOpen()).toBe(false);
    writeSpecialtyLoadsOpen(true);
    expect(localStorage.getItem(SPECIALTY_LOADS_OPEN_KEY)).toBe("1");
    expect(readSpecialtyLoadsOpen()).toBe(true);
    writeSpecialtyLoadsOpen(false);
    expect(readSpecialtyLoadsOpen()).toBe(false);
  });

  it("wires the header toggle to the station cards and the saved preference", () => {
    const src = readFileSync(
      new URL("../components/SpecialtyBoardCard.tsx", import.meta.url),
      "utf8",
    );
    expect(src).toContain("specialtyLocationsWithLoads");
    expect(src).toContain("readSpecialtyLoadsOpen");
    expect(src).toContain("writeSpecialtyLoadsOpen");
    expect(src).toContain("Show loads");
    expect(src).toContain("Hide loads");
    expect(src).toContain("No specialty loads.");
    expect(src).toContain("yard-spec-loads");
    expect(src).toContain('count > 0 ? "has-count"');
  });
});
