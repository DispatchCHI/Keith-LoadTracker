import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readTodaySkin, TODAY_SKIN_KEY, writeTodaySkin } from "./todaySkin";

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

describe("today skin on this desk", () => {
  it("stays on classic Today until this desk chooses Yard Desk", () => {
    installStorage();
    expect(readTodaySkin()).toBe("classic");
  });

  it("remembers Yard Desk and can flip back", () => {
    installStorage();
    writeTodaySkin("yard");
    expect(localStorage.getItem(TODAY_SKIN_KEY)).toBe("yard");
    expect(readTodaySkin()).toBe("yard");
    writeTodaySkin("classic");
    expect(readTodaySkin()).toBe("classic");
  });

  it("ignores a stored value that is not a skin", () => {
    installStorage();
    localStorage.setItem(TODAY_SKIN_KEY, "gone");
    expect(readTodaySkin()).toBe("classic");
  });

  it("keeps the classic Today split and adds Yard Desk as the other skin", () => {
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    expect(app).toContain("desktop-split");
    expect(app).toContain("YardDeskScreen");
    expect(app).toContain("TodaySkinToggle");
    expect(app).toContain('todaySkin !== "yard"');
    expect(app).toContain('todaySkin === "yard"');
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
    expect(screen).not.toContain("yard-driver-names");
    expect(screen).not.toContain("CollapsibleRank");
    expect(screen).not.toContain("<DayPicker");
  });
});
