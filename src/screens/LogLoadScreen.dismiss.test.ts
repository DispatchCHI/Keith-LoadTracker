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
    expect(finish).toMatch(/setTimeout\(/);
  });

  it("finishSave is synchronous so dismiss is not gated on cloud I/O", () => {
    expect(log).toMatch(/const finishSave = \(\) =>/);
    expect(log).not.toMatch(/const finishSave = async/);
  });

  it("App afterSave clears the log overlay with flushSync", () => {
    expect(app).toMatch(/flushSync/);
    const start = app.indexOf("const afterSave");
    const end = app.indexOf("function onTabChange", start);
    const after = app.slice(start, end);
    expect(after).toMatch(/setOverlay\(null\)/);
    expect(after.indexOf("flushSync")).toBeLessThan(after.indexOf("setOverlay(null)"));
    expect(app).toMatch(/onSaved=\{afterSave\}/);
  });

  it("edit path also dismisses before deferred specialty consume", () => {
    const start = edit.indexOf("const finishSave");
    const end = edit.indexOf("const commit", start);
    const finish = edit.slice(start, end);
    expect(finish.indexOf("onSaved(")).toBeLessThan(finish.indexOf("consumeOpens"));
    expect(finish).toMatch(/setTimeout\(/);
    expect(finish).not.toMatch(/await\s+consumeOpens/);
  });

  it("Back / Cancel stay available; warn dialogs hide the main Save footer", () => {
    expect(log).toMatch(/aria-label="Back"/);
    expect(log).toMatch(/onClick=\{onCancel\}/);
    expect(log).toMatch(/duplicate \|\| specialtyWarn \? null/);
  });
});
