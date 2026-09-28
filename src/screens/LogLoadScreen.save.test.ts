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

describe("Log Load Save stays available for a valid customer load", () => {
  const log = readFileSync(new URL("./LogLoadScreen.tsx", import.meta.url), "utf8");

  it("keeps the main Save footer mounted (warns are additive, not a replacement)", () => {
    expect(log).toMatch(/overlay-footer overlay-footer-stack/);
    expect(log).toMatch(/\? "Save" :/);
    expect(log).not.toMatch(/duplicate \|\| specialtyWarn \? null/);
    // Second click / Save while a soft-warn is up must force through.
    expect(log).toMatch(/forceDuplicate: Boolean\(duplicate\)/);
    expect(log).toMatch(/forceSpecialty: Boolean\(specialtyWarn\)/);
  });

  it("Medill Trash→Newton County is complete and not a specialty soft-warn lane", () => {
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

  it("explicit Medill Trash→Newton County stays saveable without specialty warn", () => {
    const form: FormState = {
      truck: "6473",
      stationId: "medill",
      pickup: "Medill",
      commodity: "Trash (MSW)",
      destination: "Newton County",
    };
    expect(formComplete(form)).toBe(true);
    expect(
      resolveSpecialtyBoardMatch("medill", "Medill", "Newton County", "Trash (MSW)"),
    ).toBeNull();
  });
});
