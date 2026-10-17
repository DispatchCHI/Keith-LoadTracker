import { describe, expect, it } from "vitest";
import { loadCreatorMark } from "./loadEdited";

describe("loadCreatorMark (who logged the load)", () => {
  it("maps the stored display name to crew initials with a tooltip", () => {
    expect(loadCreatorMark("klawson")).toEqual({ initials: "KL", title: "Logged by K Lawson (klawson@mrbults.com)" });
    expect(loadCreatorMark("myork@mrbults.com")?.initials).toBe("MY");
    expect(loadCreatorMark("Jane Doe")).toEqual({ initials: "JD", title: "Logged by Jane Doe" });
  });
  it("older loads with no creator show nothing (no guessing)", () => {
    expect(loadCreatorMark(undefined)).toBeNull();
    expect(loadCreatorMark("  ")).toBeNull();
  });
});
