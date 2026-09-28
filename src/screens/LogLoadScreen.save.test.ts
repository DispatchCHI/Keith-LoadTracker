import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formComplete, type FormState } from "../components/LoadForm";
import { resolveSpecialtyBoardMatch } from "../lib/specialtyBoard";
import {
  customersWithRealLanes,
  defaultCustomerLaneRoute,
  placesMatch,
  seededCustomerLaneStore,
} from "../lib/customerLanes";

describe("Log Load primary Save for a complete draft", () => {
  const log = readFileSync(new URL("./LogLoadScreen.tsx", import.meta.url), "utf8");

  it("keeps primary Save mounted and only disabled by formComplete (no warn gate)", () => {
    expect(log).toMatch(/overlay-footer overlay-footer-stack/);
    expect(log).toMatch(/\? "Save" :/);
    expect(log).toMatch(/disabled=\{!formComplete\(form\)\}/);
    // Soft-warns must never remove/replace the primary Save footer.
    expect(log).not.toMatch(/duplicate \|\| specialtyWarn \? null/);
    // Primary Save is the normal commit path — no warn-flow required to click.
    expect(log).toMatch(/onClick=\{\(\) => commit\(\)\}/);
  });

  it("complete draft (truck + pickup + commodity + dest) enables Save without specialty warn", () => {
    const form: FormState = {
      truck: "6473",
      stationId: "medill",
      pickup: "Medill",
      commodity: "Trash (MSW)",
      destination: "Newton County",
    };
    expect(formComplete(form)).toBe(true);
    expect(
      resolveSpecialtyBoardMatch(
        form.stationId,
        form.pickup,
        form.destination,
        form.commodity,
      ),
    ).toBeNull();
  });

  it("Medill seeded route is formComplete and not a specialty soft-warn lane", () => {
    const store = seededCustomerLaneStore();
    expect(customersWithRealLanes(store).some((n) => placesMatch(n, "Medill"))).toBe(
      true,
    );
    const route = defaultCustomerLaneRoute(store, "Medill", "2026-09-28", []);
    expect(route.commodity.trim()).toBeTruthy();
    expect(route.destination.trim()).toBeTruthy();

    const form: FormState = {
      truck: "6473",
      stationId: "medill",
      pickup: "Medill",
      commodity: route.commodity,
      destination: route.destination,
    };
    expect(formComplete(form)).toBe(true);
    expect(
      resolveSpecialtyBoardMatch(
        form.stationId,
        form.pickup,
        form.destination,
        form.commodity,
      ),
    ).toBeNull();
  });
});
