/** Customer lanes + 5-year contract rate books. Local persist + Supabase. */

import { CUSTOMER_LANE_SEED } from "../data/customerLaneSeed";
import { isValidISODate } from "./chicagoDate";
import { tallyLabel } from "./commodity";

export const CUSTOMER_LANES_STORE_KEY = "chitrader.load-tracker.customer-lanes.v1";
export const CUSTOMER_LANES_TABLE = "customer_lanes";

export const LANE_COMMODITIES = [
  "Yard Waste",
  "Residual",
  "Recycle",
  "Cardboard",
  "Glass",
  "Leachate (tanker)",
  "Trash (MSW)",
] as const;
export type LaneCommodity = (typeof LANE_COMMODITIES)[number];

export type CustomerLane = {
  id: string;
  customer: string;
  destination: string;
  commodity: string;
  effectiveDate: string;
  tier1: number | null;
  tier2: number | null;
  tier3: number | null;
  tier4: number | null;
  tier5: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerLaneInput = {
  id?: string;
  customer: string;
  destination?: string;
  commodity?: string;
  effectiveDate: string;
  tier1?: number | null;
  tier2?: number | null;
  tier3?: number | null;
  tier4?: number | null;
  tier5?: number | null;
};

export type CustomerLaneStore = {
  lanes: Record<string, CustomerLane>;
};

export type CustomerLanePersisted = {
  version: 1;
  lanes: Record<string, CustomerLane>;
  seenRemoteIds: string[];
  seededAt: string | null;
  /** Normalized customer names removed from the book; seed must not resurrect them. */
  deletedCustomerNames: string[];
};

export type CustomerLaneRow = {
  id: string;
  customer: string;
  destination: string | null;
  commodity: string | null;
  effective_date: string;
  tier1: number | string | null;
  tier2: number | string | null;
  tier3: number | string | null;
  tier4: number | string | null;
  tier5: number | string | null;
  created_at: string;
  updated_at: string;
};

function nowIso(at?: string): string {
  return at ?? new Date().toISOString();
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `cl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function dollarsToCents(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (!Number.isFinite(raw) || raw < 0) return null;
  return Math.round(raw * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function parseMoney(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.round(raw * 100) / 100;
  }
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw.replace(/[$,\s]/g, ""));
    if (Number.isFinite(n) && n >= 0) return Math.round(n * 100) / 100;
  }
  return null;
}

export function cleanPlaceName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim();
}

export function normalizePlaceName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bde kalb\b/g, "dekalb")
    .replace(/\bdek alb\b/g, "dekalb")
    .replace(/\bwinnebego\b/g, "winnebago")
    .replace(/\bnewton county\b/g, "newton")
    .replace(/\bchristiansen farms\b/g, "christiansen")
    .replace(/\btrash loads?\b/g, " ")
    .replace(/\bmsw\b/g, " ")
    .replace(/\bstreet\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function placesMatch(a: string, b: string): boolean {
  const ka = normalizePlaceName(a);
  const kb = normalizePlaceName(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.startsWith(kb) || kb.startsWith(ka)) return ka.length >= 3 && kb.length >= 3;
  return false;
}

export function laneCommodityKey(raw: string): string {
  const label = tallyLabel(raw);
  if (label === "LEACHATE") return "leachate";
  // Everything except trash + leachate is walking-floor for pay / specialty tallies.
  if (
    label === "WOOD" ||
    label === "RECYCLE" ||
    label === "YARD" ||
    label === "RESIDUAL" ||
    label === "CARDBOARD" ||
    label === "GLASS" ||
    /walking|\bwf\b|recycle|yard|residual|residue|cardboard|glass|wood/.test(
      raw.toLowerCase(),
    )
  ) {
    return "walking-floor";
  }
  if (label === "TRASH") return "trash";
  return normalizePlaceName(raw);
}

export function commoditiesMatch(a: string, b: string): boolean {
  return laneCommodityKey(a) === laneCommodityKey(b);
}

export function isLaneStub(lane: CustomerLane): boolean {
  return !lane.destination.trim();
}

export function laneHasRates(lane: CustomerLane): boolean {
  return [lane.tier1, lane.tier2, lane.tier3, lane.tier4, lane.tier5].some(
    (n) => n !== null && n !== undefined,
  );
}

export function tierDollars(lane: CustomerLane, tier: 1 | 2 | 3 | 4 | 5): number | null {
  if (tier === 1) return lane.tier1;
  if (tier === 2) return lane.tier2;
  if (tier === 3) return lane.tier3;
  if (tier === 4) return lane.tier4;
  return lane.tier5;
}

export function emptyCustomerLaneStore(): CustomerLaneStore {
  return { lanes: {} };
}

export function seedLaneId(customer: string, destination: string, commodity: string, effectiveDate: string): string {
  const slug = (s: string) =>
    normalizePlaceName(s).replace(/\s+/g, "-") || "stub";
  return `cl-${slug(customer)}-${slug(destination)}-${laneCommodityKey(commodity)}-${effectiveDate}`;
}

export function lanesFromSeed(at = "2026-09-16T12:00:00.000Z"): CustomerLane[] {
  return CUSTOMER_LANE_SEED.map((row) => {
    const customer = cleanPlaceName(row.customer);
    const destination = cleanPlaceName(row.destination);
    const commodity = cleanPlaceName(row.commodity) || "Trash (MSW)";
    return {
      id: seedLaneId(customer, destination, commodity, row.effectiveDate),
      customer,
      destination,
      commodity,
      effectiveDate: row.effectiveDate,
      tier1: row.tiers?.[0] ?? null,
      tier2: row.tiers?.[1] ?? null,
      tier3: row.tiers?.[2] ?? null,
      tier4: row.tiers?.[3] ?? null,
      tier5: row.tiers?.[4] ?? null,
      createdAt: at,
      updatedAt: at,
    };
  });
}

export function storeFromLanes(lanes: readonly CustomerLane[]): CustomerLaneStore {
  const next: Record<string, CustomerLane> = {};
  for (const lane of lanes) next[lane.id] = lane;
  return { lanes: next };
}

export function seededCustomerLaneStore(at?: string): CustomerLaneStore {
  return storeFromLanes(lanesFromSeed(at));
}

export function cleanCustomerLane(raw: unknown): CustomerLane | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const customer = cleanPlaceName(rec.customer);
  if (!customer) return null;
  const id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : null;
  if (!id) return null;
  const effectiveDate =
    typeof rec.effectiveDate === "string"
      ? rec.effectiveDate
      : typeof rec.effective_date === "string"
        ? rec.effective_date
        : "";
  if (!isValidISODate(effectiveDate)) return null;
  const createdAt =
    typeof rec.createdAt === "string" && rec.createdAt
      ? rec.createdAt
      : typeof rec.created_at === "string" && rec.created_at
        ? rec.created_at
        : nowIso();
  const updatedAt =
    typeof rec.updatedAt === "string" && rec.updatedAt
      ? rec.updatedAt
      : typeof rec.updated_at === "string" && rec.updated_at
        ? rec.updated_at
        : createdAt;
  return {
    id,
    customer,
    destination: cleanPlaceName(rec.destination),
    commodity: cleanPlaceName(rec.commodity) || "Trash (MSW)",
    effectiveDate,
    tier1: parseMoney(rec.tier1),
    tier2: parseMoney(rec.tier2),
    tier3: parseMoney(rec.tier3),
    tier4: parseMoney(rec.tier4),
    tier5: parseMoney(rec.tier5),
    createdAt,
    updatedAt,
  };
}

export function readCustomerLanePersisted(): CustomerLanePersisted {
  try {
    const raw = localStorage.getItem(CUSTOMER_LANES_STORE_KEY);
    if (!raw) return { version: 1, lanes: {}, seenRemoteIds: [], seededAt: null, deletedCustomerNames: [] };
    const parsed = JSON.parse(raw) as Partial<CustomerLanePersisted>;
    const lanes: Record<string, CustomerLane> = {};
    if (parsed.lanes && typeof parsed.lanes === "object") {
      for (const value of Object.values(parsed.lanes)) {
        const cleaned = cleanCustomerLane(value);
        if (cleaned) lanes[cleaned.id] = cleaned;
      }
    }
    const seen = Array.isArray(parsed.seenRemoteIds)
      ? parsed.seenRemoteIds.filter((id): id is string => typeof id === "string")
      : [];
    const deleted = Array.isArray(parsed.deletedCustomerNames)
      ? parsed.deletedCustomerNames
          .filter((name): name is string => typeof name === "string")
          .map((name) => normalizePlaceName(name))
          .filter(Boolean)
      : [];
    return {
      version: 1,
      lanes,
      seenRemoteIds: seen,
      seededAt: typeof parsed.seededAt === "string" ? parsed.seededAt : null,
      deletedCustomerNames: [...new Set(deleted)],
    };
  } catch {
    return { version: 1, lanes: {}, seenRemoteIds: [], seededAt: null, deletedCustomerNames: [] };
  }
}

export function writeCustomerLanePersisted(next: CustomerLanePersisted): void {
  try {
    localStorage.setItem(CUSTOMER_LANES_STORE_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

export function rowToCustomerLane(row: CustomerLaneRow): CustomerLane | null {
  return cleanCustomerLane({
    id: row.id,
    customer: row.customer,
    destination: row.destination ?? "",
    commodity: row.commodity ?? "Trash (MSW)",
    effectiveDate: row.effective_date?.slice(0, 10),
    tier1: row.tier1,
    tier2: row.tier2,
    tier3: row.tier3,
    tier4: row.tier4,
    tier5: row.tier5,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function customerLaneToRow(lane: CustomerLane, userId: string | null) {
  return {
    id: lane.id,
    customer: lane.customer,
    destination: lane.destination,
    commodity: lane.commodity,
    effective_date: lane.effectiveDate,
    tier1: lane.tier1,
    tier2: lane.tier2,
    tier3: lane.tier3,
    tier4: lane.tier4,
    tier5: lane.tier5,
    created_at: lane.createdAt,
    updated_at: lane.updatedAt,
    created_by: userId,
  };
}

export function upsertCustomerLane(
  store: CustomerLaneStore,
  input: CustomerLaneInput,
  at?: string,
): { store: CustomerLaneStore; lane: CustomerLane | null } {
  const customer = cleanPlaceName(input.customer);
  if (!customer) return { store, lane: null };
  if (!isValidISODate(input.effectiveDate)) return { store, lane: null };
  const stamp = nowIso(at);
  const destination = cleanPlaceName(input.destination ?? "");
  const commodity =
    cleanPlaceName(input.commodity) || "Trash (MSW)";
  let prev = input.id ? store.lanes[input.id] : undefined;
  // Adding with the same customer+dest+commodity+start as an existing row updates
  // that row instead of stacking a duplicate empty book (common "+ Lane" vs Edit).
  if (!prev) {
    prev = Object.values(store.lanes).find(
      (lane) =>
        placesMatch(lane.customer, customer) &&
        placesMatch(lane.destination, destination) &&
        commoditiesMatch(lane.commodity, commodity) &&
        lane.effectiveDate === input.effectiveDate,
    );
  }
  const lane: CustomerLane = {
    id: input.id ?? prev?.id ?? newId(),
    customer,
    destination: destination || prev?.destination || "",
    commodity: commodity || prev?.commodity || "Trash (MSW)",
    effectiveDate: input.effectiveDate,
    tier1: input.tier1 !== undefined ? parseMoney(input.tier1) : (prev?.tier1 ?? null),
    tier2: input.tier2 !== undefined ? parseMoney(input.tier2) : (prev?.tier2 ?? null),
    tier3: input.tier3 !== undefined ? parseMoney(input.tier3) : (prev?.tier3 ?? null),
    tier4: input.tier4 !== undefined ? parseMoney(input.tier4) : (prev?.tier4 ?? null),
    tier5: input.tier5 !== undefined ? parseMoney(input.tier5) : (prev?.tier5 ?? null),
    createdAt: prev?.createdAt ?? stamp,
    updatedAt: stamp,
  };
  return { store: { lanes: { ...store.lanes, [lane.id]: lane } }, lane };
}

export function removeCustomerLane(
  store: CustomerLaneStore,
  id: string,
): { store: CustomerLaneStore; removed: CustomerLane | null } {
  const removed = store.lanes[id] ?? null;
  if (!removed) return { store, removed: null };
  const lanes = { ...store.lanes };
  delete lanes[id];
  return { store: { lanes }, removed };
}

/** Remove every lane whose customer matches `customerName` (same normalization as customerNames / placesMatch). */
export function removeCustomerByName(
  store: CustomerLaneStore,
  customerName: string,
): { store: CustomerLaneStore; removedIds: string[] } {
  const name = cleanPlaceName(customerName);
  if (!name) return { store, removedIds: [] };
  const lanes = { ...store.lanes };
  const removedIds: string[] = [];
  for (const [id, lane] of Object.entries(lanes)) {
    if (!placesMatch(lane.customer, name)) continue;
    delete lanes[id];
    removedIds.push(id);
  }
  return { store: { lanes }, removedIds };
}



/** Walking-floor class or leachate (specialty board). Trash/MSW is never specialty. */
export function isSpecialtyBoardCommodity(commodity: string): boolean {
  const key = laneCommodityKey(commodity);
  return key === "leachate" || key === "walking-floor";
}

/** Customers with at least one real Walking-floor or Leachate lane. */
export function customersWithSpecialtyLanes(store: CustomerLaneStore): string[] {
  const names = new Set<string>();
  for (const lane of Object.values(store.lanes)) {
    if (isLaneStub(lane)) continue;
    if (!isSpecialtyBoardCommodity(lane.commodity)) continue;
    names.add(lane.customer);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "en"));
}

/** Destinations from that customer's WF / leachate lanes (newest contract first, unique). */
export function specialtyDestinationsForCustomer(
  store: CustomerLaneStore,
  customer: string,
): string[] {
  const rows = Object.values(store.lanes)
    .filter(
      (lane) =>
        !isLaneStub(lane) &&
        placesMatch(lane.customer, customer) &&
        isSpecialtyBoardCommodity(lane.commodity),
    )
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const lane of rows) {
    const dest = lane.destination.trim();
    const key = normalizePlaceName(dest);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(dest);
  }
  return out;
}

/** Customers that have at least one real lane (destination filled — not an add-customer stub). */
export function customersWithRealLanes(store: CustomerLaneStore): string[] {
  const names = new Set<string>();
  for (const lane of Object.values(store.lanes)) {
    if (isLaneStub(lane)) continue;
    names.add(lane.customer);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "en"));
}

export function customerNames(store: CustomerLaneStore): string[] {
  const names = new Set<string>();
  for (const lane of Object.values(store.lanes)) names.add(lane.customer);
  return [...names].sort((a, b) => a.localeCompare(b, "en"));
}

export function lanesForCustomer(store: CustomerLaneStore, customer: string): CustomerLane[] {
  return Object.values(store.lanes)
    .filter((lane) => placesMatch(lane.customer, customer))
    .sort((a, b) => {
      const dest = a.destination.localeCompare(b.destination, "en");
      if (dest) return dest;
      const com = a.commodity.localeCompare(b.commodity, "en");
      if (com) return com;
      return b.effectiveDate.localeCompare(a.effectiveDate);
    });
}

/** Latest contract period for this customer+dest+commodity that is in force on `date`. */
export function rateForLoad(
  store: CustomerLaneStore,
  pickup: string,
  destination: string,
  commodity: string,
  date: string,
): CustomerLane | null {
  if (!isValidISODate(date)) return null;
  let best: CustomerLane | null = null;
  for (const lane of Object.values(store.lanes)) {
    if (isLaneStub(lane)) continue;
    if (!laneHasRates(lane)) continue;
    if (lane.effectiveDate > date) continue;
    if (!placesMatch(lane.customer, pickup)) continue;
    if (!placesMatch(lane.destination, destination)) continue;
    if (!commoditiesMatch(lane.commodity, commodity)) continue;
    if (!best || lane.effectiveDate > best.effectiveDate) best = lane;
  }
  return best;
}

export function mergeSeededLanes(
  store: CustomerLaneStore,
  at?: string,
  deletedCustomerNames?: Iterable<string>,
): CustomerLaneStore {
  const deleted = new Set(
    [...(deletedCustomerNames ?? [])]
      .map((name) => normalizePlaceName(name))
      .filter(Boolean),
  );
  const seeded = lanesFromSeed(at);
  const lanes = { ...store.lanes };
  for (const row of seeded) {
    if (deleted.has(normalizePlaceName(row.customer))) continue;
    if (!lanes[row.id]) lanes[row.id] = row;
  }
  return { lanes };
}

export function currentLanesByCustomer(store: CustomerLaneStore, asOf: string): CustomerLane[] {
  const best = new Map<string, CustomerLane>();
  for (const lane of Object.values(store.lanes)) {
    if (lane.effectiveDate > asOf) continue;
    const key = `${normalizePlaceName(lane.customer)}|${normalizePlaceName(lane.destination)}|${laneCommodityKey(lane.commodity)}`;
    const prev = best.get(key);
    if (!prev || lane.effectiveDate > prev.effectiveDate) best.set(key, lane);
  }
  return [...best.values()].sort((a, b) => {
    const c = a.customer.localeCompare(b.customer, "en");
    if (c) return c;
    return a.destination.localeCompare(b.destination, "en");
  });
}

/** In-force non-stub commodities for a pickup customer (Customers lane book). */
export function commoditiesForCustomer(
  store: CustomerLaneStore,
  customer: string,
  asOf: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const lane of currentLanesByCustomer(store, asOf)) {
    if (isLaneStub(lane)) continue;
    if (!placesMatch(lane.customer, customer)) continue;
    const key = laneCommodityKey(lane.commodity);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(lane.commodity);
  }
  return out.sort((a, b) => a.localeCompare(b, "en"));
}

/** Delivery destinations for this customer + commodity from the lane book. */
export function destinationsForCustomer(
  store: CustomerLaneStore,
  customer: string,
  commodity: string,
  asOf: string,
): string[] {
  if (!commodity.trim()) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const lane of currentLanesByCustomer(store, asOf)) {
    if (isLaneStub(lane)) continue;
    if (!placesMatch(lane.customer, customer)) continue;
    if (!commoditiesMatch(lane.commodity, commodity)) continue;
    const dest = lane.destination.trim();
    const key = normalizePlaceName(dest);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(dest);
  }
  return out.sort((a, b) => a.localeCompare(b, "en"));
}

/** Keep commodity/dest valid for this pickup; pick first lane options when needed. */
export function cascadeCustomerLaneRoute(
  store: CustomerLaneStore,
  customer: string,
  commodity: string,
  destination: string,
  asOf: string,
): { commodity: string; destination: string } {
  const commodities = commoditiesForCustomer(store, customer, asOf);
  if (!commodities.length) return { commodity: "", destination: "" };
  const nextCommodity = commodities.some((c) => commoditiesMatch(c, commodity))
    ? commodities.find((c) => commoditiesMatch(c, commodity)) ?? commodities[0]
    : commodities[0];
  const destinations = destinationsForCustomer(store, customer, nextCommodity, asOf);
  if (!destinations.length) return { commodity: nextCommodity, destination: "" };
  const nextDest = destinations.some((d) => placesMatch(d, destination))
    ? destinations.find((d) => placesMatch(d, destination)) ?? destinations[0]
    : destinations[0];
  return { commodity: nextCommodity, destination: nextDest };
}

