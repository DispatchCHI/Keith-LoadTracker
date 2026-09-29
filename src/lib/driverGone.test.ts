import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addGoneEntry,
  applyFullRosterDelete,
  collapseDuplicateGoneEntries,
  DRIVER_GONE_STORE_KEY,
  emptyDriverGoneStore,
  entriesForGone,
  entriesForGoneYear,
  goneArchiveYears,
  goneEntryCount,
  gonePersonKey,
  goneYearLabel,
  goneYearOf,
  mergeImportedGoneRows,
  parseGoneDate,
  goneMatchesActiveRoster,
  goneShouldStripRosterEntry,
  reconcileDriverGoneCloud,
  removeGoneEntriesForPerson,
  scrubPrivacyFromNotes,
  stripRosterEntriesMatchingGone,
} from "./driverGone";
import { parseGoneSheetCsv } from "./driverGoneSheet";
import {
  addRosterEntry,
  DRIVER_ROSTER_YARDS,
  emptyDriverRosterStore,
  entriesForRoster,
  fullRosterTally,
  matchingSatEntriesForPerson,
  removeHiredAndMatchingSat,
  rosterEntryCount,
  updateRosterEntry,
  type DriverRosterYard,
} from "./driverRoster";

const GONE_FIXTURE = `"Emp #","Name","Phone","Email","Hire date","Termination date","Notes"
"39963","Habeeb Bello","555-010-0001","fake1@example.com","8/4/25","1/2/2026","Laid Off. ok driver."
"86","Garry Prince","555-010-0002","fake2@example.com","5/5/1995","2/27/26","Retired, 30+ years with MBI. Congrats!"
"36664","Jeremiah Richardson ","555-010-0003","fake3@example.com","7/29/2022","1/9/2026","Quit. Call 555-010-9999 or write leak@example.com after."
"","", "555-010-0004","skip@example.com","","",""`;

function hired(
  store = emptyDriverRosterStore(),
  yard: "burnham" | "rockford" = "burnham",
  truck = "56",
  name = "Dave Vanderbilt",
) {
  return addRosterEntry(store, {
    kind: "full",
    yard,
    truckNumber: truck,
    name,
  });
}

describe("parseGoneDate", () => {
  it("reads US sheet dates including pre-2000 hire years", () => {
    expect(parseGoneDate("8/4/25")).toBe("2025-08-04");
    expect(parseGoneDate("1/2/2026")).toBe("2026-01-02");
    expect(parseGoneDate("5/5/1995")).toBe("1995-05-05");
    expect(parseGoneDate("4/30/01")).toBe("2001-04-30");
    expect(parseGoneDate("2026-09-12")).toBe("2026-09-12");
    expect(parseGoneDate("")).toBeNull();
  });
});

describe("Gone seed parse", () => {
  it("imports only emp #, name, hire, termination, notes — never contact fields", () => {
    const rows = parseGoneSheetCsv(GONE_FIXTURE);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => Object.keys(row).sort())).toEqual([
      ["employeeNumber", "hireDate", "name", "notes", "terminationDate", "yard"],
      ["employeeNumber", "hireDate", "name", "notes", "terminationDate", "yard"],
      ["employeeNumber", "hireDate", "name", "notes", "terminationDate", "yard"],
    ]);
    expect(rows[0]).toEqual({
      employeeNumber: "39963",
      name: "Habeeb Bello",
      hireDate: "2025-08-04",
      terminationDate: "2026-01-02",
      notes: "Laid Off. ok driver.",
      yard: null,
    });
    expect(rows[1]).toEqual({
      employeeNumber: "86",
      name: "Garry Prince",
      hireDate: "1995-05-05",
      terminationDate: "2026-02-27",
      notes: "Retired, 30+ years with MBI. Congrats!",
      yard: null,
    });
    const blob = JSON.stringify(rows);
    expect(blob).not.toContain("555-010-0001");
    expect(blob).not.toContain("555-010-0002");
    expect(blob).not.toContain("555-010-0003");
    expect(blob).not.toContain("fake1@example.com");
    expect(blob).not.toContain("fake2@example.com");
    expect(blob).not.toContain("fake3@example.com");
    expect(blob).not.toMatch(/"phone"/i);
    expect(blob).not.toMatch(/"email"/i);
  });

  it("scrubs contact-looking tokens that leaked into notes", () => {
    const rows = parseGoneSheetCsv(GONE_FIXTURE);
    const jeremiah = rows.find((row) => row.name === "Jeremiah Richardson");
    expect(jeremiah?.notes).toBe("Quit. Call or write after.");
    expect(jeremiah?.notes).not.toContain("@");
    expect(jeremiah?.notes).not.toMatch(/\d{3}/);
    expect(scrubPrivacyFromNotes("Term. 555-010-1111 ok")).toBe("Term. ok");
  });

  it("parser source never reads contact columns", () => {
    const src = readFileSync(new URL("./driverGoneSheet.ts", import.meta.url), "utf8");
    expect(src).toContain("COL_EMP = 0");
    expect(src).toContain("COL_NAME = 1");
    expect(src).toContain("COL_HIRE = 4");
    expect(src).toContain("COL_TERM = 5");
    expect(src).toContain("COL_NOTES = 6");
    expect(src).not.toMatch(/row\s*\[\s*2\s*\]/);
    expect(src).not.toMatch(/row\s*\[\s*3\s*\]/);
  });

  it("SQL and store have no contact fields", () => {
    const sql = readFileSync(new URL("../../Load-Tracker-driver-gone.sql", import.meta.url), "utf8");
    expect(sql).toContain("driver_gone_entries");
    expect(sql).toContain("employee_number");
    expect(sql).toContain("hire_date");
    expect(sql).toContain("termination_date");
    expect(sql).toContain("driver_gone_deletes_allowed");
    expect(sql).not.toMatch(/phone_number|\bemail\b/i);
    expect(sql).toMatch(/create table[\s\S]*driver_gone_entries \([\s\S]*employee_number[\s\S]*hire_date[\s\S]*termination_date[\s\S]*notes/);
    expect(sql).not.toMatch(
      /crew_delete_driver_gone_entries[\s\S]*for delete[\s\S]*using \(true\)/,
    );
    const storeSrc = readFileSync(new URL("./driverGone.ts", import.meta.url), "utf8");
    expect(storeSrc).toMatch(
      /export type DriverGoneEntry = \{[\s\S]*employeeNumber[\s\S]*hireDate[\s\S]*terminationDate[\s\S]*notes/,
    );
    expect(storeSrc).not.toContain("phoneNumber");
    expect(storeSrc).not.toContain("emailAddress");
  });
});

