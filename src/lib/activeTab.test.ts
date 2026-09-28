import { afterEach, describe, expect, it } from "vitest";
import {
  _resetActiveTabForTests,
  getActiveTab,
  isActiveTabOneOf,
  setActiveTab,
  subscribeActiveTab,
} from "./activeTab";

describe("activeTab", () => {
  afterEach(() => {
    _resetActiveTabForTests();
  });

  it("defaults to today and notifies subscribers on change", () => {
    expect(getActiveTab()).toBe("today");
    const seen: string[] = [];
    const stop = subscribeActiveTab(() => seen.push(getActiveTab()));
    setActiveTab("today");
    expect(seen).toEqual([]);
    setActiveTab("driver");
    setActiveTab("vacation");
    expect(seen).toEqual(["driver", "vacation"]);
    expect(isActiveTabOneOf(["today", "driver"])).toBe(false);
    expect(isActiveTabOneOf(["vacation"])).toBe(true);
    stop();
    setActiveTab("customers");
    expect(seen).toEqual(["driver", "vacation"]);
  });
});
