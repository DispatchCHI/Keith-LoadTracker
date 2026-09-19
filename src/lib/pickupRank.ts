import {
  CUSTOM_ID,
  FREQUENT_STATION_IDS,
  STATION_BY_NAME,
  getStation,
  type Station,
} from "../data/stations";
import { normalizePlaceName, placesMatch } from "./customerLanes";
import { chicagoToday } from "./chicagoDate";

export type PickupCountLoad = {
  stationId: string;
  pickup: string;
};

function catalogStationId(load: PickupCountLoad): string | null {
  if (load.stationId && load.stationId !== CUSTOM_ID) {
    const byId = getStation(load.stationId);
    if (byId) return byId.id;
  }
  const byName = STATION_BY_NAME[load.pickup.trim().toLowerCase()];
  return byName?.id ?? null;
}

/** How often each catalog station appears in logged loads (unmatched custom sites skipped). */
export function countPickupsByStationId(
  loads: PickupCountLoad[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const load of loads) {
    const id = catalogStationId(load);
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Catalog stations, most-logged first. Ties: frequent-chip set, then catalog order.
 * Does not drop stations — callers split visible vs “+ N more”.
 */
export function rankPickupStations(
  stations: readonly Station[],
  loads: PickupCountLoad[],
  frequentIds: readonly string[] = FREQUENT_STATION_IDS,
): Station[] {
  const counts = countPickupsByStationId(loads);
  const frequent = new Set(frequentIds);
  const catalogIndex = new Map(stations.map((station, index) => [station.id, index]));
  return [...stations].sort((a, b) => {
    const byCount = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
    if (byCount !== 0) return byCount;
    const byFrequent = Number(frequent.has(b.id)) - Number(frequent.has(a.id));
    if (byFrequent !== 0) return byFrequent;
    return (catalogIndex.get(a.id) ?? 0) - (catalogIndex.get(b.id) ?? 0);
  });
}

/** Keep catalog stations whose name matches a customer with real lanes. */
export function filterStationsByCustomerLanes(
  stations: readonly Station[],
  customerNames: readonly string[],
): Station[] {
  if (!customerNames.length) return [];
  return stations.filter((station) =>
    customerNames.some((name) => placesMatch(station.name, name)),
  );
}

/** Lane-book customers that do not match any catalog station (shown as custom chips). */
export function unmatchedLaneCustomers(
  customerNames: readonly string[],
  stations: readonly Station[],
): string[] {
  return customerNames.filter(
    (name) => !stations.some((station) => placesMatch(station.name, name)),
  );
}


export type PickupChoice =
  | { kind: "station"; station: Station }
  | { kind: "lane"; name: string };

export type DatedPickupLoad = PickupCountLoad & { date?: string };

/** Count logged pickups by normalized place name (catalog + custom lane names). */
export function countPickupsByPlaceName(
  loads: readonly DatedPickupLoad[],
  opts?: { recentDays?: number; asOf?: string },
): Map<string, number> {
  const recentDays = opts?.recentDays ?? 45;
  const asOf = opts?.asOf ?? chicagoToday();
  const cutoff = (() => {
    const d = new Date(`${asOf}T12:00:00`);
    d.setDate(d.getDate() - recentDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();
  const counts = new Map<string, number>();
  for (const load of loads) {
    const label =
      (load.stationId && load.stationId !== CUSTOM_ID
        ? getStation(load.stationId)?.name
        : null) ?? load.pickup;
    const key = normalizePlaceName(label);
    if (!key) continue;
    const weight =
      !load.date || load.date >= cutoff ? 3 : load.date >= asOf.slice(0, 4) + "-01-01" ? 1 : 0;
    if (!weight) continue;
    counts.set(key, (counts.get(key) ?? 0) + weight);
  }
  return counts;
}

/**
 * Station + unmatched lane-customer chips, most-used first.
 * Recent hauls weigh more so the top row matches what dispatch is running now.
 */
export function rankPickupChoices(
  stations: readonly Station[],
  laneCustomerNames: readonly string[],
  loads: readonly DatedPickupLoad[],
  opts?: { recentDays?: number; asOf?: string },
): PickupChoice[] {
  const counts = countPickupsByPlaceName(loads, opts);
  const score = (name: string) => counts.get(normalizePlaceName(name)) ?? 0;
  const stationChoices: PickupChoice[] = stations.map((station) => ({
    kind: "station",
    station,
  }));
  const stationNameKeys = new Set(
    stations.map((station) => normalizePlaceName(station.name)),
  );
  const laneChoices: PickupChoice[] = laneCustomerNames
    .filter((name) => !stationNameKeys.has(normalizePlaceName(name)))
    .map((name) => ({ kind: "lane", name }));
  const all = [...stationChoices, ...laneChoices];
  return all.sort((a, b) => {
    const nameA = a.kind === "station" ? a.station.name : a.name;
    const nameB = b.kind === "station" ? b.station.name : b.name;
    const byScore = score(nameB) - score(nameA);
    if (byScore !== 0) return byScore;
    return nameA.localeCompare(nameB, "en");
  });
}