describe("Full Roster × dialog paths", () => {
  it("Edit removes Full + matching Sat and does not write Gone", () => {
    let roster = hired().store;
    roster = addRosterEntry(roster, {
      kind: "sat",
      yard: "burnham",
      truckNumber: "56",
      name: "Dave Vanderbilt",
    }).store;
    roster = addRosterEntry(roster, {
      kind: "sat",
      yard: "burnham",
      truckNumber: "102",
      name: "Dan Kasprzycki -T",
    }).store;
    const fullId = entriesForRoster(roster, "full", "burnham")[0].id;
    const goneBefore = addGoneEntry(emptyDriverGoneStore(), {
      name: "Already Gone",
      employeeNumber: "1",
      notes: "prior",
    }).store;

    const result = applyFullRosterDelete(roster, goneBefore, fullId, { intent: "edit" });
    expect(result.goneEntry).toBeNull();
    expect(rosterEntryCount(result.roster, "full", "burnham")).toBe(0);
    expect(entriesForRoster(result.roster, "sat", "burnham").map((row) => row.name)).toEqual([
      "Dan Kasprzycki -T",
    ]);
    expect(goneEntryCount(result.gone)).toBe(1);
    expect(result.gone.entries).toEqual(goneBefore.entries);
    expect(fullRosterTally(Object.values(result.roster.entries)).hired).toBe(0);
  });

  it("Termination archives on Gone, drops Full + Sat, and leaves hired count", () => {
    let roster = hired().store;
    roster = addRosterEntry(roster, {
      kind: "sat",
      yard: "rockford",
      truckNumber: "56",
      name: "Dave Vanderbilt",
    }).store;
    const extra = hired(roster, "burnham", "102", "Dan Kasprzycki -T");
    roster = extra.store;
    const fullId = entriesForRoster(roster, "full", "burnham").find(
      (row) => row.name === "Dave Vanderbilt",
    )!.id;

    const result = applyFullRosterDelete(roster, emptyDriverGoneStore(), fullId, {
      intent: "termination",
      hireDate: "2020-01-15",
      terminationDate: "2026-09-12",
      notes: "Quit, gave notice.",
    });

    expect(result.goneEntry).toMatchObject({
      employeeNumber: "56",
      name: "Dave Vanderbilt",
      hireDate: "2020-01-15",
      terminationDate: "2026-09-12",
      notes: "Quit, gave notice.",
      yard: "burnham",
    });
    expect(rosterEntryCount(result.roster, "full", "burnham")).toBe(1);
    expect(entriesForRoster(result.roster, "full", "burnham")[0].name).toBe("Dan Kasprzycki -T");
    expect(matchingSatEntriesForPerson(result.roster, { truckNumber: "56", name: "Dave Vanderbilt" })).toEqual(
      [],
    );
    expect(fullRosterTally(Object.values(result.roster.entries)).hired).toBe(1);
    expect(entriesForGone(result.gone)).toHaveLength(1);
  });

  it("termination notes are scrubbed and hire date may stay blank", () => {
    const roster = hired().store;
    const fullId = entriesForRoster(roster, "full", "burnham")[0].id;
    const result = applyFullRosterDelete(roster, emptyDriverGoneStore(), fullId, {
      intent: "termination",
      hireDate: "",
      terminationDate: "2026-09-12",
      notes: "Term. Call 555-010-2222 or boss@example.com",
    });
    expect(result.goneEntry?.hireDate).toBeNull();
    expect(result.goneEntry?.notes).toBe("Term. Call or");
    expect(result.goneEntry?.notes).not.toContain("@");
  });

  it("DriverScreen asks Termination vs Edit (remove only) before dropping a hire", () => {
    const src = readFileSync(new URL("../screens/DriverScreen.tsx", import.meta.url), "utf8");
    expect(src).toContain("Termination");
    expect(src).toContain("Edit (remove only)");
    expect(src).toContain("Cancel");
    expect(src).toContain("removeHiredAndSat");
    expect(src).toContain("addGone");
    expect(src).toContain("terminationDate");
    expect(src).not.toMatch(/<th[^>]*>\s*Phone\s*</);
    expect(src).not.toMatch(/<th[^>]*>\s*Email\s*</);
    expect(src).toContain("Gone");
    expect(src).toContain("Hire date");
    expect(src).toContain("Termination date");
    expect(src).not.toContain("Everyone listed is hired at this yard");
    expect(src).not.toContain("it does not keep reading the workbook");
    expect(src).not.toContain("Starts as this yard");
    expect(src).not.toContain("aria-label=\"Roster help\"");
    expect(src).toContain("goneYearLabel");
    expect(src).not.toContain("Import empty lists");
    expect(src).not.toContain("Import Gone 2026");
    expect(src).not.toContain("importFromSheet");
    expect(src).toContain("FullRosterDriverCard");
    expect(src).toContain("drv-pay-list");
    expect(src).toContain("Truck #");
    const card = readFileSync(
      new URL("../components/FullRosterDriverCard.tsx", import.meta.url),
      "utf8",
    );
    expect(card).toContain("drv-yos-tag");
    expect(card).toContain("drv-allot-tag");
    expect(card).toContain("drv-pay-week");
  });
});

