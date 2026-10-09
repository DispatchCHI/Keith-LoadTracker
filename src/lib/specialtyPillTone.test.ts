import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SPECIALTY_STATIONS } from "./specialtyBoard";
import { isCustomSpecialtyId } from "./customSpecialty";
import { setCustomerBrandOverride, clearCustomerBrandOverride } from "./customerBrands";
import { specialtyPillTone } from "./specialtyPillTone";

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
  },
  configurable: true,
});

afterEach(() => {
  memory.clear();
});

describe("specialty transfer pill tones", () => {
  it("gives every named yard its own stable color", () => {
    const names = SPECIALTY_STATIONS.filter((s) => !isCustomSpecialtyId(s.id)).map((s) => s.name);
    const tones = names.map((name) => specialtyPillTone(name));
    const backgrounds = new Set(tones.map((tone) => tone.background));
    expect(backgrounds.size).toBe(names.length);
    for (const tone of tones) {
      expect(tone.background).not.toBe(tone.border);
      expect(tone.color).not.toBe(tone.background);
      expect(tone.border.startsWith("#")).toBe(true);
    }
    expect(specialtyPillTone("Apollo")).toEqual(specialtyPillTone("  apollo "));
    expect(specialtyPillTone("Citi Waste")).toEqual(specialtyPillTone("CitiWaste"));
    expect(specialtyPillTone("Melrose").background).not.toBe(
      specialtyPillTone("Arc").background,
    );
  });

  it("reuses a customer brand color when the name is not a yard tone", () => {
    expect(specialtyPillTone("Chicago Heights")).toEqual(specialtyPillTone("Evanston"));
    expect(specialtyPillTone("Chicago Heights").background).not.toBe(
      specialtyPillTone("Apollo").background,
    );
    const before = specialtyPillTone("Zelda Hauling");
    setCustomerBrandOverride("Zelda Hauling", "lrs");
    const branded = specialtyPillTone("Zelda Hauling");
    expect(branded).not.toEqual(before);
    expect(branded).toEqual(specialtyPillTone("LRS"));
    clearCustomerBrandOverride("Zelda Hauling");
    expect(specialtyPillTone("Zelda Hauling")).toEqual(before);
  });

  it("hashes unknown names, including odd-ball cards, onto a fixed palette", () => {
    const a = specialtyPillTone("Odd-ball 1");
    const b = specialtyPillTone("Odd-ball 2");
    expect(a).toEqual(specialtyPillTone("odd-ball 1"));
    expect(a.background).not.toBe(b.background);
    expect(specialtyPillTone("Prairie Hill RFD").background).not.toBe(
      specialtyPillTone("Dekalb Reload").background,
    );
  });

  it("paints a count pill from the location name and leaves a zero count uncolored", () => {
    const src = readFileSync(new URL("../components/SpecialtyBoardCard.tsx", import.meta.url), "utf8");
    expect(src).toContain("specialtyPillTone(label)");
    expect(src).toContain('count > 0 ? "has-count"');
    expect(src).toContain("--spec-pill-bg");
    const css = readFileSync(new URL("../screens/yard-desk.css", import.meta.url), "utf8");
    expect(css).toContain(".yard-spec-chip.has-count");
    expect(css).toContain("var(--spec-pill-bg)");
  });
});
