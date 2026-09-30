import { describe, expect, it } from "vitest";
import { isIsoAfter } from "./isoTime";

describe("isIsoAfter", () => {
  it("treats toISOString and PostgREST forms of the same instant as equal", () => {
    const client = "2026-09-30T18:32:00.123Z";
    const postgrest = "2026-09-30T18:32:00.123000+00:00";
    expect(client > postgrest).toBe(true);
    expect(isIsoAfter(client, postgrest)).toBe(false);
    expect(isIsoAfter(postgrest, client)).toBe(false);
    expect(isIsoAfter(client, "2026-09-30T18:32:00.123+00:00")).toBe(false);
    expect(isIsoAfter(client, "2026-09-30T18:32:00.123456+00:00")).toBe(false);
    expect(isIsoAfter("2026-09-30T18:32:00.000Z", "2026-09-30T18:32:00+00:00")).toBe(false);
  });

  it("still sees a genuinely later edit", () => {
    expect(
      isIsoAfter("2026-09-30T19:00:00.000Z", "2026-09-30T18:32:00.123000+00:00"),
    ).toBe(true);
    expect(
      isIsoAfter("2026-09-30T18:32:00.123000+00:00", "2026-09-30T19:00:00.000Z"),
    ).toBe(false);
  });
});
