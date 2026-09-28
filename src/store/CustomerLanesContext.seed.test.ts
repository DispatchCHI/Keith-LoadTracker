import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CustomerLanesProvider merges seed upgrades on init", () => {
  const src = readFileSync(new URL("./CustomerLanesContext.tsx", import.meta.url), "utf8");

  it("calls mergeSeededLanes when persisted lanes already exist", () => {
    const start = src.indexOf("const [store, setStore]");
    const end = src.indexOf("const storeRef", start);
    const init = src.slice(start, end);
    expect(init).toMatch(/Object\.keys\(persisted\.lanes\)\.length/);
    expect(init).toMatch(/mergeSeededLanes/);
    // Must upgrade before returning persisted-only lanes (Medill stub → real routes).
    expect(init.indexOf("mergeSeededLanes")).toBeLessThan(
      init.indexOf("return seeded"),
    );
  });
});
