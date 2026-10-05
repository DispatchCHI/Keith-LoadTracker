import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cleanDriverNote,
  compareDriverNotesNewestFirst,
  createDriverNote,
  driverNoteCounts,
  driverNoteFromRow,
  driverNoteToRow,
  editDriverNote,
  filterDriverNotes,
  noteMatchesDriver,
  notesForDriver,
  reconcileDriverNotesCloud,
  type DriverNote,
  type DriverNotesStore,
} from "./driverNotes";

const ROSTER_A = "11111111-1111-4111-8111-111111111111";
const ROSTER_B = "22222222-2222-4222-8222-222222222222";
const ROSTER_A2 = "33333333-3333-4333-8333-333333333333";

function note(id: string, patch: Partial<DriverNote> = {}): DriverNote {
  return {
    id,
    rosterId: ROSTER_A,
    employeeNumber: "1234",
    driverName: "Jane Doe",
    noteDate: "2026-10-05",
    note: "Late to yard",
    author: "Keith",
    createdBy: null,
    createdAt: "2026-10-05T15:00:00.000Z",
    updatedAt: "2026-10-05T15:00:00.000Z",
    ...patch,
  };
}

const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;

describe("driver note identity", () => {
  it("matches by roster id even after a rename", () => {
    expect(
      noteMatchesDriver(note(id(1)), { id: ROSTER_A, truckNumber: null, name: "Jane Smith" }),
    ).toBe(true);
  });

  it("matches by EMP # when the roster row was re-created", () => {
    expect(
      noteMatchesDriver(note(id(1)), { id: ROSTER_A2, truckNumber: "01234", name: "Jane" }),
    ).toBe(true);
  });

  it("does not match a different driver or by name alone", () => {
    expect(
      noteMatchesDriver(note(id(1)), { id: ROSTER_B, truckNumber: "999", name: "Jane Doe" }),
    ).toBe(false);
    expect(
      noteMatchesDriver(note(id(1), { employeeNumber: null }), {
        id: ROSTER_B,
        truckNumber: null,
        name: "Jane Doe",
      }),
    ).toBe(false);
  });

  it("counts notes per card without double counting", () => {
    const store: DriverNotesStore = {
      [id(1)]: note(id(1)),
      [id(2)]: note(id(2), { rosterId: null }),
      [id(3)]: note(id(3), { rosterId: ROSTER_B, employeeNumber: "55" }),
    };
    const counts = driverNoteCounts(store, [
      { id: ROSTER_A, truckNumber: "1234", name: "Jane" },
      { id: ROSTER_B, truckNumber: "55", name: "Bob" },
    ]);
    expect(counts.get(ROSTER_A)).toBe(2);
    expect(counts.get(ROSTER_B)).toBe(1);
  });
});

describe("driver note list + search", () => {
  const store: DriverNotesStore = {
    [id(1)]: note(id(1), { noteDate: "2026-09-01", note: "Talked about safety" }),
    [id(2)]: note(id(2), {
      noteDate: "2026-10-04",
      note: "Asked for Saturday off",
      createdAt: "2026-10-04T18:00:00.000Z",
    }),
    [id(3)]: note(id(3), {
      noteDate: "2026-10-04",
      note: "Truck 88 brake light",
      createdAt: "2026-10-04T20:00:00.000Z",
    }),
    [id(4)]: note(id(4), { rosterId: ROSTER_B, employeeNumber: "55", note: "Other driver" }),
  };
  const driver = { id: ROSTER_A, truckNumber: "1234", name: "Jane" };

  it("lists newest date first, then newest written", () => {
    expect(notesForDriver(store, driver).map((row) => row.id)).toEqual([id(3), id(2), id(1)]);
    expect(compareDriverNotesNewestFirst(store[id(1)], store[id(2)])).toBeGreaterThan(0);
  });

  it("searches text, date formats, and author", () => {
    const notes = notesForDriver(store, driver);
    expect(filterDriverNotes(notes, "saturday").map((row) => row.id)).toEqual([id(2)]);
    expect(filterDriverNotes(notes, "9/1").map((row) => row.id)).toEqual([id(1)]);
    expect(filterDriverNotes(notes, "2026-10-04").length).toBe(2);
    expect(filterDriverNotes(notes, "oct 4 brake").map((row) => row.id)).toEqual([id(3)]);
    expect(filterDriverNotes(notes, "keith").length).toBe(3);
    expect(filterDriverNotes(notes, "  ").length).toBe(3);
    expect(filterDriverNotes(notes, "nothing-here")).toEqual([]);
  });
});

