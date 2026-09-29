import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { attachCloudRefresh } from "./cloudRefresh";
import { clearNetworkSyncBackoff } from "./syncControl";

type Handler = () => void;

function stubDom(visibility: "visible" | "hidden") {
  const listeners = new Map<string, Set<Handler>>();
  const add = (type: string, fn: Handler) => {
    const set = listeners.get(type) ?? new Set();
    set.add(fn);
    listeners.set(type, set);
  };
  const remove = (type: string, fn: Handler) => {
    listeners.get(type)?.delete(fn);
  };
  const emit = (type: string) => {
    listeners.get(type)?.forEach((fn) => fn());
  };
  const documentStub = {
    visibilityState: visibility,
    addEventListener: add,
    removeEventListener: remove,
  };
  const windowStub = {
    addEventListener: add,
    removeEventListener: remove,
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  };
  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("window", windowStub);
  return {
    documentStub,
    emit,
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

describe("attachCloudRefresh", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearNetworkSyncBackoff();
  });

  it("pulls on focus, online, tab visible, and the poll interval", () => {
    vi.useFakeTimers();
    const { emit } = stubDom("visible");
    const refresh = vi.fn();
    const stop = attachCloudRefresh(refresh, {
      intervalMs: 1_000,
      subscribeTab: () => () => undefined,
    });

    emit("focus");
    emit("online");
    emit("visibilitychange");
    vi.advanceTimersByTime(1_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
    const after = refresh.mock.calls.length;
    emit("focus");
    vi.advanceTimersByTime(2_000);
    expect(refresh.mock.calls.length).toBe(after);
  });

  it("does not poll while the tab is hidden", () => {
    vi.useFakeTimers();
    stubDom("hidden");
    const refresh = vi.fn();
    const stop = attachCloudRefresh(refresh, {
      intervalMs: 1_000,
      subscribeTab: () => () => undefined,
    });
    vi.advanceTimersByTime(3_000);
    expect(refresh).not.toHaveBeenCalled();
    stop();
  });

  it("skips interval and focus while shouldPoll is false, then pulls when it becomes true", () => {
    vi.useFakeTimers();
    const { emit } = stubDom("visible");
    const refresh = vi.fn();
    let active = false;
    let tabListener: Handler | null = null;
    const stop = attachCloudRefresh(refresh, {
      intervalMs: 1_000,
      shouldPoll: () => active,
      subscribeTab: (listener) => {
        tabListener = listener;
        return () => {
          tabListener = null;
        };
      },
    });

    vi.advanceTimersByTime(3_000);
    emit("focus");
    vi.advanceTimersByTime(1_000);
    expect(refresh).not.toHaveBeenCalled();

    active = true;
    tabListener?.();
    vi.advanceTimersByTime(1_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("crew cloud refresh wiring", () => {
  it("adds call_off_log to supabase_realtime (postgres_changes was a no-op without it)", () => {
    const sql = readFileSync(new URL("../../Load-Tracker-call-off-log.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.call_off_log/);
  });

  it("roster, vacation, and call-off log poll/focus-refresh like loads", () => {
    const files = [
      "../store/DriverRosterContext.tsx",
      "../store/VacationContext.tsx",
      "../store/CallOffLogContext.tsx",
      "../store/DriverGoneContext.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src, file).toContain("attachCloudRefresh");
    }
  });

  it("wires call-off log and driver-gone to crew realtime", () => {
    const files = [
      "../store/CallOffLogContext.tsx",
      "../store/DriverGoneContext.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src, file).toContain("attachCrewTableRealtime");
    }
  });
});

describe("station call single poller", () => {
  it("TotalsScreen reuses the shared store and does not attachCloudRefresh", () => {
    const totals = readFileSync(new URL("../screens/TotalsScreen.tsx", import.meta.url), "utf8");
    const card = readFileSync(new URL("../components/StationCallsCard.tsx", import.meta.url), "utf8");
    expect(card).toContain("attachCloudRefresh");
    expect(totals).not.toContain("attachCloudRefresh");
    expect(totals).toContain("subscribeStationCallStore");
  });

  it("StationCallsCard re-reads local days after the cloud await so in-flight hour edits survive", () => {
    const card = readFileSync(new URL("../components/StationCallsCard.tsx", import.meta.url), "utf8");
    const hydrateStart = card.indexOf("const hydrate = async");
    expect(hydrateStart).toBeGreaterThan(0);
    const hydrateBody = card.slice(hydrateStart, card.indexOf("void hydrate()"));
    const awaitIdx = hydrateBody.indexOf("await Promise.all");
    const localReadIdx = hydrateBody.indexOf("readStationCallStore()", awaitIdx);
    expect(awaitIdx).toBeGreaterThan(0);
    expect(localReadIdx).toBeGreaterThan(awaitIdx);
    // Must not snapshot local *only* before the fetch (that wiped 3pm edits).
    expect(hydrateBody.indexOf("readStationCallStore()")).toBe(localReadIdx);
  });

  it("hour/close commits merge onto readStationCallStore, not a stale React store closure", () => {
    const card = readFileSync(new URL("../components/StationCallsCard.tsx", import.meta.url), "utf8");
    expect(card).toMatch(/setStationHour\(\s*readStationCallStore\(\)/);
    expect(card).toMatch(/setStationClose\(\s*readStationCallStore\(\)/);
    expect(card).toContain("if (!committedRef.current) commit()");
    // Focus AFTER setStore settles (rAF). Sync focus during keydown stole the
    // next cell on re-render — Keith needed a second Enter (fixed in 3d14119).
    expect(card).toMatch(
      /requestAnimationFrame\(\s*\(\)\s*=>\s*\{[\s\S]*?focusStationCallCell\(target\.stationId,\s*target\.col\)/,
    );
    expect(card).not.toContain("focusStationCallCell(nextStation, col)");
  });
});
