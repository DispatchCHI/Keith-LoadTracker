import { describe, expect, it } from "vitest";
import { showSeparateSpecialtyDetail, uniqueById } from "./specialtyRender";

describe("Specialty chips board renders each card once (Wheeling twice bug)", () => {
  it("no second detail card when the opened station is already in Show loads", () => {
    expect(showSeparateSpecialtyDetail("wheeling", true, ["elgin", "wheeling"])).toBe(false);
  });
  it("detail card still opens when loads are hidden or the station has no loads", () => {
    expect(showSeparateSpecialtyDetail("wheeling", false, ["wheeling"])).toBe(true);
    expect(showSeparateSpecialtyDetail("mccook", true, ["wheeling"])).toBe(true);
    expect(showSeparateSpecialtyDetail(null, true, ["wheeling"])).toBe(false);
  });
  it("uniqueById keeps first and order", () => {
    expect(uniqueById([{ id: "a" }, { id: "b" }, { id: "a" }]).map((x) => x.id)).toEqual(["a", "b"]);
  });
});
