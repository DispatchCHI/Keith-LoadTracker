import { describe, expect, it } from "vitest";
import {
  isIsoAfter,
  isIsoSameInstant,
  pickNewerByUpdatedAt,
  preferIsoTimestamp,
} from "./isoTime";

describe("isIsoAfter", () => {
  it("treats toISOString and PostgREST forms of the same instant as equal", () => {
    const client = "2026-09-30T18:32:00.123Z";
    const postgrest = "2026-09-30T18:32:00.123000+00:00";
    expect(client > postgrest).toBe(true);
    expect(isIsoAfter(client, postgrest)).toBe(false);
    expect(isIsoAfter(postgrest, client)).toBe(false);
    expect(isIsoSameInstant(client, postgrest)).toBe(true);
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

describe("preferIsoTimestamp / pickNewerByUpdatedAt", () => {
  const client = "2026-09-30T18:32:00.123Z";
  const postgrest = "2026-09-30T18:32:00.123000+00:00";

  it("heals Z to PostgREST form at the same instant", () => {
    expect(preferIsoTimestamp(client, postgrest)).toBe(postgrest);
    expect(preferIsoTimestamp(postgrest, client)).toBe(postgrest);
    expect(
      pickNewerByUpdatedAt(
        { id: "a", updatedAt: client },
        { id: "b", updatedAt: postgrest },
      ),
    ).toEqual({ id: "b", updatedAt: postgrest });
  });

  it("still prefers a genuinely later Z edit", () => {
    const later = "2026-09-30T19:05:00.000Z";
    expect(preferIsoTimestamp(later, postgrest)).toBe(later);
    expect(
      pickNewerByUpdatedAt(
        { id: "a", updatedAt: later },
        { id: "b", updatedAt: postgrest },
      ).id,
    ).toBe("a");
  });
});
