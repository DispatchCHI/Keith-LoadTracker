import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Log Load overlay dismisses on successful save", () => {
  const log = readFileSync(new URL("./LogLoadScreen.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const edit = readFileSync(new URL("./EditLoadScreen.tsx", import.meta.url), "utf8");

  it("calls onSaved before specialty consume (never await consume)", () => {
    const start = log.indexOf("const finishSave");
    const end = log.indexOf("const commit", start);
    const finish = log.slice(start, end);
    expect(finish).toMatch(/onSaved\(/);
    expect(finish).toMatch(/consumeOpens/);
    expect(finish.indexOf("onSaved(")).toBeLessThan(finish.indexOf("consumeOpens"));
    expect(finish).not.toMatch(/await\s+consumeOpens/);
  });

  it("finishSave is synchronous so dismiss is not gated on cloud I/O", () => {
    expect(log).toMatch(/const finishSave = \(\) =>/);
    expect(log).not.toMatch(/const finishSave = async/);
  });

  it("App afterSave clears the log overlay (no flushSync specialty defer)", () => {
    expect(app).not.toMatch(/flushSync/);
    const start = app.indexOf("const afterSave");
    const end = app.indexOf("function onTabChange", start);
    const after = app.slice(start, end);
    expect(after).toMatch(/setOverlay\(null\)/);
    expect(app).toMatch(/onSaved=\{afterSave\}/);
  });

  it("edit path dismisses before specialty consume without awaiting", () => {
    const start = edit.indexOf("const finishSave");
    const end = edit.indexOf("const commit", start);
    const finish = edit.slice(start, end);
    expect(finish.indexOf("onSaved(")).toBeLessThan(finish.indexOf("consumeOpens"));
    expect(finish).not.toMatch(/await\s+consumeOpens/);
  });

  it("Back / Cancel and primary Save footer stay available with soft-warns", () => {
    expect(log).toMatch(/aria-label="Back"/);
    expect(log).toMatch(/onClick=\{onCancel\}/);
    expect(log).not.toMatch(/duplicate \|\| specialtyWarn \? null/);
    expect(log).toMatch(/disabled=\{!formComplete\(form\)\}/);
    expect(log).toMatch(/onClick=\{\(\) => commit\(\)\}/);
  });
});
