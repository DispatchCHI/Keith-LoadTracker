import { CUSTOM_ID, getStation } from "../data/stations";
import { commodityRankLabel, tallyLabel } from "./commodity";
import { STATION_CALL_YARDS, type StationDayBoard } from "./stationCalls";
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

export function rankPickups(loads: Load[]): RankRow[] {
  const map = new Map<string, RankRow>();
  for (const load of loads) {
    const key = load.pickup.trim() || "—";
    bumpRank(map, key, key, load, {
      custom: load.stationId === CUSTOM_ID,
    });
  }
  return sortRanks([...map.values()]);
}

export function rankDestinations(loads: Load[]): RankRow[] {
  const map = new Map<string, RankRow>();
  for (const load of loads) {
    const key = load.destination.trim() || "—";
    bumpRank(map, key, key, load);
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
    return loads.filter(
      (load) => (load.destination.trim() || "—") === filter.key,
    );
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

export type StationEodRow = {
  id: string;
  label: string;
  pickedUp: number;
  msw: number;
  left: string | null;
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
): EndOfDaySummary {
  return {
    loads: countSheetTotalLoads(loads),
    subs: countBrokerLoads(loads),
    trash: countTrashLoads(loads),
    leachate: countByTallyLabel(loads, "LEACHATE"),
    walkingFloor: countWalkingFloorLoads(loads),
    stations: STATION_CALL_YARDS.map((yard) => {
      const yardLoads = loads.filter((load) => loadMatchesCallYard(load, yard));
      const pickedUp = yardLoads.length;
      const msw = yardLoads.filter(isTrashLoad).length;
      const close = board[yard.id]?.close;
      return {
        id: yard.id,
        label: yard.label,
        pickedUp,
        msw,
        left:
          close === null || close === undefined || close === ""
            ? null
            : String(close),
      };
    }),
  };
}