describe("Gone YYYY year buckets", () => {
  it("always includes the current year and groups by termination year", () => {
    let store = emptyDriverGoneStore();
    store = addGoneEntry(store, {
      name: "Left In 2026",
      terminationDate: "2026-03-01",
    }).store;
    store = addGoneEntry(store, {
      name: "Left In 2025",
      terminationDate: "2025-12-20",
    }).store;
    store = addGoneEntry(store, {
      name: "No Date Yet",
    }).store;
    expect(goneYearLabel(2026)).toBe("Gone 2026");
    expect(goneArchiveYears(store, 2026)).toEqual([2026, 2025]);
    expect(goneArchiveYears(store, 2027)).toEqual([2027, 2026, 2025]);
    expect(goneYearOf({ terminationDate: "2026-09-12" }, 2027)).toBe(2026);
    expect(goneYearOf({ terminationDate: null }, 2027)).toBe(2027);
    expect(entriesForGoneYear(store, 2026, 2026).map((row) => row.name)).toEqual([
      "Left In 2026",
      "No Date Yet",
    ]);
    expect(entriesForGoneYear(store, 2025, 2026).map((row) => row.name)).toEqual([
      "Left In 2025",
    ]);
    expect(entriesForGoneYear(store, 2027, 2026)).toEqual([]);
  });
});

describe("removeHiredAndMatchingSat", () => {
  it("keeps other Sat names", () => {
    let store = hired().store;
    store = addRosterEntry(store, {
      kind: "sat",
      yard: "burnham",
      truckNumber: "56",
      name: "Dave Vanderbilt",
    }).store;
    store = addRosterEntry(store, {
      kind: "sat",
      yard: "burnham",
      truckNumber: "102",
      name: "Other Driver",
    }).store;
    const id = entriesForRoster(store, "full", "burnham")[0].id;
    const result = removeHiredAndMatchingSat(store, id);
    expect(result.removed.map((row) => row.kind).sort()).toEqual(["full", "sat"]);
    expect(entriesForRoster(result.store, "sat", "burnham").map((row) => row.name)).toEqual([
      "Other Driver",
    ]);
  });
});

