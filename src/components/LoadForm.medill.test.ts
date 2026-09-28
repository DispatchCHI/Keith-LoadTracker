import { describe, expect, it } from "vitest";
import { formComplete, type FormState } from "./LoadForm";
import { sanitizeTruck } from "../lib/truck";

describe("Log Load Medill + truck 6473", () => {
  it("accepts truck 6473 and a complete Medill Trash→Newton County form", () => {
    const truck = sanitizeTruck("6473");
    expect(truck).toBe("6473");
    const form: FormState = {
      truck,
      stationId: "medill",
      pickup: "Medill",
      commodity: "Trash (MSW)",
      destination: "Newton County",
    };
    expect(formComplete(form)).toBe(true);
  });

  it("keeps Custom Medill path complete without a Customers chip", () => {
    const form: FormState = {
      truck: "6473",
      stationId: "custom",
      pickup: "Medill",
      commodity: "Trash (MSW)",
      destination: "Newton County",
    };
    expect(formComplete(form)).toBe(true);
  });
});
