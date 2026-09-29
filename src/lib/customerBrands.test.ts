import { afterEach, describe, expect, it } from "vitest";
import {
  CUSTOMER_BRAND_OVERRIDES_KEY,
  LRS,
  REPUBLIC,
  TRI_STATE,
  WASTE_MANAGEMENT,
  assignCustomerBrand,
  brandCompanyIdForCustomer,
  brandForCustomer,
  clearCustomerBrandOverride,
  setCustomerBrandOverride,
} from "./customerBrands";

const memory = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => memory.clear(),
};
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

afterEach(() => {
  memory.clear();
});

describe("brandForCustomer", () => {
  it("maps Republic and Waste Management customers", () => {
    expect(brandForCustomer("Apollo")).toEqual(REPUBLIC);
    expect(brandForCustomer("batavia")).toEqual(WASTE_MANAGEMENT);
  });

  it("maps Tri-State and Tri-State Disposal case-insensitively", () => {
    expect(brandForCustomer("Tri-State")).toEqual(TRI_STATE);
    expect(brandForCustomer("tri-state disposal")).toEqual(TRI_STATE);
  });

  it("maps LRS", () => {
    expect(brandForCustomer("LRS")).toEqual(LRS);
    expect(brandForCustomer("lrs services")).toEqual(LRS);
  });

  it("returns null for unknown names without overrides", () => {
    expect(brandForCustomer("Acme Hauling")).toBeNull();
  });

  it("honors persisted overrides over the static map", () => {
    setCustomerBrandOverride("Apollo", "lrs");
    expect(brandForCustomer("Apollo")).toEqual(LRS);
    setCustomerBrandOverride("Apollo", "none");
    expect(brandForCustomer("Apollo")).toBeNull();
  });

  it("persists custom customer brand choices across reads", () => {
    setCustomerBrandOverride("New Yard", "republic");
    expect(brandForCustomer("new yard")).toEqual(REPUBLIC);
    const raw = localStorage.getItem(CUSTOMER_BRAND_OVERRIDES_KEY);
    expect(raw).toContain("new yard");
    expect(raw).toContain("republic");
  });
});

describe("brandCompanyIdForCustomer", () => {
  it("reads the static map and a persisted override", () => {
    expect(brandCompanyIdForCustomer("Apollo")).toBe("republic");
    expect(brandCompanyIdForCustomer("Batavia")).toBe("waste-management");
    expect(brandCompanyIdForCustomer("Tri-State")).toBe("tri-state");
    expect(brandCompanyIdForCustomer("LRS")).toBe("lrs");
    expect(brandCompanyIdForCustomer("Acme Hauling")).toBe("none");
    setCustomerBrandOverride("Apollo", "lrs");
    expect(brandCompanyIdForCustomer("Apollo")).toBe("lrs");
  });
});

describe("assignCustomerBrand", () => {
  it("moves the logo onto the new name and drops the old key", () => {
    setCustomerBrandOverride("New Yard", "waste-management");
    assignCustomerBrand("New Yard", "North Yard", "republic");
    expect(brandForCustomer("North Yard")).toEqual(REPUBLIC);
    expect(brandForCustomer("New Yard")).toBeNull();
    const raw = localStorage.getItem(CUSTOMER_BRAND_OVERRIDES_KEY) ?? "";
    expect(raw).toContain("north yard");
    expect(raw).not.toContain("new yard");
  });

  it("keeps a corrected logo on the same name", () => {
    assignCustomerBrand("New Yard", "New Yard", "lrs");
    expect(brandCompanyIdForCustomer("New Yard")).toBe("lrs");
    assignCustomerBrand("New Yard", "  New   Yard ", "republic");
    expect(brandForCustomer("New Yard")).toEqual(REPUBLIC);
  });
});

describe("clearCustomerBrandOverride", () => {
  it("removes a persisted override so the static map applies again", () => {
    setCustomerBrandOverride("Apollo", "lrs");
    expect(brandForCustomer("Apollo")).toEqual(LRS);
    clearCustomerBrandOverride("Apollo");
    expect(brandForCustomer("Apollo")).toEqual(REPUBLIC);
    const raw = localStorage.getItem(CUSTOMER_BRAND_OVERRIDES_KEY);
    expect(raw ?? "").not.toContain("apollo");
  });

  it("is a no-op when no override exists", () => {
    clearCustomerBrandOverride("Apollo");
    expect(brandForCustomer("Apollo")).toEqual(REPUBLIC);
  });
});
