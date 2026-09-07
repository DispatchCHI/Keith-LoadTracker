import { CUSTOM_ID } from "../data/stations";
import { commodityRankLabel, tallyLabel } from "./commodity";
import type { Load } from "../types";

export type RankRow = {
  key: string;
  label: string;
  count: number;
  custom?: boolean;
};

function sortRanks(rows: RankRow[]): RankRow[] {
  return [...rows].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

export function rankPickups(loads: Load[]): RankRow[] {
  const map = new Map<string, RankRow>();
  for (const load of loads) {
    const key = load.pickup.trim() || "—";
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.custom = existing.custom || load.stationId === CUSTOM_ID;
    } else {
      map.set(key, {
        key,
        label: key,
        count: 1,
        custom: load.stationId === CUSTOM_ID,
      });
    }
  }
  return sortRanks([...map.values()]);
}

export function rankDestinations(loads: Load[]): RankRow[] {
  const map = new Map<string, RankRow>();
  for (const load of loads) {
    const key = load.destination.trim() || "—";
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { key, label: key, count: 1 });
  }
  return sortRanks([...map.values()]);
}

export function rankCommodities(loads: Load[]): RankRow[] {
  const map = new Map<string, RankRow>();
  for (const load of loads) {
    const key = tallyLabel(load.commodity);
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else {
      map.set(key, {
        key,
        label: commodityRankLabel(load.commodity),
        count: 1,
      });
    }
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

export function filterCaption(filter: TotalsFilter): string {
  if (filter.kind === "pickup") return `Pickup · ${filter.key}`;
  if (filter.kind === "destination") return `Delivery · ${filter.key}`;
  return `Commodity · ${commodityRankLabel(filter.key)}`;
}
