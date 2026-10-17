import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  bulkDeletePrompt,
  deleteButtonLabel,
  deleteSelectedLoads,
  pruneSelection,
  toggleSelectAll,
  toggleSelectedId,
} from "./loadMultiSelect";

describe("station popup multi-delete", () => {
  it("toggles, prunes and selects all", () => {
    let s = toggleSelectedId(new Set(), "a");
    s = toggleSelectedId(s, "b");
    expect([...s]).toEqual(["a", "b"]);
    expect([...toggleSelectedId(s, "a")]).toEqual(["b"]);
    expect([...pruneSelection(s, ["b", "c"])]).toEqual(["b"]);
    expect([...toggleSelectAll(new Set(["a"]), ["a", "b"])]).toEqual(["a", "b"]);
    expect(toggleSelectAll(new Set(["a", "b"]), ["a", "b"]).size).toBe(0);
    expect(toggleSelectAll(new Set(), []).size).toBe(0);
  });

  it("labels and prompt", () => {
    expect(deleteButtonLabel(0)).toBe("Delete");
    expect(deleteButtonLabel(3)).toBe("Delete (3)");
    expect(bulkDeletePrompt(3)).toBe("Delete 3 loads?");
    expect(bulkDeletePrompt(1)).toBe("Delete 1 load?");
  });

  it("confirms once then calls the single-load delete for each id", () => {
    const del = vi.fn();
    const confirm = vi.fn(() => true);
    expect(deleteSelectedLoads(["a", "b", "a", "c"], del, confirm)).toBe(3);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith("Delete 3 loads?");
    expect(del.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c"]);
  });

  it("cancel or empty selection deletes nothing", () => {
    const del = vi.fn();
    expect(deleteSelectedLoads(["a"], del, () => false)).toBe(0);
    const confirm = vi.fn(() => true);
    expect(deleteSelectedLoads([], del, confirm)).toBe(0);
    expect(confirm).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("popup wires checkboxes after Edit and Delete in the header via deleteLoad", () => {
    const src = readFileSync("src/screens/YardDeskScreen.tsx", "utf8").replace(/\r\n/g, "\n");
    const edit = src.indexOf('className="yard-line-edit"');
    const pick = src.indexOf('className="yard-line-pick"', edit);
    expect(edit).toBeGreaterThan(0);
    expect(pick).toBeGreaterThan(edit);
    expect(src).toContain("deleteSelectedLoads(");
    expect(src).toMatch(/const \{ deleteLoad \} = useLoads\(\)/);
    const close = src.indexOf('className="yard-load-pop-close"');
    const del = src.indexOf('className="yard-load-pop-delete"');
    expect(del).toBeGreaterThan(close);
  });
});
