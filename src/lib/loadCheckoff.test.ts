import { afterEach, describe, expect, it } from "vitest";
import { isLoadChecked, LOAD_CHECKOFF_KEY, readCheckedLoadIds, toggleCheckedLoad } from "./loadCheckoff";

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

describe("load checkoff", () => {
  it("starts with nothing checked", () => {
    expect(readCheckedLoadIds().size).toBe(0);
    expect(isLoadChecked("load-1")).toBe(false);
  });

  it("toggles a load on and off", () => {
    expect(toggleCheckedLoad("load-1").has("load-1")).toBe(true);
    expect(isLoadChecked("load-1")).toBe(true);
    expect(memory.get(LOAD_CHECKOFF_KEY)).toBe(JSON.stringify(["load-1"]));

    expect(toggleCheckedLoad("load-1").has("load-1")).toBe(false);
    expect(isLoadChecked("load-1")).toBe(false);
  });

  it("keeps other checked loads when one is cleared", () => {
    toggleCheckedLoad("a");
    toggleCheckedLoad("b");
    toggleCheckedLoad("a");
    expect([...readCheckedLoadIds()].sort()).toEqual(["b"]);
  });

  it("ignores a broken saved list", () => {
    memory.set(LOAD_CHECKOFF_KEY, "{not-json");
    expect(readCheckedLoadIds().size).toBe(0);
    memory.set(LOAD_CHECKOFF_KEY, JSON.stringify({ id: "a" }));
    expect(readCheckedLoadIds().size).toBe(0);
  });
});
