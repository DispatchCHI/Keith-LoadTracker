import { describe, expect, it } from "vitest";
import { batchCreatedAt, clampLoadQty, MAX_LOAD_QTY } from "./quantity";

describe("clampLoadQty", () => {
  it("defaults invalid values to 1 and caps at the max", () => {
    expect(clampLoadQty(1)).toBe(1);
    expect(clampLoadQty(6)).toBe(6);
    expect(clampLoadQty(0)).toBe(1);
    expect(clampLoadQty(-3)).toBe(1);
    expect(clampLoadQty(99)).toBe(MAX_LOAD_QTY);
    expect(clampLoadQty(Number.NaN)).toBe(1);
  });
});

describe("batchCreatedAt", () => {
  it("stamps each copy one second after the last", () => {
    const base = "2026-09-05T15:00:00.000Z";
    expect(batchCreatedAt(base, 0)).toBe(base);
    expect(batchCreatedAt(base, 1)).toBe("2026-09-05T15:00:01.000Z");
    expect(batchCreatedAt(base, 5)).toBe("2026-09-05T15:00:05.000Z");
  });
});
