import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyStationTruckPoolRemote,
  flushScheduledStationTruckSave,
  nextEmptyTruckSlot,
  normalizeTruckSlots,
  previousTruckSlot,
  readStationTruckPoolUpdatedAt,
  readStationTruckSlots,
  scheduleStationTruckSave,
  stationTruckPoolEnabled,
  stationTruckPoolWinner,
  STATION_TRUCK_SLOT_COUNT,
} from "./stationTruckPool";
import {
  pullAndMergeStationTruckPool,
  pushStationTruckPoolIfLocalNewer,
} from "./stationTruckPoolCloud";

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
  flushScheduledStationTruckSave();
  memory.clear();
});

describe("station truck box focus", () => {
  it("moves to the next empty box and wraps, and stops when every box is full", () => {
    const slots = ["207", "", "214", "301", "", "", "", "", "", ""];
    expect(slots).toHaveLength(STATION_TRUCK_SLOT_COUNT);
    expect(nextEmptyTruckSlot(slots, 0)).toBe(1);
    expect(nextEmptyTruckSlot(slots, 1)).toBe(4);
    expect(nextEmptyTruckSlot(slots, 3)).toBe(4);
    const wrapped = ["", "207", "214", "301", "318", "401", "402", "403", "404", "405"];
    expect(nextEmptyTruckSlot(wrapped, 9)).toBe(0);
    const full = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    expect(nextEmptyTruckSlot(full, 4)).toBeNull();
    expect(nextEmptyTruckSlot(["", "2", "3", "4", "5", "6", "7", "8", "9", "10"], 0)).toBeNull();
  });

  it("treats a cleared box as free and steps back on an empty backspace", () => {
    const cleared = normalizeTruckSlots(["207", "214", ""]);
    expect(cleared[2]).toBe("");
    expect(nextEmptyTruckSlot(cleared, 0)).toBe(2);
    expect(previousTruckSlot(0)).toBeNull();
    expect(previousTruckSlot(2)).toBe(1);
    expect(normalizeTruckSlots(["ab-12"])[0]).toBe("AB12");
  });

  it("enables Batavia by station key, not by card position", () => {
    expect(stationTruckPoolEnabled("Batavia")).toBe(true);
    expect(stationTruckPoolEnabled("  batavia ")).toBe(true);
    expect(stationTruckPoolEnabled("Evanston")).toBe(false);
    expect(stationTruckPoolEnabled("Hooker Street")).toBe(false);
  });
});

describe("station truck pool merge", () => {
  it("keeps the newer crew row and lets an equal remote stamp win the pull", () => {
    const local = { slots: { batavia: normalizeTruckSlots(["207"]) }, updatedAt: "2026-11-10T18:00:00.000Z" };
    const older = stationTruckPoolWinner(local, {
      slots: { batavia: ["999"] },
      updatedAt: "2026-11-10T17:00:00.000Z",
    });
    expect(older.source).toBe("local");
    expect(older.slots.batavia?.[0]).toBe("207");

    const newer = stationTruckPoolWinner(local, {
      slots: { batavia: ["214"] },
      updatedAt: "2026-11-10T19:00:00.000Z",
    });
    expect(newer.source).toBe("remote");
    expect(newer.slots.batavia?.[0]).toBe("214");

    const tie = stationTruckPoolWinner(local, {
      slots: { batavia: ["301"] },
      updatedAt: local.updatedAt,
    });
    expect(tie.source).toBe("remote");
    expect(tie.slots.batavia?.[0]).toBe("301");

    const fresh = stationTruckPoolWinner(
      { slots: {}, updatedAt: "" },
      { slots: { batavia: ["vz-1"] }, updatedAt: "2026-11-10T19:00:00.000Z" },
    );
    expect(fresh.source).toBe("remote");
    expect(fresh.slots.batavia?.[0]).toBe("VZ1");
  });

  it("writes on the debounced save and prefers the newer local row when pushing", async () => {
    scheduleStationTruckSave("Batavia", ["207", "214"]);
    expect(readStationTruckSlots("Batavia")[0]).toBe("");
    flushScheduledStationTruckSave();
    expect(readStationTruckSlots("batavia").slice(0, 2)).toEqual(["207", "214"]);
    expect(readStationTruckPoolUpdatedAt()).not.toBe("");

    const localAt = readStationTruckPoolUpdatedAt();
    const upserts: unknown[] = [];
    let remoteAt = "2026-11-10T01:00:00.000Z";
    const client = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: { updated_at: remoteAt },
                    error: null,
                  }),
                };
              },
            };
          },
          upsert: async (row: unknown) => {
            upserts.push(row);
            return { error: null };
          },
        };
      },
    } as unknown as SupabaseClient;
    await pushStationTruckPoolIfLocalNewer(client, "dispatcher-1");
    expect(upserts).toHaveLength(1);
    expect((upserts[0] as { id: string; updated_at: string }).id).toBe("crew");
    expect((upserts[0] as { updated_at: string }).updated_at).toBe(localAt);

    remoteAt = "2099-01-01T00:00:00.000Z";
    applyStationTruckPoolRemote({ batavia: ["999"] }, remoteAt);
    upserts.length = 0;
    await pushStationTruckPoolIfLocalNewer(client, "dispatcher-1");
    expect(upserts).toHaveLength(0);
    expect(readStationTruckSlots("Batavia")[0]).toBe("999");
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
    scheduleStationTruckSave("Batavia", ["207"]);
    flushScheduledStationTruckSave();
    await expect(pullAndMergeStationTruckPool(client)).resolves.toBeUndefined();
    await expect(pushStationTruckPoolIfLocalNewer(client, null)).resolves.toBeUndefined();
    expect(readStationTruckSlots("Batavia")[0]).toBe("207");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("wires the crew row into refresh, flush, and realtime", () => {
    const ctx = readFileSync(new URL("../store/CustomerLanesContext.tsx", import.meta.url), "utf8");
    expect(ctx).toContain("pullAndMergeStationTruckPool");
    expect(ctx).toContain("pushStationTruckPoolIfLocalNewer");
    expect(ctx).toContain('attachCrewTableRealtime("station-truck-pool", ["station_truck_pool"]');
    expect(ctx).toContain("STATION_TRUCK_POOL_FLUSH_EVENT");
    const sql = readFileSync(new URL("../../Load-Tracker-station-truck-pool.sql", import.meta.url), "utf8");
    expect(sql).toContain("public.station_truck_pool");
    expect(sql).toContain("for delete to authenticated");
    expect(sql).toContain("alter publication supabase_realtime add table public.station_truck_pool");
  });
});
