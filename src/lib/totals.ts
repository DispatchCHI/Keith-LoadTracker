import { CUSTOM_ID, getStation, resolveStationId } from "../data/stations";
import { normalizePlaceName } from "./customerLanes";
import { commodityRankLabel, tallyLabel } from "./commodity";
import {
  STATION_CALL_YARDS,
  stationCallYards,
  type StationCallYard,
  type StationDayBoard,
} from "./stationCalls";
import { isBrokerTruck } from "./truck";
import { sortLoadsNewestFirst } from "./sortLoads";
import type { Load } from "../types";

export type RankRow = {
  key: string;
  label: string;
  count: number;
  trashCount: number;
  custom?: boolean;
};

function sortRanks(rows: RankRow[]): RankRow[] {
  return [...rows].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

export function formatRankTrashTotal(
  row: Pick<RankRow, "count" | "trashCount">,
  opts?: { commodity?: boolean },
): string {
  if (opts?.commodity) return String(row.count);
  return `${row.trashCount} / ${row.count}`;
}

/**
 * Trash-only site: at least one load, and every load counts as trash.
 * The Transfer station table paints MSW and total with the light-blue highlight
 * when this is true.
 */
export function isTrashOnlyRank(row: Pick<RankRow, "count" | "trashCount">): boolean {
  return row.count > 0 && row.trashCount === row.count;
}

function bumpRank(
  map: Map<string, RankRow>,
  key: string,
  label: string,
  load: Load,
  extra?: { custom?: boolean },
): void {
  const trash = isTrashLoad(load) ? 1 : 0;
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
    existing.trashCount += trash;
    if (extra?.custom) existing.custom = true;
    return;
  }
  map.set(key, {
    key,
    label,
    count: 1,
    trashCount: trash,
    custom: extra?.custom,
  });
}

/**
 * Pickups saved with the Custom station id still count as known when the name
 * matches a built-in yard or a customer on the Customers page (case, spacing,
 * and punctuation ignored). Customers-page pickups that are not built-in yards
 * are stored with the custom id, so the id alone over-tags them.
 */
export function isKnownPickupName(
  pickup: string,
  knownPickups: Iterable<string> = [],
): boolean {
  const key = normalizePlaceName(pickup);
  if (!key) return false;
  if (resolveStationId(pickup) !== CUSTOM_ID) return true;
  for (const name of knownPickups) {
    if (normalizePlaceName(name) === key) return true;
  }
  return false;
}

export function rankPickups(
  loads: Load[],
  /** Customer names from the Customers page; matches are not tagged Custom. */
  knownPickups: Iterable<string> = [],
): RankRow[] {
  const known = [...knownPickups];
  const map = new Map<string, RankRow>();
  for (const load of loads) {
    const key = load.pickup.trim() || "—";
    bumpRank(map, key, key, load, {
      custom: load.stationId === CUSTOM_ID && !isKnownPickupName(key, known),
    });
  }
  return sortRanks([...map.values()]);
}

const CANONICAL_DESTINATION_NAMES: Readonly<Record<string, string>> = {
  dekalb: "DeKalb",
};

/** Case-insensitive grouping key; distinct destination spellings otherwise stay separate. */
function destinationKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US") || "—";
}

function destinationLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  return CANONICAL_DESTINATION_NAMES[destinationKey(trimmed)] ?? trimmed;
}

export function rankDestinations(loads: Load[]): RankRow[] {
  const map = new Map<string, RankRow>();
  for (const load of loads) {
    const groupKey = destinationKey(load.destination);
    const existing = map.get(groupKey);
    if (existing) {
      bumpRank(map, groupKey, existing.label, load);
      continue;
    }
    const label = destinationLabel(load.destination);
    bumpRank(map, groupKey, label, load);
    // Keep the public row key display-friendly while the map remains normalized.
    map.get(groupKey)!.key = label;
  }
  return sortRanks([...map.values()]);
}

