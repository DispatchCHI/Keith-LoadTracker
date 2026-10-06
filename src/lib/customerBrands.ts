/** Static brand marks shown on customer lane cards. */
export type CustomerBrand = {
  src: string;
  alt: string;
  /** Wide wordmark/oval: render in a wider slot (object-fit: contain) so text stays legible. */
  wide?: boolean;
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

export const KRMA: CustomerBrand = {
  src: "/brand/krma-kankakee.png",
  alt: "Kankakee River Metropolitan Agency (KRMA)",
  wide: true,
};

export const FORD: CustomerBrand = {
  src: "/brand/ford.png",
  alt: "Ford",
  wide: true,
};

/** Company choices when adding or editing a customer. */
export type BrandCompanyId =
  | "waste-management"
  | "republic"
  | "lrs"
  | "tri-state"
  | "krma"
  | "ford"
  | "none";

export const BRAND_COMPANY_OPTIONS: ReadonlyArray<{
  id: BrandCompanyId;
  label: string;
}> = [
  { id: "waste-management", label: "Waste Management" },
  { id: "republic", label: "Republic Services" },
  { id: "lrs", label: "LRS Services" },
  { id: "tri-state", label: "Tri-State" },
  { id: "krma", label: "KRMA" },
  { id: "ford", label: "Ford" },
  { id: "none", label: "None" },
];

const BRAND_BY_COMPANY: Record<Exclude<BrandCompanyId, "none">, CustomerBrand> = {
  "waste-management": WASTE_MANAGEMENT,
  republic: REPUBLIC,
  lrs: LRS,
  "tri-state": TRI_STATE,
  krma: KRMA,
  ford: FORD,
};

const BRAND_COMPANY_IDS = new Set<BrandCompanyId>(BRAND_COMPANY_OPTIONS.map((opt) => opt.id));

function isBrandCompanyId(value: unknown): value is BrandCompanyId {
  return typeof value === "string" && BRAND_COMPANY_IDS.has(value as BrandCompanyId);
}

/** localStorage map: lowercase customer name → BrandCompanyId */
export const CUSTOMER_BRAND_OVERRIDES_KEY =
  "chitrader.load-tracker.customer-brands.v1";

/** localStorage meta: { updatedAt } for cloud LWW */
export const CUSTOMER_BRAND_OVERRIDES_META_KEY =
  "chitrader.load-tracker.customer-brands.meta.v1";

/** Fired after localStorage brands change (local edit or cloud pull). */
export const CUSTOMER_BRANDS_EVENT = "klt-customer-brands";

/** Fired after a dispatcher save so CustomerLanesContext pushes cloud. */
export const CUSTOMER_BRANDS_FLUSH_EVENT = "klt-customer-brands-flush";

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
    ...["Kankakee RDF"].map((n) => [n.trim().toLowerCase(), KRMA] as const),
    ...["Ford"].map((n) => [n.trim().toLowerCase(), FORD] as const),
  ],
);

/**
 * Customers whose bundled logo shipped on 2026-10-06. Before then the
 * Add-customer form defaulted to "none", so a crew map stamped earlier can
 * hold a stale "none" for these names that would hide the new logo. Such
 * legacy "none" entries are ignored (and dropped on the next brand save).
 * A "none" chosen after the cutoff is honored as usual.
 */
const PRESET_LOGO_KEYS = new Set(["kankakee rdf", "ford"]);
const PRESET_LOGO_CUTOFF_MS = Date.parse("2026-10-06T21:00:00.000Z");

function dropLegacyPresetNones(
  map: Record<string, BrandCompanyId>,
  updatedAt: string,
): Record<string, BrandCompanyId> {
  const at = Date.parse(updatedAt);
  if (Number.isFinite(at) && at >= PRESET_LOGO_CUTOFF_MS) return map;
  let out = map;
  for (const key of PRESET_LOGO_KEYS) {
    if (out[key] === "none") {
      if (out === map) out = { ...map };
      delete out[key];
    }
  }
  return out;
}

function normalizeCustomerKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

function notifyBrandsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CUSTOMER_BRANDS_EVENT));
  }
}

function writeBrandsMeta(updatedAt: string): void {
  try {
    localStorage.setItem(
      CUSTOMER_BRAND_OVERRIDES_META_KEY,
      JSON.stringify({ updatedAt }),
    );
  } catch {
    /* private mode */
  }
}

function sanitizeBrandsMap(raw: unknown): Record<string, BrandCompanyId> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, BrandCompanyId> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isBrandCompanyId(value)) out[normalizeCustomerKey(key)] = value;
  }
  return out;
}

function readOverrides(): Record<string, BrandCompanyId> {
  try {
    const raw = localStorage.getItem(CUSTOMER_BRAND_OVERRIDES_KEY);
    if (!raw) return {};
    return dropLegacyPresetNones(
      sanitizeBrandsMap(JSON.parse(raw) as unknown),
      readCustomerBrandOverridesUpdatedAt(),
    );
  } catch {
    return {};
  }
}

function writeOverrides(
  next: Record<string, BrandCompanyId>,
  updatedAt = new Date().toISOString(),
): void {
  try {
    localStorage.setItem(CUSTOMER_BRAND_OVERRIDES_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
  writeBrandsMeta(updatedAt);
  notifyBrandsChanged();
}

/** Full override map for cloud pull/push. */
export function readCustomerBrandOverrides(): Record<string, BrandCompanyId> {
  return readOverrides();
}

export function readCustomerBrandOverridesUpdatedAt(): string {
  try {
    const raw = localStorage.getItem(CUSTOMER_BRAND_OVERRIDES_META_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { updatedAt?: unknown };
    return typeof parsed.updatedAt === "string" ? parsed.updatedAt : "";
  } catch {
    return "";
  }
}

/** True when any override is stored (including explicit "none"). */
export function brandsHaveOverrides(
  brands: Record<string, BrandCompanyId> = readOverrides(),
): boolean {
  return Object.keys(brands).length > 0;
}

/**
 * Replace local override map from cloud (or seed). Updates meta + notifies UI.
 */
export function applyCustomerBrandOverrides(
  incoming: Record<string, unknown>,
  updatedAt: string,
): Record<string, BrandCompanyId> {
  const next = sanitizeBrandsMap(incoming);
  try {
    localStorage.setItem(CUSTOMER_BRAND_OVERRIDES_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  writeBrandsMeta(updatedAt || new Date().toISOString());
  notifyBrandsChanged();
  return next;
}

/** Ask CustomerLanesContext to pull/merge/push brand overrides. */
export function flushCustomerBrandOverrides(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CUSTOMER_BRANDS_FLUSH_EVENT));
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