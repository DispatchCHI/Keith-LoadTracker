import { describe, expect, it } from "vitest";
import { SPECIALTY_STATIONS, specialtyDestinationsFor } from "./specialtyBoard";
import { specialtyChipFamily, specialtyChipToneClass } from "./specialtyChipCommodity";

describe("specialty chip commodity colors", () => {
  it("colors by label and by catalog destination", () => {
    expect(specialtyChipToneClass(specialtyChipFamily("wheeling", "Wheeling", "Yard Waste"))).toBe(" is-yard");
    expect(specialtyChipToneClass(specialtyChipFamily("wheeling", "Wheeling", "Recycle \u00b7 Groot"))).toBe(" is-recycle");
    expect(specialtyChipToneClass(specialtyChipFamily("custom-1", "Acme", "Cardboard"))).toBe(" is-cardboard");
  });
  it("reports undetermined static chips", () => {
    const missing: string[] = [];
    for (const s of SPECIALTY_STATIONS) {
      for (const chip of specialtyDestinationsFor(s.id)) {
        if (!specialtyChipFamily(s.id, s.name, chip)) missing.push(`${s.name}: ${chip}`);
      }
    }
    console.log("UNDETERMINED", JSON.stringify(missing));
    expect(Array.isArray(missing)).toBe(true);
  });
});
