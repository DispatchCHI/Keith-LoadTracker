import { describe, expect, it } from "vitest";
import {
  formatTruckList,
  isBrokerTruck,
  isNumericTruck,
  KNOWN_BROKER_CODES,
  parseTruckList,
  sanitizeTruck,
  sanitizeTruckListInput,
} from "./truck";

describe("sanitizeTruck", () => {
  it("keeps numeric unit numbers", () => {
    expect(sanitizeTruck("418")).toBe("418");
    expect(sanitizeTruck(" 55 ")).toBe("55");
    expect(sanitizeTruck("207")).toBe("207");
  });

  it("accepts broker letter codes and uppercases them", () => {
    expect(sanitizeTruck("vz")).toBe("VZ");
    expect(sanitizeTruck("cgh")).toBe("CGH");
    expect(sanitizeTruck("G2")).toBe("G2");
    expect(sanitizeTruck("tj")).toBe("TJ");
  });

  it("strips punctuation but keeps letters and digits", () => {
    expect(sanitizeTruck("V-Z")).toBe("VZ");
    expect(sanitizeTruck("g 2")).toBe("G2");
  });

  it("caps length without dropping a numeric truck", () => {
    expect(sanitizeTruck("123456789")).toBe("123456");
    expect(sanitizeTruck("abcdefg")).toBe("ABCDEF");
  });
});

describe("isBrokerTruck / isNumericTruck", () => {
  it("treats pure numbers as trucks, not subs", () => {
    expect(isNumericTruck("418")).toBe(true);
    expect(isBrokerTruck("418")).toBe(false);
    expect(isBrokerTruck("55")).toBe(false);
  });

  it("counts known broker abbreviations as subs", () => {
    for (const code of KNOWN_BROKER_CODES) {
      expect(isBrokerTruck(code)).toBe(true);
      expect(isBrokerTruck(code.toLowerCase())).toBe(true);
    }
  });

  it("counts similar short letter codes that are not on the known list", () => {
    expect(isBrokerTruck("ABC")).toBe(true);
    expect(isBrokerTruck("x9")).toBe(true);
  });

  it("does not count empty or punctuation-only values", () => {
    expect(isBrokerTruck("")).toBe(false);
    expect(isBrokerTruck("   ")).toBe(false);
    expect(isBrokerTruck("--")).toBe(false);
  });
});

describe("sanitizeTruckListInput / parseTruckList", () => {
  it("keeps commas and spaces while typing a list", () => {
    expect(sanitizeTruckListInput("207, 214")).toBe("207, 214");
    expect(sanitizeTruckListInput("vz, cgh")).toBe("VZ, CGH");
    expect(sanitizeTruckListInput("207;214")).toBe("207214");
  });

  it("parses a comma list into separate sanitized trucks", () => {
    expect(parseTruckList("207, 214, 301, 318")).toEqual({
      trucks: ["207", "214", "301", "318"],
      invalid: [],
    });
  });

  it("single truck without commas matches sanitizeTruck", () => {
    expect(parseTruckList("418").trucks).toEqual(["418"]);
    expect(parseTruckList("vz").trucks).toEqual(["VZ"]);
    expect(parseTruckList(" 55 ").trucks).toEqual(["55"]);
  });

  it("trims, skips empty tokens, drops duplicates, preserves order", () => {
    expect(parseTruckList("207,, 214, ,207, 301")).toEqual({
      trucks: ["207", "214", "301"],
      invalid: [],
    });
  });

  it("skips invalid tokens and reports them; all-invalid yields empty trucks", () => {
    expect(parseTruckList("207, ---, 214")).toEqual({
      trucks: ["207", "214"],
      invalid: ["---"],
    });
    expect(parseTruckList("---, ***")).toEqual({
      trucks: [],
      invalid: ["---", "***"],
    });
  });

  it("preserves broker codes per token", () => {
    expect(parseTruckList("207, VZ, cgh").trucks).toEqual(["207", "VZ", "CGH"]);
  });

  it("formatTruckList joins with comma-space", () => {
    expect(formatTruckList(["207", "214", "VZ"])).toBe("207, 214, VZ");
  });
});
