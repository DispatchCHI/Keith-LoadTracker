import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SPECIALTY_STATIONS } from "./specialtyBoard";

describe("odd-ball cards past the original four", () => {
  it("custom-5 is not a built-in station, so the chip view must build it", () => {
    expect(SPECIALTY_STATIONS.some((s) => s.id === "custom-5")).toBe(false);
    const card = readFileSync(new URL("../components/SpecialtyBoardCard.tsx", import.meta.url), "utf8");
    const start = card.indexOf("const openStation");
    const block = card.slice(start, card.indexOf("const locationsWithLoads", start));
    expect(block).toContain("?? {");
    expect(block).toContain("customSpecialtyDisplayName(openId)");
  });
});