export function rankCommodities(loads: Load[]): RankRow[] {
  const map = new Map<string, RankRow>();
  for (const load of loads) {
    const key = tallyLabel(load.commodity);
    if (!key) continue;
    const label =
      key === "TRASH" ? "Trash (MSW)" : commodityRankLabel(load.commodity);
    if (!label) continue;
    bumpRank(map, key, label, load);
  }
  return sortRanks([...map.values()]);
}

export type TotalsFilter =
  | { kind: "pickup"; key: string }
  | { kind: "destination"; key: string }
  | { kind: "commodity"; key: string };

export function filterLoads(loads: Load[], filter: TotalsFilter | null): Load[] {
  if (!filter) return loads;
  if (filter.kind === "pickup") {
    return loads.filter((load) => (load.pickup.trim() || "—") === filter.key);
  }
  if (filter.kind === "destination") {
    const key = destinationKey(filter.key);
    return loads.filter((load) => destinationKey(load.destination) === key);
  }
  return loads.filter((load) => tallyLabel(load.commodity) === filter.key);
}

export function rankAccordionLoads(
  loads: Load[],
  filter: TotalsFilter | null,
): Load[] {
  return sortLoadsNewestFirst(filterLoads(loads, filter));
}

export function filterCaption(filter: TotalsFilter): string {
  if (filter.kind === "pickup") return `Pickup · ${filter.key}`;
  if (filter.kind === "destination") return `Delivery · ${filter.key}`;
  return `Commodity · ${commodityRankLabel(filter.key)}`;
}

export function countBrokerLoads(loads: Load[]): number {
  return loads.filter((load) => isBrokerTruck(load.truck)).length;
}

function lettersKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

export function isVanDrunenPickup(load: Load): boolean {
  return [load.pickup, load.stationId].some((field) =>
    lettersKey(field).includes("vandrunen"),
  );
}

export function isGraysLakePickup(load: Load): boolean {
  return [load.pickup, load.stationId].some((field) =>
    lettersKey(field).includes("grayslake"),
  );
}

function isHodgkinsDest(load: Load): boolean {
  return lettersKey(load.destination).includes("hodgkin");
}

function hasRecycleToken(value: string): boolean {
  return (
    tallyLabel(value) === "RECYCLE" || lettersKey(value).includes("recycle")
  );
}

function isLeachateField(value: string): boolean {
  return tallyLabel(value) === "LEACHATE";
}

export function isGraysLakeRecycleLane(load: Load): boolean {
  if (!isGraysLakePickup(load)) return false;
  if (isLeachateField(load.commodity) || isLeachateField(load.destination)) {
    return false;
  }
  return (
    hasRecycleToken(load.commodity) ||
    hasRecycleToken(load.destination) ||
    isHodgkinsDest(load)
  );
}

function isMswOrLeachate(load: Load): boolean {
  const key = tallyLabel(load.commodity);
  return key === "TRASH" || key === "LEACHATE";
}

export function isWalkingFloorLoad(load: Load): boolean {
  if (isVanDrunenPickup(load) || isGraysLakeRecycleLane(load)) return true;
  if (isMswOrLeachate(load)) return false;
  const fields = [load.commodity, load.destination, load.pickup];
  if (fields.some((field) => field.toLowerCase().includes("groot"))) return true;
  return Boolean(load.commodity.trim());
}

export function countWalkingFloorLoads(loads: Load[]): number {
  return loads.filter(isWalkingFloorLoad).length;
}

export function isTrashLoad(load: Load): boolean {
  return tallyLabel(load.commodity) === "TRASH" && !isWalkingFloorLoad(load);
}

/**
 * MSW numbers for a newest-first list. The oldest MSW row (bottom) is 1 and
 * the count climbs toward the top, so the newest MSW row's number equals the
 * header's msw count. Non-MSW rows are null. Uses isTrashLoad.
 */
export function mswRowNumbers(loads: readonly Load[]): Array<number | null> {
  const msw = loads.map((load) => isTrashLoad(load));
  const total = msw.reduce((sum, isMsw) => sum + (isMsw ? 1 : 0), 0);
  let seen = 0;
  return msw.map((isMsw) => {
    if (!isMsw) return null;
    seen += 1;
    return total - seen + 1;
  });
}

