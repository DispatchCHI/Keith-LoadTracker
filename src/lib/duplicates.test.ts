import { describe, expect, it } from "vitest";
import { findNearDuplicate } from "./duplicates";
import type { Load } from "../types";

function load(partial: Partial<Load> & Pick<Load, "id" | "createdAt">): Load {
  return {
    truck: "418",
    pickup: "Melrose",
    commodity: "Trash (MSW)",
    destination: "Covanta",
    stationId: "melrose",
    date: "2026-09-05",
    updatedAt: partial.createdAt,
    ...partial,
  };
}

describe("findNearDuplicate", () => {
  it("flags the same truck and route within 4 minutes", () => {
    const existing = [
      load({ id: "a", createdAt: "2026-09-05T14:00:00.000Z" }),
    ];
    expect(
      findNearDuplicate(existing, {
        truck: "418",
        pickup: "Melrose",
        commodity: "Trash (MSW)",
        destination: "Covanta",
        createdAt: "2026-09-05T14:03:00.000Z",
      })?.id,
    ).toBe("a");
  });

  it("ignores a match 6 minutes apart or a different destination", () => {
    const existing = [
      load({ id: "a", createdAt: "2026-09-05T14:00:00.000Z" }),
      load({
        id: "b",
        createdAt: "2026-09-05T14:01:00.000Z",
        destination: "RSI",
      }),
    ];
    expect(
      findNearDuplicate(existing, {
        truck: "418",
        pickup: "Melrose",
        commodity: "Trash (MSW)",
        destination: "Covanta",
        createdAt: "2026-09-05T14:06:00.000Z",
      }),
    ).toBeNull();
  });

  it("does not match the same row when editing", () => {
    const existing = [load({ id: "a", createdAt: "2026-09-05T14:00:00.000Z" })];
    expect(
      findNearDuplicate(existing, {
        id: "a",
        truck: "418",
        pickup: "Melrose",
        commodity: "Trash (MSW)",
        destination: "Covanta",
        createdAt: "2026-09-05T14:00:30.000Z",
      }),
    ).toBeNull();
  });
});