describe("Gone cloud delete posture", () => {
  it("uses a dedicated persist key", () => {
    expect(DRIVER_GONE_STORE_KEY).toBe("chitrader.load-tracker.driver-gone.v1");
  });

  it("does not wipe or remotely delete on an empty pull", () => {
    const local = addGoneEntry(emptyDriverGoneStore(), {
      employeeNumber: "86",
      name: "Garry Prince",
      notes: "Retired",
    });
    const result = reconcileDriverGoneCloud({
      local: local.store,
      remote: emptyDriverGoneStore(),
      deletedEntryIds: [],
      seenRemoteEntryIds: [],
    });
    expect(Object.keys(result.next.entries)).toHaveLength(1);
    expect(result.toUploadEntries).toHaveLength(1);
    expect(result.toDeleteRemoteEntries).toEqual([]);
  });

  it("keeps local rows missing from a subset pull and does not remote-delete them", () => {
    const a = addGoneEntry(emptyDriverGoneStore(), {
      employeeNumber: "86",
      name: "Garry Prince",
    });
    const b = addGoneEntry(a.store, {
      employeeNumber: "514",
      name: "David Garkey",
    });
    const keepId = a.entry!.id;
    const missingId = b.entry!.id;
    const result = reconcileDriverGoneCloud({
      local: b.store,
      remote: { entries: { [keepId]: a.store.entries[keepId] } },
      deletedEntryIds: [],
      seenRemoteEntryIds: [keepId, missingId],
    });
    expect(result.next.entries[keepId]).toBeDefined();
    expect(result.next.entries[missingId]).toBeDefined();
    expect(result.toDeleteRemoteEntries).toEqual([]);
    expect(result.toUploadEntries).toEqual([]);
  });

  it("keeps an explicit × tombstone and retries the remote delete", () => {
    const added = addGoneEntry(emptyDriverGoneStore(), {
      employeeNumber: "39963",
      name: "Habeeb Bello",
      notes: "Laid Off",
    });
    const id = added.entry!.id;
    const result = reconcileDriverGoneCloud({
      local: emptyDriverGoneStore(),
      remote: added.store,
      deletedEntryIds: [id],
      seenRemoteEntryIds: [id],
    });
    expect(result.next.entries[id]).toBeUndefined();
    expect(result.deletedEntryIds).toContain(id);
    expect(result.toDeleteRemoteEntries).toEqual([id]);
  });

  it("does not drop Gone names when a later sheet import runs", () => {
    const first = mergeImportedGoneRows(emptyDriverGoneStore(), [
      {
        employeeNumber: "86",
        name: "Garry Prince",
        hireDate: "1995-05-05",
        terminationDate: "2026-02-27",
        notes: "Retired",
        yard: null,
      },
    ]);
    expect(first.added).toBe(1);
    const thinner = mergeImportedGoneRows(first.store, []);
    expect(thinner.added).toBe(0);
    expect(thinner.skipped).toBe(true);
    expect(goneEntryCount(thinner.store)).toBe(1);
  });

  it("never issues an unscoped driver_gone_entries delete", () => {
    const src = readFileSync(new URL("../store/DriverGoneContext.tsx", import.meta.url), "utf8");
    expect(src).toContain('.from("driver_gone_entries").delete().in("id", ids)');
    expect(src).toContain("the only path that may DELETE a cloud Gone row");
    expect(src).not.toContain(".delete().neq(");
  });
});

describe("Gone duplicate people", () => {
  it("collapses the same emp # to one row and keeps the newer notes", () => {
    const first = addGoneEntry(emptyDriverGoneStore(), {
      employeeNumber: "40690",
      name: "John Vinson",
      terminationDate: "2026-09-08",
      notes: "Quit.",
    });
    const second = addGoneEntry(
      { entries: { ...first.store.entries, extra: {
        ...first.entry!,
        id: "extra",
        notes: "Quit. no notice given. got a job with a postal contractor. good driver.",
        updatedAt: "2099-01-01T00:00:00.000Z",
      } } },
      {
        employeeNumber: "514",
        name: "David Garkey",
      },
    );
    expect(gonePersonKey(first.entry!)).toBe("emp:40690");
    const collapsed = collapseDuplicateGoneEntries(second.store);
    expect(collapsed.droppedIds).toEqual([first.entry!.id]);
    expect(collapsed.store.entries.extra?.notes).toContain("postal contractor");
    expect(goneEntryCount(collapsed.store)).toBe(2);
  });

  it("× on one Gone row removes every copy of that person", () => {
    const a = addGoneEntry(emptyDriverGoneStore(), {
      employeeNumber: "40675",
      name: "Antonio Guzman",
      notes: "Quit.",
    });
    const twin: typeof a.entry = {
      ...a.entry!,
      id: "twin",
      notes: "Quit. no notice given, took another job. do not rehire.",
    };
    const store = { entries: { [a.entry!.id]: a.entry!, twin: twin! } };
    const result = removeGoneEntriesForPerson(store, "twin");
    expect(result.removed).toHaveLength(2);
    expect(goneEntryCount(result.store)).toBe(0);
  });

  it("adding the same emp # updates the existing Gone row instead of doubling", () => {
    const first = addGoneEntry(emptyDriverGoneStore(), {
      employeeNumber: "1183",
      name: "Terry Muzzarelli",
      notes: "Term",
    });
    const second = addGoneEntry(first.store, {
      employeeNumber: "1183",
      name: "Terry Muzzarelli",
      notes: "Term, tested positive for cocaine. 23 years with MBI.:(",
    });
    expect(goneEntryCount(second.store)).toBe(1);
    expect(second.entry?.id).toBe(first.entry?.id);
    expect(second.entry?.notes).toContain("cocaine");
  });

  it("cloud reconcile drops duplicate emp # rows and retries those deletes", () => {
    const a = addGoneEntry(emptyDriverGoneStore(), {
      employeeNumber: "31147",
      name: "Buddy Johnson",
      notes: "Term, failed to report accident. intoxicated on the job.",
    });
    const bId = "buddy-copy";
    const remote = {
      entries: {
        [a.entry!.id]: a.entry!,
        [bId]: { ...a.entry!, id: bId, notes: "Term, failed to report accident, under the influence of alcohol. No rehire", updatedAt: "2099-01-01T00:00:00.000Z" },
      },
    };
    const result = reconcileDriverGoneCloud({
      local: a.store,
      remote,
      deletedEntryIds: [],
      seenRemoteEntryIds: [a.entry!.id, bId],
    });
    expect(goneEntryCount(result.next)).toBe(1);
    expect(result.next.entries[bId]?.notes).toContain("No rehire");
    expect(result.toDeleteRemoteEntries).toContain(a.entry!.id);
  });
});