export function countTrashLoads(loads: Load[]): number {
  return loads.filter(isTrashLoad).length;
}

export function countSheetTotalLoads(loads: Load[]): number {
  return (
    countTrashLoads(loads) +
    countByTallyLabel(loads, "LEACHATE") +
    countWalkingFloorLoads(loads)
  );
}

export type DaySummaryCard = {
  key: string;
  label: string;
  count: number;
  emphasis?: boolean;
};

export function countByTallyLabel(loads: Load[], label: string): number {
  return loads.filter((load) => tallyLabel(load.commodity) === label).length;
}

export function daySummaryCards(loads: Load[]): DaySummaryCard[] {
  return [
    { key: "trash", label: "TRASH", count: countTrashLoads(loads) },
    {
      key: "leachate",
      label: "LEACHATE",
      count: countByTallyLabel(loads, "LEACHATE"),
    },
    {
      key: "loads",
      label: "LOADS",
      count: countSheetTotalLoads(loads),
      emphasis: true,
    },
    { key: "subs", label: "SUBS", count: countBrokerLoads(loads) },
    {
      key: "walking-floor",
      label: "WALKING-FLOOR",
      count: countWalkingFloorLoads(loads),
    },
  ];
}

const CALL_YARD_STATION_ID: Record<string, string> = {
  "c-heights": "chicago-heights",
  hooker: "hooker-street",
};

function normKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ");
}

export function callYardStationId(yardId: string): string {
  return CALL_YARD_STATION_ID[yardId] ?? yardId;
}

export function callYardMatchKeys(yard: { id: string; label: string }): Set<string> {
  const keys = new Set<string>();
  const add = (value: string | undefined) => {
    if (!value) return;
    const key = normKey(value);
    if (key) keys.add(key);
  };
  add(yard.id);
  add(yard.label);
  const stationId = callYardStationId(yard.id);
  add(stationId);
  add(getStation(stationId)?.name);
  return keys;
}

export function loadMatchesCallYard(
  load: Load,
  yard: { id: string; label: string },
): boolean {
  const keys = callYardMatchKeys(yard);
  if (load.stationId && load.stationId !== CUSTOM_ID) {
    if (keys.has(normKey(load.stationId))) return true;
    const named = getStation(load.stationId);
    if (named && keys.has(normKey(named.name))) return true;
  }
  return keys.has(normKey(load.pickup));
}

/** True for the rows built into the Load Count grid (not ones added with + Add Row). */
export function isBuiltInCallYard(yardId: string): boolean {
  return STATION_CALL_YARDS.some((yard) => yard.id === yardId);
}

/** Case, punctuation, spacing, and "Street" insensitive key: "C. Heights" and "cheights" agree. */
function looseKey(value: string): string {
  return normalizePlaceName(value).replace(/[^a-z0-9]/g, "");
}

function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.slice(i) === long.slice(i + 1);
}

/**
 * Forgiving name match for rows Keith adds himself: ignores case, spacing,
 * punctuation and "Street"; allows a longer name that starts with the row name
 * ("Groen" and "Groen Brothers"), a shared whole word, and one typo on names of
 * five or more letters. A destination like "Groot" is two edits from "Groen",
 * so it is not pulled in.
 */
export function looseNameMatch(a: string, b: string): boolean {
  const ka = looseKey(a);
  const kb = looseKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const shortest = Math.min(ka.length, kb.length);
  if (shortest >= 4 && (ka.startsWith(kb) || kb.startsWith(ka))) return true;
  if (shortest >= 5 && withinOneEdit(ka, kb)) return true;
  const words = (value: string) =>
    normalizePlaceName(value)
      .split(" ")
      .filter((word) => word.length >= 4);
  const wb = new Set(words(b));
  return words(a).some((word) => wb.has(word));
}

