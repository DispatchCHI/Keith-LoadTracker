import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collapsePickupGrid, layoutPickupGrid, PICKUP_GRID_COLLAPSED_ROWS } from "./pickupChipOrder";
import {
  PICKUP_CHIP_LAYOUT_KEY,
  PICKUP_CHIP_LAYOUT_META_KEY,
  applyPickupChipLayoutRemote,
  dropIndexFromRects,
  layoutPickupGridWithOrder,
  movePickupChip,
  pickupColumnKeys,
  pickupDropIndex,
  readPickupChipLayout,
  readPickupChipLayoutForPush,
  readPickupChipLayoutUpdatedAt,
  resetPickupChipLayout,
  samePickupColumns,
  savePickupChipLayout,
} from "./pickupChipLayout";
import {
  pullAndMergePickupChipLayout,
  pushPickupChipLayoutIfLocalNewer,
} from "./pickupChipLayoutCloud";

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

const id = (name: string) => name;
const live = [
  "Medill", "Calumet", "Apollo", "LRS", "Schererville", "Arc", "NorthLake", "Melrose", "Liberty", "Dekalb",
  "Prairie Hill RFD", "GraysLake", "Laraway", "Batavia", "Elgin", "Evanston", "Hooker Street", "Wheeling",
  "Tri-State", "Citiwaste", "Roscoe", "Rockdale", "McCook", "Ford", "Hodgkins", "Hearthside", "Chicago Heights",
  "Crown Point", "East Chicago", "Kankakee RDF", "Midway LF", "Planet/WM", "Settler's Hill RDF",
  "Virginia RD", "Wheatland RDF", "WoodLand RDF",
];

function hidden<T>(col: readonly T[]): T[] {
  return col.slice(PICKUP_GRID_COLLAPSED_ROWS);
}

describe("pickup grid collapsed rows (1.1.57)", () => {
  it("shows 5 rows per column before + N more", () => {
    expect(PICKUP_GRID_COLLAPSED_ROWS).toBe(5);
    const cols = layoutPickupGrid(live, id);
    const shown = collapsePickupGrid(cols);
    expect(shown.every((col) => col.length === 5)).toBe(true);
    expect(shown.flat()).toHaveLength(20);
    expect(live.length - shown.flat().length).toBe(16);
    expect(hidden(cols[0]!).length).toBeGreaterThan(0);
  });
});

