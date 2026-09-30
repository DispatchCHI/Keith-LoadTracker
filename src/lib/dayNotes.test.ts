import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  DAY_NOTES_STORE_KEY,
  acknowledgeDayNote,
  applySavedDayNote,
  dayNoteFingerprint,
  dayNoteHasText,
  isMissingDayNoteReadHashColumn,
  mergedReadHash,
  notesButtonAffordance,
  notesButtonAriaLabel,
  notesButtonClassName,
  readDayNotesPersisted,
  readHashAfterSave,
  reconcileDayNotesCloud,
  writeDayNotesPersisted,
  type DayNote,
} from "./dayNotes";

const memory = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => memory.clear(),
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

afterEach(() => {
  memory.clear();
});

const DATE = "2026-09-30";

function row(
  note: string,
  updatedAt: string,
  readHash: string | null = null,
  date = DATE,
): DayNote {
  return { date, note, updatedAt, readHash };
}

describe("day note read fingerprint", () => {
  it("is stable, cheap, and changes when the text changes", () => {
    const hello = dayNoteFingerprint("hello");
    expect(hello).toMatch(/^[0-9a-f]{8}$/);
    expect(dayNoteFingerprint("hello")).toBe(hello);
    expect(dayNoteFingerprint("hello!")).not.toBe(hello);
    expect(dayNoteFingerprint("Hello")).not.toBe(hello);
  });

  it("treats whitespace-only notes as empty", () => {
    expect(dayNoteHasText("")).toBe(false);
    expect(dayNoteHasText("  \n")).toBe(false);
    expect(dayNoteHasText(" yard closed ")).toBe(true);
  });
});

describe("notes button affordance", () => {
  const hello = dayNoteFingerprint("yard closed");

  it("is the default blue button when the day has no notes", () => {
    expect(notesButtonAffordance("", null)).toBe("default");
    expect(notesButtonAffordance("   ", hello)).toBe("default");
    expect(notesButtonClassName("default")).toBe("log-load-top notes-top day-notes-btn");
    expect(notesButtonAriaLabel("default")).toBeUndefined();
  });

  it("pulses when notes exist and have not been opened", () => {
    expect(notesButtonAffordance("yard closed", null)).toBe("unread");
    expect(notesButtonAffordance("yard closed", dayNoteFingerprint("other"))).toBe("unread");
    expect(notesButtonClassName("unread")).toContain("day-notes-unread");
    expect(notesButtonAriaLabel("unread")).toBe("Notes, unread");
  });

  it("stays solid red after the same text was opened", () => {
    expect(notesButtonAffordance("yard closed", hello)).toBe("read");
    const className = notesButtonClassName("read");
    expect(className).toContain("day-notes-read");
    expect(className).not.toContain("day-notes-unread");
    expect(notesButtonAriaLabel("read")).toBe("Notes, read");
  });
});

describe("read hash after save and open", () => {
  it("keeps the ack when the saved text is unchanged", () => {
    const fp = dayNoteFingerprint("yard closed");
    expect(readHashAfterSave("yard closed", "yard closed", fp)).toBe(fp);
  });

  it("clears the ack when saved text differs, until opened again", () => {
    const fp = dayNoteFingerprint("yard closed");
    expect(readHashAfterSave("yard closed", "yard closed early", fp)).toBeNull();
    let store = {
      [DATE]: row("yard closed", "2026-09-30T12:00:00.000Z", fp),
    };
    store = applySavedDayNote(store, DATE, "yard closed early", "2026-09-30T13:00:00.000Z");
    expect(store[DATE].readHash).toBeNull();
    expect(store[DATE].updatedAt).toBe("2026-09-30T13:00:00.000Z");
    expect(notesButtonAffordance(store[DATE].note, store[DATE].readHash)).toBe("unread");

    const acked = acknowledgeDayNote(store, DATE);
    expect(acked[DATE].updatedAt).toBe("2026-09-30T13:00:00.000Z");
    expect(acked[DATE].readHash).toBe(dayNoteFingerprint("yard closed early"));
    expect(notesButtonAffordance(acked[DATE].note, acked[DATE].readHash)).toBe("read");
    expect(acknowledgeDayNote(acked, DATE)).toBe(acked);
  });

  it("clears read state when notes are emptied", () => {
    const fp = dayNoteFingerprint("yard closed");
    const store = applySavedDayNote(
      { [DATE]: row("yard closed", "2026-09-30T12:00:00.000Z", fp) },
      DATE,
      "   ",
      "2026-09-30T14:00:00.000Z",
    );
    expect(store[DATE].readHash).toBeNull();
    expect(notesButtonAffordance(store[DATE].note, store[DATE].readHash)).toBe("default");
    expect(acknowledgeDayNote(store, DATE)).toBe(store);
  });

  it("does not bump updatedAt when the popup is opened", () => {
    const store = {
      [DATE]: row("yard closed", "2026-09-30T12:00:00.000Z", null),
    };
    const acked = acknowledgeDayNote(store, DATE);
    expect(acked[DATE].updatedAt).toBe(store[DATE].updatedAt);
    expect(acked[DATE].note).toBe("yard closed");
  });
});

