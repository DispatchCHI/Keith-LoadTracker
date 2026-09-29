import {
  CUSTOM_ID,
  commoditiesFor,
  destinationsFor,
  resolveStationId,
} from "../data/stations";
import {
  cascadeCustomerLaneRoute,
  commoditiesForCustomer,
  customersWithRealLanes,
  defaultCustomerLaneRoute,
  destinationsForCustomer,
  laneDestinationsMatch,
  placesMatch,
  type CustomerLaneStore,
  type LaneRouteLoad,
} from "./customerLanes";

const WALKING_FLOOR_NAME = /walking[\s-]*floor/i;

function isWalkingFloorName(value: string): boolean {
  return WALKING_FLOOR_NAME.test(value);
}

/**
 * Catalog default for a transfer station: prefer Trash (MSW) + first dest.
 * Used when the Customers lane book is empty, stub-only, or corrupt.
 */
export function defaultStationCatalogRoute(stationId: string): {
  commodity: string;
  destination: string;
} {
  if (!stationId || stationId === CUSTOM_ID) {
    return { commodity: "", destination: "" };
  }
  const commodities = commoditiesFor(stationId).filter(
    (c) => c.trim() && !isWalkingFloorName(c),
  );
  if (!commodities.length) return { commodity: "", destination: "" };
  const trash = commodities.find((c) => /trash/i.test(c));
  const commodity = trash ?? commodities[0];
  const destinations = destinationsFor(stationId, commodity).filter(
    (d) => d.trim() && d !== "Other..." && !isWalkingFloorName(d),
  );
  return { commodity, destination: destinations[0] ?? "" };
}

/**
 * On pickup select: most-logged lane combo, else lane Trash default, else
 * station catalog Trash+dest. Guarantees a normal catalog station completes
 * the form without hunting chips (even with empty/corrupt lane book).
 */
export function routeForPickupSelect(opts: {
  stationId: string;
  pickupName: string;
  store: CustomerLaneStore;
  asOf: string;
  loads?: readonly LaneRouteLoad[];
}): { commodity: string; destination: string } {
  const name = opts.pickupName.trim();
  let commodity = "";
  let destination = "";

  const laneCustomers = customersWithRealLanes(opts.store);
  if (name && laneCustomers.some((n) => placesMatch(n, name))) {
    const fromHistory = defaultCustomerLaneRoute(
      opts.store,
      name,
      opts.asOf,
      opts.loads ?? [],
    );
    commodity = fromHistory.commodity.trim();
    destination = fromHistory.destination.trim();
    if (isWalkingFloorName(commodity)) {
      commodity = "";
      destination = "";
    }
  }

  const catalogId =
    opts.stationId && opts.stationId !== CUSTOM_ID
      ? opts.stationId
      : resolveStationId(name, opts.stationId);
  const catalog = defaultStationCatalogRoute(catalogId);

  if (!commodity) {
    commodity = catalog.commodity;
    destination = catalog.destination;
  } else if (!destination) {
    const dests = destinationsFor(catalogId, commodity).filter(
      (d) => d.trim() && d !== "Other..." && !isWalkingFloorName(d),
    );
    destination = dests[0] ?? catalog.destination;
  }

  if (isWalkingFloorName(commodity)) {
    return { commodity: "", destination: "" };
  }
  if (isWalkingFloorName(destination)) {
    destination = "";
  }
  return { commodity, destination };
}

/** After a commodity chip click: keep valid dest, else cascade lanes, else catalog. */
export function destinationAfterCommoditySelect(opts: {
  stationId: string;
  pickupName: string;
  commodity: string;
  currentDestination: string;
  store: CustomerLaneStore;
  asOf: string;
  laneBookPickup: string | null;
}): string {
  const commodity = opts.commodity.trim();
  if (!commodity || isWalkingFloorName(commodity)) return "";

  if (opts.laneBookPickup) {
    const cascaded = cascadeCustomerLaneRoute(
      opts.store,
      opts.laneBookPickup,
      commodity,
      opts.currentDestination,
      opts.asOf,
    );
    if (
      cascaded.destination.trim() &&
      !isWalkingFloorName(cascaded.destination)
    ) {
      return cascaded.destination;
    }
  }

  const catalogId =
    opts.stationId && opts.stationId !== CUSTOM_ID
      ? opts.stationId
      : resolveStationId(opts.pickupName, opts.stationId);
  const dests = destinationsFor(catalogId, commodity).filter(
    (d) => d.trim() && d !== "Other..." && !isWalkingFloorName(d),
  );
  if (
    opts.currentDestination.trim() &&
    dests.some((d) => laneDestinationsMatch(d, opts.currentDestination))
  ) {
    return opts.currentDestination.trim();
  }
  return dests[0] ?? "";
}

/** Commodity chips for Log Load. A Customers-board pickup uses its lanes only. */
export function commodityChipsForLogLoad(opts: {
  laneBookPickup: string | null;
  store: CustomerLaneStore;
  asOf: string;
  catalogCommodities: readonly string[];
}): string[] {
  if (opts.laneBookPickup) {
    return commoditiesForCustomer(opts.store, opts.laneBookPickup, opts.asOf).filter(
      (item) => item.trim() && !isWalkingFloorName(item),
    );
  }
  return opts.catalogCommodities.filter(
    (item) => item.trim() && !isWalkingFloorName(item),
  );
}

/**
 * Destination chips for the selected commodity.
 * Customers-board pickups list only lanes for that pickup+commodity.
 * Catalog destinations are the fallback when the pickup has no lane book.
 */
export function destinationChipsForLogLoad(opts: {
  laneBookPickup: string | null;
  commodity: string;
  store: CustomerLaneStore;
  asOf: string;
  catalogDestinations: readonly string[];
}): string[] {
  const commodity = opts.commodity.trim();
  if (!commodity || isWalkingFloorName(commodity)) return [];
  if (opts.laneBookPickup) {
    return destinationsForCustomer(
      opts.store,
      opts.laneBookPickup,
      commodity,
      opts.asOf,
    );
  }
  return opts.catalogDestinations.filter(
    (item) => item.trim() && item !== "Other..." && !isWalkingFloorName(item),
  );
}
