import { describe, expect, it } from "vitest";
import { seedBoard } from "./saturdayCrew";
import { mergeDispatchStores } from "./saturdayCrewCloud";

describe("mergeDispatchStores", () => {
  it("treats Z and +00:00 as the same instant so echoes do not re-upload", () => {
    const localBoard = {
      ...seedBoard(2026),
      updatedAt: "2026-10-05T18:32:00.123Z",
    };
    const remoteBoard = {
      ...localBoard,
      updatedAt: "2026-10-05T18:32:00.123000+00:00",
    };
    const { next, uploads } = mergeDispatchStores(
      { version: 1, years: { "2026": localBoard } },
      [remoteBoard],
    );
    expect(uploads).toEqual([]);
    expect(next.years["2026"]?.updatedAt).toBe("2026-10-05T18:32:00.123000+00:00");
  });

  it("applies a truly newer remote board and keeps newer local for upload", () => {
    const older = {
      ...seedBoard(2025),
      updatedAt: "2026-10-05T12:00:00.000Z",
    };
    const newerRemote = {
      ...seedBoard(2025),
      updatedAt: "2026-10-05T13:00:00.000000+00:00",
    };
    newerRemote.crew = newerRemote.crew.map((m) =>
      m.id === "keith" ? { ...m, weeks: 2, startDate: "2017-05-12" } : m,
    );
    const pulled = mergeDispatchStores({ version: 1, years: { "2025": older } }, [newerRemote]);
    expect(pulled.uploads).toEqual([]);
    expect(pulled.next.years["2025"]?.updatedAt).toBe("2026-10-05T13:00:00.000000+00:00");

    const localNewer = {
      ...seedBoard(2025),
      updatedAt: "2026-10-05T14:00:00.000Z",
    };
    localNewer.crew = localNewer.crew.map((m) =>
      m.id === "mike" ? { ...m, weeks: 4 } : m,
    );
    const push = mergeDispatchStores(
      { version: 1, years: { "2025": localNewer } },
      [newerRemote],
    );
    expect(push.uploads).toHaveLength(1);
    expect(push.uploads[0]?.crew.find((m) => m.id === "mike")?.weeks).toBe(4);
  });

  it("prefers a remote Saturday edit over a freshly seeded local board", () => {
    const localSeed = seedBoard(2026); // epoch stamp, Oct 10 = mike
    expect(localSeed.saturdays.find((row) => row.date === "2026-10-10")?.duty).toBe("mike");
    const remote = {
      ...localSeed,
      saturdays: localSeed.saturdays.map((row) =>
        row.date === "2026-10-10" ? { ...row, duty: "keith" as const } : row,
      ),
      updatedAt: "2026-10-05T19:00:00.000000+00:00",
    };
    const { next, uploads } = mergeDispatchStores(
      { version: 1, years: { "2026": localSeed } },
      [remote],
    );
    expect(next.years["2026"]?.saturdays.find((row) => row.date === "2026-10-10")?.duty).toBe(
      "keith",
    );
    expect(uploads).toEqual([]);
  });
});