describe("reconcileDayNotesCloud read receipts", () => {
  it("still lets the newer note win, and a stale ack does not mark the new text read", () => {
    const fp = dayNoteFingerprint("old");
    const result = reconcileDayNotesCloud({
      local: { [DATE]: row("old", "2026-09-30T12:00:00.000Z", fp) },
      remote: { [DATE]: row("new", "2026-09-30T13:00:00.000Z", null) },
    });
    expect(result.next[DATE].note).toBe("new");
    expect(result.next[DATE].readHash).toBeNull();
    expect(result.toUpload).toEqual([]);
    expect(result.readHashPushes).toEqual([]);
  });

  it("shares a matching ack without uploading note text over a newer remote copy", () => {
    const fp = dayNoteFingerprint("yard closed");
    const result = reconcileDayNotesCloud({
      local: { [DATE]: row("yard closed", "2026-09-30T12:00:00.000Z", fp) },
      remote: { [DATE]: row("yard closed", "2026-09-30T13:00:00.000Z", null) },
    });
    expect(result.next[DATE].note).toBe("yard closed");
    expect(result.next[DATE].updatedAt).toBe("2026-09-30T13:00:00.000Z");
    expect(result.next[DATE].readHash).toBe(fp);
    expect(result.toUpload).toEqual([]);
    expect(result.readHashPushes).toEqual([{ date: DATE, readHash: fp }]);
  });

  it("uploads a newer local edit with the ack cleared", () => {
    const result = reconcileDayNotesCloud({
      local: { [DATE]: row("edited", "2026-09-30T15:00:00.000Z", null) },
      remote: {
        [DATE]: row("yard closed", "2026-09-30T13:00:00.000Z", dayNoteFingerprint("yard closed")),
      },
    });
    expect(result.toUpload).toHaveLength(1);
    expect(result.toUpload[0].note).toBe("edited");
    expect(result.toUpload[0].readHash).toBeNull();
    expect(result.readHashPushes).toEqual([]);
    expect(mergedReadHash("edited", null, dayNoteFingerprint("yard closed"))).toBeNull();
  });

  it("drops a local day the cloud has already forgotten", () => {
    const result = reconcileDayNotesCloud({
      local: { [DATE]: row("gone", "2026-09-30T12:00:00.000Z", dayNoteFingerprint("gone")) },
      remote: {},
      seenRemoteDates: [DATE],
    });
    expect(result.next).toEqual({});
    expect(result.toUpload).toEqual([]);
    expect(result.readHashPushes).toEqual([]);
  });
});

describe("day notes read hash persistence", () => {
  it("round-trips the fingerprint in the existing local blob", () => {
    const fp = dayNoteFingerprint("yard closed");
    writeDayNotesPersisted({
      version: 1,
      byDate: { [DATE]: row("yard closed", "2026-09-30T12:00:00.000Z", fp) },
      seenRemoteDates: [DATE],
    });
    const saved = readDayNotesPersisted();
    expect(saved.byDate[DATE].readHash).toBe(fp);
    expect(memory.get(DAY_NOTES_STORE_KEY)).toContain(fp);
  });

  it("treats older blobs without a fingerprint as unread", () => {
    memory.set(
      DAY_NOTES_STORE_KEY,
      JSON.stringify({
        version: 1,
        byDate: {
          [DATE]: { date: DATE, note: "yard closed", updatedAt: "2026-09-30T12:00:00.000Z" },
        },
      }),
    );
    const saved = readDayNotesPersisted();
    expect(saved.byDate[DATE].readHash).toBeNull();
    expect(notesButtonAffordance(saved.byDate[DATE].note, saved.byDate[DATE].readHash)).toBe(
      "unread",
    );
  });

  it("detects a database that has not added read_hash yet", () => {
    expect(
      isMissingDayNoteReadHashColumn({
        message: "Could not find the 'read_hash' column of 'day_notes' in the schema cache",
      }),
    ).toBe(true);
    expect(isMissingDayNoteReadHashColumn({ message: "permission denied" })).toBe(false);
  });
});

describe("Today notes chrome", () => {
  it("wires the button affordance and acks when the popup opens", () => {
    const today = readFileSync(new URL("../screens/TodayScreen.tsx", import.meta.url), "utf8");
    const popup = readFileSync(new URL("../screens/DayNotesScreen.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    expect(today).toContain("notesAffordance");
    expect(today).toContain("notesButtonClassName");
    expect(today).toContain("data-notes-state");
    expect(today).toContain("Notes");
    expect(popup).toContain("markNotesRead(date)");
    expect(css).toContain("day-notes-unread-pulse");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("#dc2626");
  });
});