describe("Gone people stay off Full Roster (Buddy Johnson bounce-back)", () => {
  it("matches Buddy Johnson by emp # 31147 even under a new roster UUID", () => {
    expect(
      goneMatchesActiveRoster(
        { employeeNumber: "31147", name: "Buddy Johnson", yard: "rockford" },
        { truckNumber: "31147", name: "Buddy Johnson", yard: "rockford" },
      ),
    ).toBe(true);
    expect(
      goneMatchesActiveRoster(
        { employeeNumber: "31147", name: "Buddy Johnson", yard: "rockford" },
        { truckNumber: "99999", name: "Buddy Johnson", yard: "rockford" },
      ),
    ).toBe(false);
  });

  it("strips Rockford Full + Sat when Gone has Buddy, including a re-upserted id", () => {
    // Stale cloud Full/Sat rows are older than the Gone archive stamp.
    const staleAt = "2026-07-01T12:00:00.000Z";
    const goneAt = "2026-08-01T18:00:00.000Z";
    let roster = emptyDriverRosterStore();
    const full = addRosterEntry(
      roster,
      {
        kind: "full",
        yard: "rockford",
        truckNumber: "31147",
        name: "Buddy Johnson",
      },
      { at: staleAt },
    );
    roster = full.store;
    const sat = addRosterEntry(
      roster,
      {
        kind: "sat",
        yard: "rockford",
        truckNumber: "31147",
        name: "Buddy Johnson",
      },
      { at: staleAt },
    );
    roster = sat.store;
    // Simulate bounce-back under a brand-new Full id after terminate.
    const rebound = addRosterEntry(
      roster,
      {
        kind: "full",
        yard: "rockford",
        truckNumber: "31147",
        name: "Buddy Johnson",
      },
      { at: staleAt },
    );
    // collapse would normally dedupe; force both ids present like a bad merge.
    roster = {
      entries: {
        ...sat.store.entries,
        "buddy-rebound-uuid": {
          ...rebound.entry!,
          id: "buddy-rebound-uuid",
        },
      },
    };

    const gone = addGoneEntry(
      emptyDriverGoneStore(),
      {
        employeeNumber: "31147",
        name: "Buddy Johnson",
        terminationDate: "2026-08-01",
        notes: "Term, failed to report accident. intoxicated on the job.",
        yard: "rockford",
      },
      { at: goneAt },
    ).store;

    const stripped = stripRosterEntriesMatchingGone(roster, gone);
    expect(stripped.removed.length).toBeGreaterThanOrEqual(2);
    expect(
      Object.values(stripped.store.entries).some(
        (row) => row.truckNumber === "31147" || /buddy johnson/i.test(row.name),
      ),
    ).toBe(false);
    expect(stripped.removed.some((row) => row.id === "buddy-rebound-uuid")).toBe(true);
  });

  it("does not strip unrelated Rockford hires when pruning Buddy", () => {
    const staleAt = "2026-07-01T12:00:00.000Z";
    const goneAt = "2026-08-01T18:00:00.000Z";
    let roster = addRosterEntry(
      emptyDriverRosterStore(),
      {
        kind: "full",
        yard: "rockford",
        truckNumber: "185",
        name: "Christopher Oleson",
      },
      { at: staleAt },
    ).store;
    roster = addRosterEntry(
      roster,
      {
        kind: "full",
        yard: "rockford",
        truckNumber: "31147",
        name: "Buddy Johnson",
      },
      { at: staleAt },
    ).store;
    const gone = addGoneEntry(
      emptyDriverGoneStore(),
      {
        employeeNumber: "31147",
        name: "Buddy Johnson",
        terminationDate: "2026-08-01",
      },
      { at: goneAt },
    ).store;
    const stripped = stripRosterEntriesMatchingGone(roster, gone);
    expect(rosterEntryCount(stripped.store, "full", "rockford")).toBe(1);
    expect(entriesForRoster(stripped.store, "full", "rockford")[0].name).toBe(
      "Christopher Oleson",
    );
  });
});