describe("driver note create / edit / clean", () => {
  it("creates a note tied to roster id + EMP #", () => {
    const created = createDriverNote({
      driver: { id: ROSTER_A, truckNumber: "007", name: "Jane" },
      noteDate: "2026-10-05",
      note: "  hello \r\nworld  ",
      author: "Keith",
      at: "2026-10-05T21:00:00.000Z",
    });
    expect(created).toMatchObject({
      rosterId: ROSTER_A,
      employeeNumber: "7",
      driverName: "Jane",
      note: "hello \nworld",
      noteDate: "2026-10-05",
    });
  });

  it("rejects empty text, bad dates, and notes with no driver identity", () => {
    expect(cleanDriverNote(note(id(1), { note: "   " }))).toBeNull();
    expect(cleanDriverNote(note(id(1), { noteDate: "10/5/2026" }))).toBeNull();
    expect(cleanDriverNote(note(id(1), { rosterId: null, employeeNumber: null }))).toBeNull();
  });

  it("edits text/date and bumps updatedAt", () => {
    const store = { [id(1)]: note(id(1)) };
    const result = editDriverNote(store, id(1), { note: "Fixed" }, "2026-10-06T00:00:00.000Z");
    expect(result.note?.note).toBe("Fixed");
    expect(result.note?.updatedAt).toBe("2026-10-06T00:00:00.000Z");
    expect(result.note?.rosterId).toBe(ROSTER_A);
  });

  it("round-trips through a Supabase row", () => {
    const row = driverNoteToRow(note(id(1)), null);
    expect(driverNoteFromRow({ ...row, updated_at: row.updated_at })).toEqual(note(id(1)));
  });
});

describe("reconcileDriverNotesCloud", () => {
  it("takes remote-only rows and uploads unseen local rows", () => {
    const result = reconcileDriverNotesCloud({
      local: { [id(2)]: note(id(2)) },
      remote: { [id(1)]: note(id(1)) },
      deletedIds: [],
      seenRemoteIds: [],
    });
    expect(Object.keys(result.next).sort()).toEqual([id(1), id(2)]);
    expect(result.toUpload.map((row) => row.id)).toEqual([id(2)]);
    expect(result.seenRemoteIds).toEqual([id(1)]);
  });

  it("drops a local row another desk deleted", () => {
    const result = reconcileDriverNotesCloud({
      local: { [id(1)]: note(id(1)) },
      remote: {},
      deletedIds: [],
      seenRemoteIds: [id(1)],
    });
    expect(result.next).toEqual({});
    expect(result.toUpload).toEqual([]);
  });

  it("newer updatedAt wins, with Z vs +00:00 treated as same instant", () => {
    const local = note(id(1), { note: "local", updatedAt: "2026-10-05T16:00:00.000Z" });
    const remote = note(id(1), { note: "remote", updatedAt: "2026-10-05T15:00:00+00:00" });
    const a = reconcileDriverNotesCloud({
      local: { [id(1)]: local },
      remote: { [id(1)]: remote },
      deletedIds: [],
      seenRemoteIds: [id(1)],
    });
    expect(a.next[id(1)].note).toBe("local");
    expect(a.toUpload.length).toBe(1);

    const same = reconcileDriverNotesCloud({
      local: { [id(1)]: note(id(1), { updatedAt: "2026-10-05T15:00:00.000Z" }) },
      remote: { [id(1)]: note(id(1), { updatedAt: "2026-10-05T15:00:00+00:00" }) },
      deletedIds: [],
      seenRemoteIds: [id(1)],
    });
    expect(same.toUpload).toEqual([]);
  });

  it("deletes tombstoned rows remotely and forgets the tombstone once gone", () => {
    const first = reconcileDriverNotesCloud({
      local: {},
      remote: { [id(1)]: note(id(1)) },
      deletedIds: [id(1), id(9)],
      seenRemoteIds: [id(1)],
    });
    expect(first.next).toEqual({});
    expect(first.toDeleteRemote).toEqual([id(1)]);
    expect(first.deletedIds).toEqual([id(1)]);

    const second = reconcileDriverNotesCloud({
      local: {},
      remote: {},
      deletedIds: first.deletedIds,
      seenRemoteIds: first.seenRemoteIds,
    });
    expect(second.deletedIds).toEqual([]);
  });
});

describe("driver notes SQL", () => {
  it("ships the same paste-ready SQL as the migration, with crew RLS", () => {
    const root = readFileSync("Load-Tracker-driver-notes.sql", "utf8");
    const migration = readFileSync("supabase/migrations/20261005170000_driver_notes.sql", "utf8");
    expect(migration).toBe(root);
    for (const verb of ["select", "insert", "update", "delete"]) {
      expect(root).toContain(`"crew_${verb}_driver_notes"`);
    }
    expect(root).toContain("enable row level security");
    expect(root).toContain("supabase_realtime add table public.driver_notes");
  });
});
