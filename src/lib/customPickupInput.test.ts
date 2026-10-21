import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isCustomTypedPickup } from "./customPickupInput";
import { unmatchedLaneCustomers } from "./pickupRank";
import { STATIONS } from "../data/stations";

const LANES = [
  "Crown Point", "East Chicago", "Kankakee RDF", "Midway LF", "Planet/WM",
  "Settler's Hill RDF", "Virginia RD", "Wheatland RDF", "WoodLand RDF",
];

describe("custom pickup text box (1.1.43)", () => {
  it("never shows for programmed lane chips that have no station entry", () => {
    const laneNames = unmatchedLaneCustomers([...LANES, "Melrose", "Dekalb Reload"], STATIONS);
    expect([...laneNames].sort()).toEqual([...LANES].sort());
    for (const name of LANES) {
      expect(isCustomTypedPickup({ isCustom: true, pickup: name, oddballNames: [], laneNames })).toBe(false);
    }
  });

  it("never shows for named odd-ball chips; shows for a typed Custom name", () => {
    expect(isCustomTypedPickup({ isCustom: true, pickup: "Van Drunen", oddballNames: ["Van Drunen"], laneNames: [] })).toBe(false);
    expect(isCustomTypedPickup({ isCustom: true, pickup: "Some New Yard", oddballNames: [], laneNames: LANES })).toBe(true);
    expect(isCustomTypedPickup({ isCustom: true, pickup: "", oddballNames: [], laneNames: LANES })).toBe(true);
    expect(isCustomTypedPickup({ isCustom: false, pickup: "Melrose", oddballNames: [], laneNames: [] })).toBe(false);
  });

  it("LoadForm gates the input on Custom..., and lane chips save the lane name unchanged", () => {
    const src = readFileSync("src/components/LoadForm.tsx", "utf8").replace(/\r\n/g, "\n");
    expect(src).toContain("{showCustomPickupInput ? (");
    expect(src).not.toMatch(/\{isCustom \? \(\n\s*<input/);
    expect(src).toMatch(/const selectLaneCustomer = \(name: string\) => \{\n\s*setCustomTyping\(false\);/);
    expect(src).toMatch(/pickup: name,\n\s*commodity: cascaded\.commodity/);
  });
});
