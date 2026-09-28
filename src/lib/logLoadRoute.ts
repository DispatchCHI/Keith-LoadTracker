import {
  CUSTOM_ID,
  commoditiesFor,
  destinationsFor,
  resolveStationId,
} from "../data/stations";
import {
  cascadeCustomerLaneRoute,
  customersWithRealLanes,
  defaultCustomerLaneRoute,
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
    dests.some(
      (d) =>
        placesMatch(d, opts.currentDestination) ||
        d === opts.currentDestination,
    )
  ) {
    return opts.currentDestination.trim();
  }
  return dests[0] ?? "";
}