/** Customers (from the Customers page) that a Load Count row stands for. */
export function customersForCallYard(
  yard: { id: string; label: string },
  customerNames: readonly string[],
): string[] {
  return customerNames.filter(
    (name) => looseNameMatch(name, yard.label) || looseNameMatch(name, yard.id),
  );
}

/** Message for a new Load Count row that matches no customer. Null when it is linked. */
export function addedRowHint(
  yard: { id: string; label: string },
  customerNames: readonly string[],
): string | null {
  if (customersForCallYard(yard, customerNames).length > 0) return null;
  return `Added "${yard.label}", but no customer on the Customers page matches that name. Its Total counts loads whose pickup is spelled like it, and shows "no customer" until one exists. Add the customer (or use the same name) to link it.`;
}

/**
 * Loads dispatched from a row's pickup. Built-in rows keep the exact rules.
 * A row added by hand also takes loads whose pickup loosely matches its name
 * or any linked customer, so a new row tallies without a code change.
 */
export function loadMatchesAddedCallYard(
  load: Load,
  yard: { id: string; label: string },
  customerNames: readonly string[] = [],
): boolean {
  if (loadMatchesCallYard(load, yard)) return true;
  if (STATION_CALL_YARDS.some((builtIn) => loadMatchesCallYard(load, builtIn))) return false;
  const pickup = load.pickup.trim();
  if (!pickup) return false;
  if (looseNameMatch(pickup, yard.label)) return true;
  return customersForCallYard(yard, customerNames).some((name) => looseNameMatch(pickup, name));
}
export type StationEodRow = {
  id: string;
  label: string;
  pickedUp: number;
  msw: number;
  left: string | null;
  /** Set only on rows added with + Add Row. */
  added?: true;
  /** Customers-page names this row is linked to (added rows only). */
  customers?: string[];
  /** Added rows only: false when no customer matches and no loads came in, so show a hint, not a blank. */
  linked?: boolean;
};

export type EndOfDaySummary = {
  loads: number;
  subs: number;
  trash: number;
  leachate: number;
  walkingFloor: number;
  stations: StationEodRow[];
};

export type EndOfDayCard = {
  key: string;
  label: string;
  count: number;
  emphasis?: boolean;
};

export function endOfDayCards(summary: EndOfDaySummary): EndOfDayCard[] {
  return [
    { key: "trash", label: "TRASH", count: summary.trash },
    { key: "leachate", label: "LEACHATE", count: summary.leachate },
    { key: "walking-floor", label: "WALKING-FLOOR", count: summary.walkingFloor },
    { key: "loads", label: "LOADS", count: summary.loads, emphasis: true },
    { key: "subs", label: "SUBS", count: summary.subs },
  ];
}

export function endOfDaySummary(
  loads: Load[],
  board: StationDayBoard,
  opts: { yards?: readonly StationCallYard[]; customerNames?: readonly string[] } = {},
): EndOfDaySummary {
  const yards = opts.yards ?? stationCallYards();
  const customerNames = opts.customerNames ?? [];
  return {
    loads: countSheetTotalLoads(loads),
    subs: countBrokerLoads(loads),
    trash: countTrashLoads(loads),
    leachate: countByTallyLabel(loads, "LEACHATE"),
    walkingFloor: countWalkingFloorLoads(loads),
    stations: yards.map((yard) => {
      const added = !isBuiltInCallYard(yard.id);
      const yardLoads = added
        ? loads.filter((load) => loadMatchesAddedCallYard(load, yard, customerNames))
        : loads.filter((load) => loadMatchesCallYard(load, yard));
      const customers = added ? customersForCallYard(yard, customerNames) : [];
      const pickedUp = yardLoads.length;
      const msw = yardLoads.filter(isTrashLoad).length;
      const close = board[yard.id]?.close;
      return {
        id: yard.id,
        label: yard.label,
        pickedUp,
        msw,
        ...(added
          ? { added: true as const, customers, linked: customers.length > 0 || pickedUp > 0 }
          : {}),
        left:
          close === null || close === undefined || close === ""
            ? null
            : String(close),
      };
    }),
  };
}
