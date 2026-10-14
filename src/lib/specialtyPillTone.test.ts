import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { specialtyOwner, specialtyPillTone } from "./specialtyPillTone";

describe("specialty pill owner colors", () => {
  it("Republic yards share the blue tab, WM yards the green tab", () => {
    expect(specialtyOwner("Apollo")).toBe("republic");
    expect(specialtyOwner("Citi Waste")).toBe("republic");
    expect(specialtyOwner("Batavia")).toBe("wm");
    expect(specialtyOwner("Prairie Hill RFD")).toBe("wm");
    expect(specialtyPillTone("Apollo")).toEqual(specialtyPillTone("Melrose"));
    expect(specialtyPillTone("Batavia")).toEqual(specialtyPillTone("Elgin"));
    expect(specialtyPillTone("Apollo").background).not.toBe(specialtyPillTone("Elgin").background);
  });
  it("unconfirmed yards stay neutral", () => {
    expect(specialtyOwner("Wheeling")).toBe("unknown");
    expect(specialtyOwner("Odd-ball 1")).toBe("unknown");
  });
  it("Today card uses the per-pill tone", () => {
    const src = readFileSync("src/components/SpecialtyBoardCard.tsx", "utf8");
    expect(src).toContain("specialtyPillTone(label)");
  });
});