describe("custom pickup chip order", () => {
  it("persists a normalized 4-column order and leaves display labels alone", () => {
    const saved = savePickupChipLayout([
      ["Medill", "NorthLake"],
      ["Hooker"],
      ["Midway LF"],
      [],
    ]);
    expect(saved[0]).toEqual(["medill", "northlake"]);
    expect(saved[1]).toEqual(["hookerstreet"]);
    expect(saved[2]).toEqual(["midway"]);
    expect(readPickupChipLayout()).toEqual(saved);
    expect(readPickupChipLayoutUpdatedAt()).not.toBe("");
    const raw = localStorage.getItem(PICKUP_CHIP_LAYOUT_KEY) ?? "";
    expect(raw).toContain("northlake");
    expect(raw).not.toContain("NorthLake");

    const placed = layoutPickupGridWithOrder(
      ["NorthLake", "Hooker Street", "Midway LF", "Medill"],
      id,
      saved,
    );
    expect(placed[0]).toEqual(["Medill", "NorthLake"]);
    expect(placed[1]).toEqual(["Hooker Street"]);
    expect(placed[2]).toEqual(["Midway LF"]);
  });

  it("uses the default grid until a custom order is saved", () => {
    expect(readPickupChipLayout()).toBeNull();
    const custom = layoutPickupGridWithOrder(live, id, null);
    expect(custom).toEqual(layoutPickupGrid(live, id));
  });

  it("moves a chip into another column and another row", () => {
    const start = [
      ["medill", "calumet", "hookerstreet"],
      ["melrose", "northlake"],
      ["wheeling"],
      ["laraway"],
    ];
    const across = movePickupChip(start, { col: 0, index: 2 }, { col: 1, index: 1 });
    expect(across[0]).toEqual(["medill", "calumet"]);
    expect(across[1]).toEqual(["melrose", "hookerstreet", "northlake"]);
    expect(across[2]).toEqual(["wheeling"]);
    expect(across[3]).toEqual(["laraway"]);

    const down = movePickupChip(start, { col: 0, index: 0 }, { col: 0, index: 3 });
    expect(down[0]).toEqual(["calumet", "hookerstreet", "medill"]);
  });

  it("keeps hidden chips when a collapsed 5-row drag stays in the visible rows", () => {
    const full = [
      ["a", "b", "c", "d", "e", "f", "g"],
      ["h", "i", "j", "k", "l", "m", "n"],
      ["o", "p"],
      ["q"],
    ];
    const hiddenBefore = full.map(hidden);
    const toIndex = pickupDropIndex({
      columnLength: full[0]!.length,
      collapsed: true,
      overIndex: 3,
      after: false,
    });
    expect(toIndex).toBe(3);
    const next = movePickupChip(full, { col: 0, index: 0 }, { col: 0, index: toIndex });
    expect(next[0]!.slice(0, 5)).toEqual(["b", "c", "a", "d", "e"]);
    expect(hidden(next[0]!)).toEqual(hiddenBefore[0]);
    expect(hidden(next[1]!)).toEqual(hiddenBefore[1]);
    expect(next.flat().sort()).toEqual(full.flat().sort());
  });

  it("drops onto another column's fold without dropping that column's hidden chips", () => {
    const full = [
      ["a", "b", "c", "d", "e", "f", "g"],
      ["h", "i", "j", "k", "l", "m", "n"],
      ["o"],
      ["q"],
    ];
    const tail = pickupDropIndex({
      columnLength: full[1]!.length,
      collapsed: true,
      overIndex: null,
      after: false,
    });
    expect(tail).toBe(5);
    const next = movePickupChip(full, { col: 0, index: 1 }, { col: 1, index: tail });
    expect(next[0]).toEqual(["a", "c", "d", "e", "f", "g"]);
    expect(next[1]).toEqual(["h", "i", "j", "k", "l", "b", "m", "n"]);
    expect(next[1]).toEqual(expect.arrayContaining(["m", "n"]));
    expect(hidden(next[0]!)).toEqual(["g"]);
  });

  it("moves a row-6 chip into the top rows and a top chip below the fold when expanded", () => {
    const full = [
      ["a", "b", "c", "d", "e", "f", "g"],
      ["h", "i", "j", "k", "l"],
      [],
      [],
    ];
    const upTo = pickupDropIndex({
      columnLength: full[0]!.length,
      collapsed: false,
      overIndex: 0,
      after: false,
    });
    const pulled = movePickupChip(full, { col: 0, index: 6 }, { col: 0, index: upTo });
    expect(pulled[0]).toEqual(["g", "a", "b", "c", "d", "e", "f"]);

    const end = pickupDropIndex({
      columnLength: full[0]!.length,
      collapsed: false,
      overIndex: null,
      after: false,
    });
    expect(end).toBe(7);
    const pushed = movePickupChip(full, { col: 1, index: 0 }, { col: 0, index: end });
    expect(pushed[0]).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(pushed[1]).toEqual(["i", "j", "k", "l"]);
    expect(dropIndexFromRects({
      columnLength: 7,
      collapsed: false,
      pointerY: 48,
      chips: [
        { index: 0, top: 0, height: 20 },
        { index: 5, top: 100, height: 20 },
        { index: 6, top: 130, height: 20 },
      ],
    })).toBe(5);
    expect(dropIndexFromRects({
      columnLength: 7,
      collapsed: true,
      pointerY: 400,
      chips: [
        { index: 0, top: 0, height: 20 },
        { index: 4, top: 80, height: 20 },
      ],
    })).toBe(5);
  });

  it("appends pickups the saved order has never seen, using overflow balance", () => {
    const saved = [
      ["medill", "calumet"],
      ["melrose"],
      ["wheeling"],
      [],
    ];
    const items = ["Medill", "Calumet", "Melrose", "Wheeling", "Laraway", "New Yard", "GraysLake"];
    const cols = layoutPickupGridWithOrder(items, id, saved);
    expect(cols[0]).toEqual(["Medill", "Calumet"]);
    expect(cols[1]).toEqual(["Melrose"]);
    expect(cols[2]).toEqual(["Wheeling", "Laraway", "GraysLake"]);
    expect(cols[3]).toEqual(["New Yard"]);
    expect(cols.flat()).toHaveLength(items.length);
    expect(new Set(cols.flat())).toEqual(new Set(items));
  });

  it("drops deleted pickups instead of leaving a blank chip", () => {
    const saved = [
      ["medill", "ghostyard", "calumet"],
      ["gone"],
      [],
      ["melrose"],
    ];
    const items = ["Calumet", "Medill", "Melrose"];
    const cols = layoutPickupGridWithOrder(items, id, saved);
    expect(cols[0]).toEqual(["Medill", "Calumet"]);
    expect(cols[1]).toEqual([]);
    expect(cols[3]).toEqual(["Melrose"]);
    expect(cols.flat()).toEqual(["Medill", "Calumet", "Melrose"]);
  });

  it("reset clears the custom order back to the default columns", () => {
    savePickupChipLayout([["Laraway"], ["Medill"], [], []]);
    expect(readPickupChipLayout()).not.toBeNull();
    resetPickupChipLayout();
    expect(readPickupChipLayout()).toBeNull();
    expect(readPickupChipLayoutForPush().every((col) => col.length === 0)).toBe(true);
    expect(layoutPickupGridWithOrder(live, id, readPickupChipLayout())).toEqual(layoutPickupGrid(live, id));
  });

  it("round-trips the keys of a moved grid without losing a pickup", () => {
    const objects = live.map((name) => ({ name }));
    const laid = layoutPickupGrid(objects, (item) => item.name);
    const keys = pickupColumnKeys(laid, (item) => item.name);
    const moved = movePickupChip(keys, { col: 0, index: 0 }, { col: 3, index: 0 });
    savePickupChipLayout(moved);
    const again = layoutPickupGridWithOrder(objects, (item) => item.name, readPickupChipLayout());
    expect(again.flat()).toHaveLength(objects.length);
    expect(new Set(again.flat())).toEqual(new Set(objects));
    expect(again[3]![0]).toBe(laid[0]![0]);
    expect(samePickupColumns(moved, pickupColumnKeys(again, (item) => item.name))).toBe(true);
  });
});

