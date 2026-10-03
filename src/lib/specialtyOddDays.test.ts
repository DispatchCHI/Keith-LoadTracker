import { afterEach, describe, expect, it } from "vitest";
import {
  customSpecialtyDisplayName,
  isCustomSpecialtyId,
  readCustomSpecialtyNameField,
} from "./customSpecialty";
import { SPECIALTY_STATIONS } from "./specialtyBoard";
import {
  addOddCard,
  oddIdsOn,
  removeOddCard,
  specialtyGridSlots,
  visibleOddCardIds,
} from "./specialtyOddDays";

const memory = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => memory.clear(),
};
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

afterEach(() => {
  memory.clear();
});

describe("day-only odd-ball cards", () => {
  const saturday = "2026-10-03";
  const sunday = "2026-10-04";

  it("hides odd-ball cards until one is added for that day", () => {
    expect(oddIdsOn(saturday)).toEqual([]);
    expect(visibleOddCardIds(saturday, [])).toEqual([]);
  });

  it("adds a card for the selected day and leaves other days empty", () => {
    const first = addOddCard(saturday);
    const second = addOddCard(saturday);
    expect(first).toBe("custom-5");
    expect(second).toBe("custom-6");
    expect(oddIdsOn(saturday)).toEqual(["custom-5", "custom-6"]);
    expect(oddIdsOn(sunday)).toEqual([]);
    expect(readCustomSpecialtyNameField(first)).toBe("");
    expect(customSpecialtyDisplayName(first)).toBe("Odd-ball");
  });

  it("removes a card from that day without dropping the other day", () => {
    const saturdayCard = addOddCard(saturday);
    const sundayCard = addOddCard(sunday);
    removeOddCard(saturday, saturdayCard);
    expect(oddIdsOn(saturday)).toEqual([]);
    expect(oddIdsOn(sunday)).toEqual([sundayCard]);
  });

  it("still shows a card that already has opens on that day", () => {
    expect(visibleOddCardIds(saturday, ["custom-9", "elgin"])).toEqual(["custom-9"]);
  });

  it("puts the add button immediately right of Liberty, then that day's cards", () => {
    const named = SPECIALTY_STATIONS.filter((station) => !isCustomSpecialtyId(station.id));
    const slots = specialtyGridSlots(named, [
      { id: "custom-5", name: "Odd-ball" },
      { id: "custom-6", name: "Zion" },
    ]);
    const addAt = slots.findIndex((slot) => slot.kind === "add");
    const libertyAt = slots.findIndex(
      (slot) => slot.kind === "station" && slot.id === "liberty-tank",
    );
    expect(addAt).toBe(libertyAt + 1);
    expect(slots[addAt + 1]).toMatchObject({ id: "custom-5" });
    expect(slots[addAt + 2]).toMatchObject({ id: "custom-6" });
    expect(slots.some((slot) => slot.kind === "station" && slot.id === "custom-1")).toBe(false);
  });
});