describe("Gone prune must not eat active/new drivers (name-match regression)", () => {
  it("does not strip active David Perez when Gone has same name with emp # and hire has no emp #", () => {
    // Regression: 47a2547 fell back to name when either side lacked emp #.
    expect(
      goneMatchesActiveRoster(
        { employeeNumber: "40001", name: "David Perez", yard: "rockford" },
        { truckNumber: null, name: "David Perez", yard: "rockford" },
      ),
    ).toBe(false);
    expect(
      goneMatchesActiveRoster(
        { employeeNumber: "40001", name: "David Perez", yard: "rockford" },
        { truckNumber: "51234", name: "David Perez", yard: "rockford" },
      ),
    ).toBe(false);
  });

  it("keeps a brand-new Full Roster add (name only) when an unrelated Gone shares the name", () => {
    let roster = emptyDriverRosterStore();
    for (const yard of DRIVER_ROSTER_YARDS) {
      roster = addRosterEntry(roster, {
        kind: "full",
        yard,
        truckNumber: null,
        name: "Alex Rivera",
      }).store;
    }
    const gone = addGoneEntry(emptyDriverGoneStore(), {
      employeeNumber: "28888",
      name: "Alex Rivera",
      terminationDate: "2026-01-15",
      yard: "burnham",
    }).store;
    const stripped = stripRosterEntriesMatchingGone(roster, gone);
    expect(stripped.removed).toEqual([]);
    for (const yard of DRIVER_ROSTER_YARDS) {
      expect(rosterEntryCount(stripped.store, "full", yard)).toBe(1);
      expect(entriesForRoster(stripped.store, "full", yard)[0].name).toBe("Alex Rivera");
    }
  });

  it("keeps active hires on every yard when Gone has a same-name terminated person with emp #", () => {
    let roster = emptyDriverRosterStore();
    const activeByYard: Record<DriverRosterYard, string> = {
      burnham: "1001",
      rockford: "1002",
      pontiac: "1003",
      arc: "1004",
      zion: "1005",
    };
    for (const yard of DRIVER_ROSTER_YARDS) {
      roster = addRosterEntry(roster, {
        kind: "full",
        yard,
        truckNumber: activeByYard[yard],
        name: "David Perez",
      }).store;
    }
    // Terminated David Perez elsewhere — must not wipe every yard's David Perez.
    const gone = addGoneEntry(emptyDriverGoneStore(), {
      employeeNumber: "39990",
      name: "David Perez",
      terminationDate: "2025-11-01",
      yard: "rockford",
    }).store;
    const stripped = stripRosterEntriesMatchingGone(roster, gone);
    expect(stripped.removed).toEqual([]);
    for (const yard of DRIVER_ROSTER_YARDS) {
      expect(rosterEntryCount(stripped.store, "full", yard)).toBe(1);
      expect(entriesForRoster(stripped.store, "full", yard)[0]).toMatchObject({
        name: "David Perez",
        truckNumber: activeByYard[yard],
      });
    }
  });

  it("still prunes Buddy Johnson by emp # on every yard (terminated stays Gone)", () => {
    const staleAt = "2026-07-15T10:00:00.000Z";
    const goneAt = "2026-08-01T18:00:00.000Z";
    let roster = emptyDriverRosterStore();
    for (const yard of DRIVER_ROSTER_YARDS) {
      roster = addRosterEntry(
        roster,
        {
          kind: "full",
          yard,
          truckNumber: "31147",
          name: "Buddy Johnson",
        },
        { at: staleAt },
      ).store;
      roster = addRosterEntry(
        roster,
        {
          kind: "sat",
          yard,
          truckNumber: "31147",
          name: "Buddy Johnson",
        },
        { at: staleAt },
      ).store;
      // Unrelated active hire on same yard must survive.
      roster = addRosterEntry(
        roster,
        {
          kind: "full",
          yard,
          truckNumber: `9${yard.length}01`,
          name: `Keep ${yard}`,
        },
        { at: staleAt },
      ).store;
    }
    const gone = addGoneEntry(
      emptyDriverGoneStore(),
      {
        employeeNumber: "31147",
        name: "Buddy Johnson",
        terminationDate: "2026-08-01",
        notes: "Term, failed to report accident. intoxicated on the job.",
        yard: "rockford",
      },
      { at: goneAt },
    ).store;
    const stripped = stripRosterEntriesMatchingGone(roster, gone);
    for (const yard of DRIVER_ROSTER_YARDS) {
      expect(
        Object.values(stripped.store.entries).some(
          (row) =>
            row.yard === yard &&
            (row.truckNumber === "31147" || /buddy johnson/i.test(row.name)),
        ),
      ).toBe(false);
      expect(rosterEntryCount(stripped.store, "full", yard)).toBe(1);
      expect(entriesForRoster(stripped.store, "full", yard)[0].name).toBe(`Keep ${yard}`);
    }
  });

  it("never prunes by name+yard when both sides lack emp # (rehiring wins)", () => {
    // Stale Gone without emp # must not eat a deliberate Full Roster re-add.
    let roster = emptyDriverRosterStore();
    for (const yard of DRIVER_ROSTER_YARDS) {
      roster = addRosterEntry(roster, {
        kind: "full",
        yard,
        truckNumber: null,
        name: "No Emp Driver",
      }).store;
    }
    const gone = addGoneEntry(emptyDriverGoneStore(), {
      employeeNumber: null,
      name: "No Emp Driver",
      terminationDate: "2026-06-01",
      yard: "pontiac",
    }).store;
    const stripped = stripRosterEntriesMatchingGone(roster, gone);
    expect(stripped.removed).toEqual([]);
    for (const yard of DRIVER_ROSTER_YARDS) {
      expect(rosterEntryCount(stripped.store, "full", yard)).toBe(1);
    }
  });

  it("does not prune by name alone when Gone has no emp # and no yard", () => {
    const roster = addRosterEntry(emptyDriverRosterStore(), {
      kind: "full",
      yard: "zion",
      truckNumber: null,
      name: "Ambiguous Name",
    }).store;
    const gone = addGoneEntry(emptyDriverGoneStore(), {
      employeeNumber: null,
      name: "Ambiguous Name",
      terminationDate: "2026-03-01",
      yard: null,
    }).store;
    const stripped = stripRosterEntriesMatchingGone(roster, gone);
    expect(stripped.removed).toEqual([]);
    expect(rosterEntryCount(stripped.store, "full", "zion")).toBe(1);
  });

  it("Keith path: add David Perez + update phone survives hydrate with Gone same-name same-yard no emp #", () => {
    // Exact repro: add → edit phone → cloud refresh/hydrate → Gone prune.
    // Gone has a prior David Perez (no emp #, Rockford). New hire also has no emp #.
    const gone = addGoneEntry(emptyDriverGoneStore(), {
      employeeNumber: null,
      name: "David Perez",
      terminationDate: "2025-06-15",
      notes: "Left. prior Rockford driver.",
      yard: "rockford",
    }).store;

    let roster = addRosterEntry(emptyDriverRosterStore(), {
      kind: "full",
      yard: "rockford",
      truckNumber: null,
      name: "David Perez",
    }).store;
    const id = Object.keys(roster.entries)[0];
    // Phone save path (setDriverProfile → updateRosterEntry).
    roster = updateRosterEntry(roster, id, { phone: "(815) 555-0147" });

    expect(goneMatchesActiveRoster(gone.entries[Object.keys(gone.entries)[0]], roster.entries[id])).toBe(
      false,
    );
    const stripped = stripRosterEntriesMatchingGone(roster, gone);
    expect(stripped.removed).toEqual([]);
    expect(roster.entries[id]).toMatchObject({
      name: "David Perez",
      yard: "rockford",
      phone: "(815) 555-0147",
    });
    expect(rosterEntryCount(stripped.store, "full", "rockford")).toBe(1);

    // Buddy emp # still pruned alongside the surviving David Perez.
    const staleBuddyAt = "2026-07-01T12:00:00.000Z";
    roster = addRosterEntry(
      stripped.store,
      {
        kind: "full",
        yard: "rockford",
        truckNumber: "31147",
        name: "Buddy Johnson",
      },
      { at: staleBuddyAt },
    ).store;
    const goneWithBuddy = addGoneEntry(
      gone,
      {
        employeeNumber: "31147",
        name: "Buddy Johnson",
        terminationDate: "2026-08-01",
        yard: "rockford",
      },
      { at: "2026-08-01T18:00:00.000Z" },
    ).store;
    const after = stripRosterEntriesMatchingGone(roster, goneWithBuddy);
    expect(
      Object.values(after.store.entries).some(
        (row) => row.truckNumber === "31147" || /buddy johnson/i.test(row.name),
      ),
    ).toBe(false);
    expect(rosterEntryCount(after.store, "full", "rockford")).toBe(1);
    expect(entriesForRoster(after.store, "full", "rockford")[0]).toMatchObject({
      name: "David Perez",
      phone: "(815) 555-0147",
    });
  });
});

