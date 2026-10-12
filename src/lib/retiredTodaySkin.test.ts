import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRetiredTodaySkin, RETIRED_TODAY_SKIN_KEY } from "./retiredTodaySkin";

const memory = new Map<string, string>();

afterEach(() => {
  memory.clear();
  vi.unstubAllGlobals();
});

function installStorage() {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  });
}

describe("Yard Desk is the only Today layout", () => {
  it("drops the old layout choice a desk saved", () => {
    installStorage();
    localStorage.setItem(RETIRED_TODAY_SKIN_KEY, "classic");
    clearRetiredTodaySkin();
    expect(localStorage.getItem(RETIRED_TODAY_SKIN_KEY)).toBeNull();
  });

  it("does not throw when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => clearRetiredTodaySkin()).not.toThrow();
  });

  it("App renders Yard Desk for Today with no layout switch", () => {
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    expect(app).toContain("YardDeskScreen");
    expect(app).toContain("clearRetiredTodaySkin");
    expect(app).not.toContain("TodaySkinToggle");
    expect(app).not.toContain("todaySkin");
    expect(app).not.toContain("TodayScreen");
    expect(app).not.toContain("TotalsScreen");
    expect(app).not.toContain("desktop-split");
  });

  it("builds Yard Desk as the full page from the screenshot", () => {
    const screen = readFileSync(new URL("../screens/YardDeskScreen.tsx", import.meta.url), "utf8");
    expect(screen).toContain("Walking floor");
    expect(screen).toContain("Available drivers");
    expect(screen).toContain("Transfer stations");
    expect(screen).toContain("layout=\"chips\"");
    expect(screen).toContain("noteAside");
    expect(screen).toContain("sectionsOnly");
    expect(screen).toContain("showUnavailable");
    expect(screen).toContain("yard-right");
    expect(screen).toContain("yard-load-pop");
    expect(screen).toContain("CommodityTag");
    const hour = readFileSync(new URL("../components/StationCallsCard.tsx", import.meta.url), "utf8");
    expect(hour).toContain('className="yard-hour"');
    expect(hour).toContain('className="station-calls-card"');
    expect(hour).toContain("if (noteAside)");
    expect(screen).not.toContain("yard-driver-names");
    expect(screen).not.toContain("CollapsibleRank");
    expect(screen).not.toContain("<DayPicker");
  });
});
