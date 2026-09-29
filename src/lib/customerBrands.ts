/** Static brand marks shown on customer lane cards. */
export type CustomerBrand = {
  src: string;
  alt: string;
};

export const REPUBLIC: CustomerBrand = {
  src: "/brand/republic-services.png",
  alt: "Republic Services",
};

export const WASTE_MANAGEMENT: CustomerBrand = {
  src: "/brand/waste-management.jpg",
  alt: "Waste Management",
};

export const TRI_STATE: CustomerBrand = {
  src: "/brand/tri-state-disposal.webp",
  alt: "Tri-State Disposal",
};

export const LRS: CustomerBrand = {
  src: "/brand/lrs.png",
  alt: "LRS Services",
};

/** Company choices when adding or editing a customer. */
export type BrandCompanyId = "waste-management" | "republic" | "lrs" | "tri-state" | "none";

export const BRAND_COMPANY_OPTIONS: ReadonlyArray<{
  id: BrandCompanyId;
  label: string;
}> = [
  { id: "waste-management", label: "Waste Management" },
  { id: "republic", label: "Republic Services" },
  { id: "lrs", label: "LRS Services" },
  { id: "tri-state", label: "Tri-State" },
  { id: "none", label: "None" },
];

const BRAND_BY_COMPANY: Record<Exclude<BrandCompanyId, "none">, CustomerBrand> = {
  "waste-management": WASTE_MANAGEMENT,
  republic: REPUBLIC,
  lrs: LRS,
  "tri-state": TRI_STATE,
};

const BRAND_COMPANY_IDS = new Set<BrandCompanyId>(BRAND_COMPANY_OPTIONS.map((opt) => opt.id));

function isBrandCompanyId(value: unknown): value is BrandCompanyId {
  return typeof value === "string" && BRAND_COMPANY_IDS.has(value as BrandCompanyId);
}

/** localStorage map: lowercase customer name → BrandCompanyId */
export const CUSTOMER_BRAND_OVERRIDES_KEY =
  "chitrader.load-tracker.customer-brands.v1";

/** Customer display names → brand mark (matched case-insensitively). */
const CUSTOMER_BRANDS: Record<string, CustomerBrand> = Object.fromEntries(
  [
    ...[
      "Apollo",
      "Chicago Heights",
      "East Chicago",
      "Evanston",
      "Melrose",
      "Schererville",
      "Calumet",
      "Medill",
      "Citiwaste",
      "Arc",
    ].map((n) => [n.trim().toLowerCase(), REPUBLIC] as const),
    ...[
      "Batavia",
      "Rockdale",
      "Hooker Street",
      "Northlake",
      "Woodland RDF",
      "Roscoe",
      "Liberty",
      "Elgin",
    ].map((n) => [n.trim().toLowerCase(), WASTE_MANAGEMENT] as const),
    ...["Tri-State", "Tri-State Disposal"].map(
      (n) => [n.trim().toLowerCase(), TRI_STATE] as const,
    ),
    ...["LRS", "LRS Services"].map((n) => [n.trim().toLowerCase(), LRS] as const),
  ],
);

function normalizeCustomerKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

function readOverrides(): Record<string, BrandCompanyId> {
  try {
    const raw = localStorage.getItem(CUSTOMER_BRAND_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, BrandCompanyId> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isBrandCompanyId(value)) out[normalizeCustomerKey(key)] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeOverrides(next: Record<string, BrandCompanyId>): void {
  try {
    localStorage.setItem(CUSTOMER_BRAND_OVERRIDES_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Persist a brand company choice for a customer display name. */
export function setCustomerBrandOverride(
  name: string,
  company: BrandCompanyId,
): void {
  const key = normalizeCustomerKey(name);
  if (!key) return;
  const next = readOverrides();
  if (company === "none") {
    // Explicit none still overrides a static map hit (e.g. custom rename).
    next[key] = "none";
  } else {
    next[key] = company;
  }
  writeOverrides(next);
}

/**
 * Point the logo at `toName` and drop the override stored under `fromName`
 * when the display name changed. Same persistence as add-customer.
 */
export function assignCustomerBrand(
  fromName: string,
  toName: string,
  company: BrandCompanyId,
): void {
  const to = toName.replace(/\s+/g, " ").trim();
  if (!to) return;
  const fromKey = normalizeCustomerKey(fromName);
  const toKey = normalizeCustomerKey(to);
  if (fromKey && fromKey !== toKey) clearCustomerBrandOverride(fromName);
  setCustomerBrandOverride(to, company);
}

/** Company id currently shown for a customer, including static map hits. */
export function brandCompanyIdForCustomer(name: string): BrandCompanyId {
  const key = normalizeCustomerKey(name);
  if (!key) return "none";
  const overrides = readOverrides();
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key]!;
  const brand = CUSTOMER_BRANDS[key];
  if (!brand) return "none";
  const hit = (Object.entries(BRAND_BY_COMPANY) as [BrandCompanyId, CustomerBrand][]).find(
    ([, mark]) => mark.src === brand.src,
  );
  return hit?.[0] ?? "none";
}

/** Drop a persisted brand override so static map (or none) applies again. */
export function clearCustomerBrandOverride(name: string): void {
  const key = normalizeCustomerKey(name);
  if (!key) return;
  const next = readOverrides();
  if (!Object.prototype.hasOwnProperty.call(next, key)) return;
  delete next[key];
  writeOverrides(next);
}

export function brandForCompanyId(
  company: BrandCompanyId,
): CustomerBrand | null {
  if (company === "none") return null;
  return BRAND_BY_COMPANY[company];
}

/**
 * Brand mark for a customer card. Honors localStorage overrides first, then
 * the static name map.
 */
export function brandForCustomer(name: string): CustomerBrand | null {
  const key = normalizeCustomerKey(name);
  if (!key) return null;
  const overrides = readOverrides();
  if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    return brandForCompanyId(overrides[key]!);
  }
  return CUSTOMER_BRANDS[key] ?? null;
}