describe("Rehire wins over Gone history (same emp #, Gone stays)", () => {
  it("does not strip rehired David Perez when Gone has the same emp # (active wins)", () => {
    // Keith: David is a rehire still listed on Gone. Emp # match alone must NOT
    // delete the new Full card — Gone remains history.
    const goneAt = "2025-06-15T16:00:00.000Z";
    const rehireAt = "2026-09-28T19:00:00.000Z";
    const gone = addGoneEntry(
      emptyDriverGoneStore(),
      {
        employeeNumber: "40001",
        name: "David Perez",
        terminationDate: "2025-06-15",
        notes: "Left. prior Rockford driver.",
        yard: "rockford",
      },
      { at: goneAt },
    ).store;
    const goneRow = Object.values(gone.entries)[0];

    let roster = emptyDriverRosterStore();
    for (const yard of DRIVER_ROSTER_YARDS) {
      roster = addRosterEntry(
        roster,
        {
          kind: "full",
          yard,
          truckNumber: "40001",
          name: "David Perez",
          hireDate: "2026-09-20",
        },
        { at: rehireAt },
      ).store;
    }
    const rockfordId = Object.values(roster.entries).find(
      (row) => row.yard === "rockford" && row.kind === "full",
    )!.id;

    expect(goneMatchesActiveRoster(goneRow, roster.entries[rockfordId])).toBe(true);
    expect(goneShouldStripRosterEntry(goneRow, roster.entries[rockfordId])).toBe(false);

    const stripped = stripRosterEntriesMatchingGone(roster, gone);
    expect(stripped.removed).toEqual([]);
    for (const yard of DRIVER_ROSTER_YARDS) {
      expect(rosterEntryCount(stripped.store, "full", yard)).toBe(1);
      expect(entriesForRoster(stripped.store, "full", yard)[0]).toMatchObject({
        name: "David Perez",
        truckNumber: "40001",
      });
    }
    // Gone history untouched by strip (caller never clears Gone on rehire).
    expect(entriesForGone(gone)).toHaveLength(1);
    expect(entriesForGone(gone)[0].name).toBe("David Perez");
  });

  it("delayed hydrate: add → fill details → wait → prune keeps rehire, still strips Buddy", () => {
    // Minutes-later cloud poll / Gone refresh path (refreshInner + pruneTerminatedDrivers).
    const goneDavidAt = "2025-06-15T16:00:00.000Z";
    const goneBuddyAt = "2026-08-01T18:00:00.000Z";
    const addAt = "2026-09-28T19:50:00.000Z";
    const phoneAt = "2026-09-28T19:52:00.000Z"; // a few minutes of filling details

    let gone = addGoneEntry(
      emptyDriverGoneStore(),
      {
        employeeNumber: "40001",
        name: "David Perez",
        terminationDate: "2025-06-15",
        yard: "rockford",
      },
      { at: goneDavidAt },
    ).store;
    gone = addGoneEntry(
      gone,
      {
        employeeNumber: "31147",
        name: "Buddy Johnson",
        terminationDate: "2026-08-01",
        yard: "rockford",
      },
      { at: goneBuddyAt },
    ).store;

    let roster = addRosterEntry(
      emptyDriverRosterStore(),
      {
        kind: "full",
        yard: "rockford",
        truckNumber: "40001",
        name: "David Perez",
      },
      { at: addAt },
    ).store;
    const davidId = Object.keys(roster.entries)[0];
    roster = updateRosterEntry(
      roster,
      davidId,
      {
        phone: "(815) 555-0147",
        assignedTruck: "185",
        hireDate: "2026-09-20",
      },
      phoneAt,
    );

    // Stale Buddy bounce-back arrives from cloud during the same poll.
    roster = addRosterEntry(
      roster,
      {
        kind: "full",
        yard: "rockford",
        truckNumber: "31147",
        name: "Buddy Johnson",
      },
      { at: "2026-07-01T12:00:00.000Z" },
    ).store;

    // Simulate delayed hydrate/prune (same function refresh + Gone poll call).
    const afterFirst = stripRosterEntriesMatchingGone(roster, gone);
    const afterDelayed = stripRosterEntriesMatchingGone(afterFirst.store, gone);

    expect(rosterEntryCount(afterDelayed.store, "full", "rockford")).toBe(1);
    expect(entriesForRoster(afterDelayed.store, "full", "rockford")[0]).toMatchObject({
      name: "David Perez",
      truckNumber: "40001",
      phone: "(815) 555-0147",
      assignedTruck: "185",
      hireDate: "2026-09-20",
    });
    expect(
      Object.values(afterDelayed.store.entries).some(
        (row) => row.truckNumber === "31147" || /buddy johnson/i.test(row.name),
      ),
    ).toBe(false);
    // Gone still has both people — history not cleared.
    expect(entriesForGone(gone).map((row) => row.name).sort()).toEqual([
      "Buddy Johnson",
      "David Perez",
    ]);
  });

  it("Gone note edit (bumped updatedAt) must not re-delete a living rehire", () => {
    const goneAt = "2025-06-15T16:00:00.000Z";
    const rehireAt = "2026-09-28T19:00:00.000Z";
    const noteEditAt = "2026-09-28T20:00:00.000Z"; // after rehire
    let gone = addGoneEntry(
      emptyDriverGoneStore(),
      {
        employeeNumber: "40001",
        name: "David Perez",
        terminationDate: "2025-06-15",
        yard: "rockford",
      },
      { at: goneAt },
    ).store;
    const goneId = Object.keys(gone.entries)[0];
    // Note edit bumps updatedAt but createdAt stays — must not strip rehire.
    gone = {
      entries: {
        [goneId]: {
          ...gone.entries[goneId],
          notes: "Updated note after rehire",
          updatedAt: noteEditAt,
        },
      },
    };
    const roster = addRosterEntry(
      emptyDriverRosterStore(),
      {
        kind: "full",
        yard: "rockford",
        truckNumber: "40001",
        name: "David Perez",
      },
      { at: rehireAt },
    ).store;
    expect(goneShouldStripRosterEntry(gone.entries[goneId], Object.values(roster.entries)[0])).toBe(
      false,
    );
    expect(stripRosterEntriesMatchingGone(roster, gone).removed).toEqual([]);
  });
});
