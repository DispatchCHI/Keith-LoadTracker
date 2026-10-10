import { describe, expect, it } from "vitest";
import {
  LEGACY_LANE_DELETE_AT,
  reconcileCustomerLanes,
  seedLaneId,
  seededCustomerLaneStore,
  type CustomerLaneStore,
} from "./customerLanes";

const willow = () => seedLaneId("Medill", "Willow Ranch", "Yard Waste", "2021-01-01");

describe("built-in lane deletes are shared across desks", () => {
  it("a brand-new desk does not seed or upload a built-in another desk deleted", () => {
    const id = willow();
    const fresh = seededCustomerLaneStore();
    expect(fresh.lanes[id]).toBeTruthy();
    const remote: CustomerLaneStore = { lanes: { ...fresh.lanes } };
    delete remote.lanes[id];
    const result = reconcileCustomerLanes({
      local: fresh,
      remote,
      seenRemoteIds: [],
      deletedCustomerNames: [],
      deletedLaneIds: [],
      remoteTombstones: { [id]: "2026-10-01T15:00:00+00:00" },
    });
    expect(result.lanes[id]).toBeUndefined();
    expect(result.upload.some((lane) => lane.id === id)).toBe(false);
    expect(result.deletedLaneIds).toContain(id);
  });

  it("a stale desk's re-upload of a deleted built-in is deleted again", () => {
    const id = willow();
    const fresh = seededCustomerLaneStore();
    const result = reconcileCustomerLanes({
      local: fresh,
      remote: { lanes: { ...fresh.lanes } },
      seenRemoteIds: [],
      deletedCustomerNames: [],
      deletedLaneIds: [],
      remoteTombstones: { [id]: "2026-10-01T15:00:00.000000+00:00" },
    });
    expect(result.deleteIds).toContain(id);
    expect(result.lanes[id]).toBeUndefined();
  });

  it("a lane saved after the delete wins and drops the delete", () => {
    const id = willow();
    const fresh = seededCustomerLaneStore();
    const resaved = { ...fresh.lanes[id], tier1: 99, updatedAt: "2026-10-05T12:00:00.000Z" };
    const result = reconcileCustomerLanes({
      local: fresh,
      remote: { lanes: { ...fresh.lanes, [id]: resaved } },
      seenRemoteIds: [id],
      deletedCustomerNames: [],
      deletedLaneIds: [id],
      deletedLaneAt: { [id]: "2026-10-01T15:00:00.000Z" },
      remoteTombstones: { [id]: "2026-10-01T15:00:00+00:00" },
    });
    expect(result.lanes[id]?.tier1).toBe(99);
    expect(result.deleteIds).not.toContain(id);
    expect(result.deletedLaneIds).not.toContain(id);
  });

  it("compares real instants: a Z delete equal to the +00:00 lane does not win", () => {
    const id = willow();
    const fresh = seededCustomerLaneStore();
    const lane = { ...fresh.lanes[id], updatedAt: "2026-10-05T12:00:00.000+00:00" };
    const result = reconcileCustomerLanes({
      local: { lanes: {} },
      remote: { lanes: { [id]: lane } },
      seenRemoteIds: [id],
      deletedCustomerNames: [],
      deletedLaneIds: [id],
      deletedLaneAt: { [id]: "2026-10-05T12:00:00.000Z" },
      remoteTombstones: {},
    });
    expect(result.deleteIds).not.toContain(id);
    expect(result.lanes[id]).toBeTruthy();
  });

  it("shares this desk's legacy deletes with the cloud the first time", () => {
    const id = willow();
    const fresh = seededCustomerLaneStore();
    const local: CustomerLaneStore = { lanes: { ...fresh.lanes } };
    delete local.lanes[id];
    const remote: CustomerLaneStore = { lanes: { ...local.lanes } };
    const result = reconcileCustomerLanes({
      local,
      remote,
      seenRemoteIds: Object.keys(remote.lanes),
      deletedCustomerNames: [],
      deletedLaneIds: [id],
      remoteTombstones: {},
      now: "2026-10-09T22:40:00.000Z",
    });
    expect(result.tombstonesToPush).toEqual({ [id]: "2026-10-09T22:40:00.000Z" });
    expect(result.deletedLaneAt[id]).toBe("2026-10-09T22:40:00.000Z");
    expect(result.upload.some((lane) => lane.id === id)).toBe(false);
  });

  it("a legacy delete still beats an untouched built-in but not a later save", () => {
    const id = willow();
    const fresh = seededCustomerLaneStore();
    expect(Date.parse(LEGACY_LANE_DELETE_AT)).toBeGreaterThan(Date.parse(fresh.lanes[id].updatedAt));
    const edited = { ...fresh.lanes[id], updatedAt: "2026-09-30T12:00:00.000Z" };
    const result = reconcileCustomerLanes({
      local: { lanes: {} },
      remote: { lanes: { [id]: edited } },
      seenRemoteIds: [id],
      deletedCustomerNames: [],
      deletedLaneIds: [id],
      remoteTombstones: null,
    });
    expect(result.deleteIds).not.toContain(id);
    expect(result.lanes[id]).toBeTruthy();
  });

  it("pushes nothing when the tombstone table is not set up yet", () => {
    const id = willow();
    const result = reconcileCustomerLanes({
      local: { lanes: {} },
      remote: { lanes: {} },
      seenRemoteIds: [],
      deletedCustomerNames: [],
      deletedLaneIds: [id],
      remoteTombstones: null,
    });
    expect(result.tombstonesToPush).toEqual({});
    expect(result.deletedLaneIds).toContain(id);
  });
});

describe("CustomerLanesProvider tombstone guards", () => {
  it("reads shared deletes before reconciling and uploads nothing if that read fails", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/store/CustomerLanesContext.tsx", "utf8");
    const pull = src.indexOf("fetchLaneTombstones(supabase)");
    const reconcile = src.indexOf("reconcileCustomerLanes({");
    expect(pull).toBeGreaterThan(0);
    expect(pull).toBeLessThan(reconcile);
    expect(src).toMatch(/if \(!tombPull\.ok\) \{\s*await syncBrandOverrides\(\);\s*return;/);
  });
});