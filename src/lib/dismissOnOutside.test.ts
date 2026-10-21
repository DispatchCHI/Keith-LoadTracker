import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { shouldDismissPanel } from "./dismissOnOutside";

const inside = { id: "inside", closest: () => null };
const outside = { id: "outside", closest: () => null };
const inDialog = { id: "dialog", closest: (s: string) => (s.includes("aria-modal") ? {} : null) };
const panel = { contains: (n: never) => n === (inside as never) };

describe("1.1.47 panels close on click outside", () => {
  it("click elsewhere closes", () => expect(shouldDismissPanel(panel, outside)).toBe(true));
  it("click inside panel (Edit, checkbox, Delete) keeps open", () =>
    expect(shouldDismissPanel(panel, inside)).toBe(false));
  it("click in a confirm / edit dialog keeps open", () =>
    expect(shouldDismissPanel(panel, inDialog)).toBe(false));
  it("no panel = nothing to close", () => expect(shouldDismissPanel(null, outside)).toBe(false));
  it("wired into Transfer stations, Landfill/Commodity lists and Specialty chips", () => {
    const yard = readFileSync("src/screens/YardDeskScreen.tsx", "utf8");
    expect(yard.match(/useDismissOnOutside\(/g)?.length).toBe(2);
    expect(readFileSync("src/components/SpecialtyBoardCard.tsx", "utf8")).toContain("useDismissOnOutside(");
  });
});
