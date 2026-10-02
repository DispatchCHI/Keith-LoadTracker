import { describe, expect, it } from "vitest";
import { telHref } from "./telHref";

describe("telHref", () => {
  it("returns null for empty or non-digit junk", () => {
    expect(telHref(null)).toBeNull();
    expect(telHref(undefined)).toBeNull();
    expect(telHref("")).toBeNull();
    expect(telHref("   ")).toBeNull();
    expect(telHref("n/a")).toBeNull();
  });

  it("formats 10-digit US numbers with +1", () => {
    expect(telHref("(312) 555-0147")).toBe("tel:+13125550147");
    expect(telHref("312-555-0147")).toBe("tel:+13125550147");
    expect(telHref("3125550147")).toBe("tel:+13125550147");
  });

  it("formats 11-digit numbers starting with 1", () => {
    expect(telHref("1 (312) 555-0147")).toBe("tel:+13125550147");
    expect(telHref("13125550147")).toBe("tel:+13125550147");
  });

  it("preserves numbers that already start with +", () => {
    expect(telHref("+44 20 7946 0958")).toBe("tel:+44 20 7946 0958");
    expect(telHref("+13125550147")).toBe("tel:+13125550147");
  });

  it("falls back to tel:digits for other digit lengths", () => {
    expect(telHref("555-0147")).toBe("tel:5550147");
    expect(telHref("011 44 20 7946 0958")).toBe("tel:011442079460958");
  });
});