type LayoutRow = { id: string; columns: unknown; updated_at: string; updated_by?: string | null };

function fakeSupabase(initial: LayoutRow | null) {
  let row = initial;
  const upserts: LayoutRow[] = [];
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: row, error: null }),
              };
            },
          };
        },
        upsert: async (payload: LayoutRow) => {
          upserts.push(payload);
          row = payload;
          return { error: null };
        },
      };
    },
  };
  return {
    client: client as unknown as SupabaseClient,
    upserts,
    current: () => row,
  };
}

describe("pickup chip layout cloud sync", () => {
  it("a fresh desk pulls the crew row and does not overwrite it", async () => {
    const remoteColumns = [["melrose"], ["medill"], [], []];
    const fake = fakeSupabase({
      id: "crew",
      columns: remoteColumns,
      updated_at: "2026-11-06T12:00:00.000Z",
    });
    await pushPickupChipLayoutIfLocalNewer(fake.client, "user-1");
    expect(fake.upserts).toHaveLength(0);
    await pullAndMergePickupChipLayout(fake.client);
    expect(readPickupChipLayout()).toEqual([["melrose"], ["medill"], [], []]);
    expect(readPickupChipLayoutUpdatedAt()).toBe("2026-11-06T12:00:00.000Z");
    await pushPickupChipLayoutIfLocalNewer(fake.client, "user-1");
    expect(fake.upserts).toHaveLength(0);
  });

  it("does not let an older local order replace a newer cloud order", async () => {
    localStorage.setItem(PICKUP_CHIP_LAYOUT_KEY, JSON.stringify([["medill"], [], [], []]));
    localStorage.setItem(
      PICKUP_CHIP_LAYOUT_META_KEY,
      JSON.stringify({ updatedAt: "2026-11-01T00:00:00.000Z" }),
    );
    const fake = fakeSupabase({
      id: "crew",
      columns: [["wheeling", "evanston"], [], [], []],
      updated_at: "2026-11-06T15:00:00.000Z",
    });
    await pullAndMergePickupChipLayout(fake.client);
    expect(readPickupChipLayout()?.[0]).toEqual(["wheeling", "evanston"]);
    await pushPickupChipLayoutIfLocalNewer(fake.client, "user-1");
    expect(fake.upserts).toHaveLength(0);
  });

  it("pushes a newer local move and a reset of the shared order", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T18:00:00.000Z"));
    try {
      const fake = fakeSupabase({
        id: "crew",
        columns: [["medill"], [], [], []],
        updated_at: "2020-01-01T00:00:00.000Z",
      });
      savePickupChipLayout([["Laraway", "Medill"], [], [], []]);
      await pushPickupChipLayoutIfLocalNewer(fake.client, "dispatcher-1");
      expect(fake.upserts).toHaveLength(1);
      expect(fake.upserts[0]!.columns).toEqual([["laraway", "medill"], [], [], []]);
      expect(fake.upserts[0]!.updated_by).toBe("dispatcher-1");
      expect(Date.parse(String(fake.upserts[0]!.updated_at))).toBeGreaterThan(Date.parse("2020-01-01T00:00:00.000Z"));

      vi.setSystemTime(new Date("2026-11-06T18:00:02.000Z"));
      resetPickupChipLayout();
      await pushPickupChipLayoutIfLocalNewer(fake.client, "dispatcher-1");
      expect(fake.upserts).toHaveLength(2);
      expect(fake.upserts[1]!.columns).toEqual([[], [], [], []]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a missing table instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: null, error: { message: "relation does not exist" } }),
                };
              },
            };
          },
          upsert: async () => ({ error: { message: "schema cache" } }),
        };
      },
    } as unknown as SupabaseClient;
    savePickupChipLayout([["Medill"], [], [], []]);
    await expect(pullAndMergePickupChipLayout(client)).resolves.toBeUndefined();
    await expect(pushPickupChipLayoutIfLocalNewer(client, null)).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("wires the crew row into refresh, flush, and realtime", () => {
    const ctx = readFileSync(new URL("../store/CustomerLanesContext.tsx", import.meta.url), "utf8");
    expect(ctx).toContain("pullAndMergePickupChipLayout");
    expect(ctx).toContain("pushPickupChipLayoutIfLocalNewer");
    expect(ctx).toContain('attachCrewTableRealtime("pickup-chip-layout", ["pickup_chip_layout"]');
    expect(ctx).toContain("PICKUP_CHIP_LAYOUT_FLUSH_EVENT");
    const form = readFileSync(new URL("../components/LoadForm.tsx", import.meta.url), "utf8");
    expect(form).toContain("Reset order");
    expect(form).toContain("layoutPickupGridWithOrder");
    expect(form).toContain("data-pickup-col");
    expect(form).toContain("startPickupDrag");
    const sql = readFileSync(new URL("../../Load-Tracker-pickup-chip-layout.sql", import.meta.url), "utf8");
    expect(sql).toContain("public.pickup_chip_layout");
    expect(sql).toContain("for delete to authenticated");
    expect(sql).toContain("alter publication supabase_realtime add table public.pickup_chip_layout");
  });
});
