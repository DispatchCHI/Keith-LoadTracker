import { useMemo, useState } from "react";
import {
  CUSTOM,
  CUSTOM_ID,
  FREQUENT_STATION_IDS,
  STATIONS,
  getStation,
  sameDestination,
} from "../data/stations";
import { pickupLabel } from "../lib/cascade";
import { chicagoToday } from "../lib/chicagoDate";
import {
  CUSTOM_SPECIALTY_IDS,
  CUSTOM_SPECIALTY_LOAD_TYPES,
  lookupCustomSpecialtyIdByName,
  readCustomSpecialtyNames,
} from "../lib/customSpecialty";
import {
  filterStationsByCustomerLanes,
  rankPickupStations,
  unmatchedLaneCustomers,
} from "../lib/pickupRank";
import {
  cascadeCustomerLaneRoute,
  commoditiesForCustomer,
  commoditiesMatch,
  customersWithRealLanes,
  destinationsForCustomer,
  placesMatch,
} from "../lib/customerLanes";
import { useCustomerLanes } from "../store/CustomerLanesContext";
import { useLoads } from "../store/LoadsContext";
import { Chip } from "./Chip";

const CUSTOM_SPECIALTY_COMMODITIES: Record<string, string> = {
  Leachate: "Leachate (tanker)",
  "Walking-floor": "Walking-floor",
  Trash: "Trash (MSW)",
};

export type FormState = {
  truck: string;
  stationId: string;
  pickup: string;
  commodity: string;
  destination: string;
};

type LoadFormProps = {
  value: FormState;
  onChange: (next: FormState) => void;
  original?: FormState;
  onChangeTruck: () => void;
  driverName?: string | null;
};

export function LoadForm({
  value,
  onChange,
  original,
  onChangeTruck,
  driverName,
}: LoadFormProps) {
  const { loads } = useLoads();
  const { store: customerLanes } = useCustomerLanes();
  const laneCustomers = useMemo(
    () => customersWithRealLanes(customerLanes),
    [customerLanes],
  );
  const laneStations = useMemo(
    () => filterStationsByCustomerLanes(STATIONS, laneCustomers),
    [laneCustomers],
  );
  const extraLaneCustomers = useMemo(
    () => unmatchedLaneCustomers(laneCustomers, STATIONS),
    [laneCustomers],
  );
  const rankedStations = useMemo(
    () => rankPickupStations(laneStations, loads),
    [laneStations, loads],
  );
  const visibleCount = Math.min(FREQUENT_STATION_IDS.length, rankedStations.length);
  const rest = rankedStations.slice(visibleCount);
  const [showAllStations, setShowAllStations] = useState(() => {
    if (!value.stationId || value.stationId === CUSTOM_ID) return false;
    return !rankedStations
      .slice(0, visibleCount)
      .some((station) => station.id === value.stationId);
  });

  const visibleStations = showAllStations
    ? rankedStations
    : rankedStations.slice(0, visibleCount);

  const customNames = readCustomSpecialtyNames();
  const customPickupId = lookupCustomSpecialtyIdByName(value.pickup);
  const isCustom = value.stationId === CUSTOM_ID;
  const today = chicagoToday();
  const pickupName = pickupLabel(value.stationId, value.pickup).trim();
  const laneBookPickup = useMemo(() => {
    if (!pickupName) return null;
    if (laneCustomers.some((name) => placesMatch(name, pickupName))) return pickupName;
    return null;
  }, [laneCustomers, pickupName]);

  const commodities = useMemo(() => {
    if (laneBookPickup) {
      return commoditiesForCustomer(customerLanes, laneBookPickup, today);
    }
    if (isCustom) return [];
    return [];
  }, [customerLanes, isCustom, laneBookPickup, today]);

  const destinations = useMemo(() => {
    if (laneBookPickup && value.commodity.trim()) {
      return destinationsForCustomer(
        customerLanes,
        laneBookPickup,
        value.commodity,
        today,
      );
    }
    return [];
  }, [customerLanes, laneBookPickup, today, value.commodity]);

  const cascadeNote = useMemo(() => {
    if (!laneBookPickup) return null;
    return `${laneBookPickup} commodity and destination come from Customers lanes.`;
  }, [laneBookPickup]);

  const selectStation = (stationId: string) => {
    const pickup =
      stationId === CUSTOM_ID
        ? value.stationId === CUSTOM_ID
          ? value.pickup
          : ""
        : (getStation(stationId)?.name ?? "");
    if (stationId === CUSTOM_ID && !pickup.trim()) {
      onChange({
        ...value,
        stationId,
        pickup: "",
        commodity: "",
        destination: "",
      });
      return;
    }
    const name = stationId === CUSTOM_ID ? pickup.trim() : pickup;
    if (name && laneCustomers.some((n) => placesMatch(n, name))) {
      const cascaded = cascadeCustomerLaneRoute(
        customerLanes,
        name,
        value.commodity,
        value.destination,
        today,
      );
      onChange({
        ...value,
        stationId,
        pickup: name,
        commodity: cascaded.commodity,
        destination: cascaded.destination,
      });
      return;
    }
    onChange({
      ...value,
      stationId,
      pickup,
      commodity: "",
      destination: "",
    });
  };

  const selectLaneCustomer = (name: string) => {
    const cascaded = cascadeCustomerLaneRoute(
      customerLanes,
      name,
      value.commodity,
      value.destination,
      today,
    );
    onChange({
      ...value,
      stationId: CUSTOM_ID,
      pickup: name,
      commodity: cascaded.commodity,
      destination: cascaded.destination,
    });
  };

  const invalidCommodity =
    Boolean(original?.commodity) &&
    original!.commodity !== value.commodity &&
    Boolean(laneBookPickup) &&
    original!.commodity !== "" &&
    !commodities.some((item) => commoditiesMatch(item, original!.commodity));

  const invalidDestination =
    Boolean(original?.destination) &&
    original!.destination !== value.destination &&
    Boolean(laneBookPickup) &&
    original!.destination !== "" &&
    !destinations.some(
      (item) =>
        placesMatch(item, original!.destination) ||
        sameDestination(item, original!.destination),
    );

  return (
    <div className="form-stack">
      <section className="field">
        <div className="field-label">Truck #</div>
        <div className="truck-field">
          <div className="truck-value">
            {value.truck || "—"}
            {driverName ? (
              <span className="truck-driver-inline"> · {driverName}</span>
            ) : null}
          </div>
          <button type="button" className="text-btn amber" onClick={onChangeTruck}>
            Change...
          </button>
        </div>
      </section>

      <section className="field">
        <div className="field-label">Pickup</div>
        <div className="chip-row">
          {visibleStations.map((station) => (
            <Chip
              key={station.id}
              label={station.name}
              selected={value.stationId === station.id}
              onClick={() => selectStation(station.id)}
            />
          ))}
          {extraLaneCustomers.map((name) => (
            <Chip
              key={`lane-${name}`}
              label={name}
              selected={isCustom && value.pickup.trim().toLowerCase() === name.toLowerCase()}
              onClick={() => selectLaneCustomer(name)}
            />
          ))}
          {!showAllStations && rest.length > 0 ? (
            <Chip
              label={`+ ${rest.length} more`}
              muted
              onClick={() => setShowAllStations(true)}
            />
          ) : null}
          <Chip
            label="Custom..."
            selected={isCustom && !customPickupId && !extraLaneCustomers.some((n) => n.toLowerCase() === value.pickup.trim().toLowerCase())}
            onClick={() => selectStation(CUSTOM_ID)}
          />
          {CUSTOM_SPECIALTY_IDS.map((id) => (
            <Chip
              key={id}
              label={customNames[id]}
              selected={isCustom && customPickupId === id}
              onClick={() =>
                onChange({
                  ...value,
                  stationId: CUSTOM_ID,
                  pickup: customNames[id],
                })
              }
            />
          ))}
        </div>
        {isCustom ? (
          <input
            className="text-input"
            placeholder="Odd-ball pickup name (matches a specialty bubble)"
            value={value.pickup}
            onChange={(e) => onChange({ ...value, pickup: e.target.value })}
            autoComplete="off"
          />
        ) : cascadeNote ? (
          <p className="field-hint">{cascadeNote}</p>
        ) : (
          <p className="field-hint">
            Pick a Customers-board pickup (or Custom for odd-balls).
          </p>
        )}
      </section>

      <section className="field">
        <div className="field-label">Commodity</div>
        {isCustom && !laneBookPickup ? (
          <>
            <div className="chip-row">
              {(customPickupId
                ? CUSTOM_SPECIALTY_LOAD_TYPES.map(
                    (item) => CUSTOM_SPECIALTY_COMMODITIES[item] ?? item,
                  )
                : CUSTOM.exampleCommodities
              ).map((item) => (
                <Chip
                  key={item}
                  label={item}
                  selected={value.commodity === item}
                  onClick={() => onChange({ ...value, commodity: item })}
                />
              ))}
            </div>
            <input
              className="text-input"
              placeholder="Commodity (Leachate, Recycle, Trash…)"
              value={value.commodity}
              onChange={(e) => onChange({ ...value, commodity: e.target.value })}
              autoComplete="off"
            />
          </>
        ) : (
          <div className="chip-row">
            {invalidCommodity ? (
              <Chip label={original!.commodity} invalid />
            ) : null}
            {commodities.map((item) => (
              <Chip
                key={item}
                label={item}
                selected={commoditiesMatch(value.commodity, item)}
                muted={!laneBookPickup}
                onClick={() => {
                  if (!laneBookPickup) return;
                  const cascaded = cascadeCustomerLaneRoute(
                    customerLanes,
                    laneBookPickup,
                    item,
                    value.destination,
                    today,
                  );
                  onChange({
                    ...value,
                    commodity: item,
                    destination: cascaded.destination,
                  });
                }}
              />
            ))}
            {!laneBookPickup ? (
              <p className="field-hint">Select a pickup first.</p>
            ) : commodities.length === 0 ? (
              <p className="field-hint">No lanes for this customer yet — add them on Customers.</p>
            ) : null}
          </div>
        )}
      </section>

      <section className="field">
        <div className="field-label">Destination</div>
        {isCustom && !laneBookPickup ? (
          <>
            <div className="chip-row">
              {CUSTOM.exampleDestinations.map((item) => (
                <Chip
                  key={item}
                  label={item}
                  selected={value.destination === item}
                  onClick={() =>
                    onChange({
                      ...value,
                      destination: item === "Other..." ? "" : item,
                    })
                  }
                />
              ))}
            </div>
            <input
              className="text-input"
              placeholder="Destination (CID, Kankakee, Reworld...)"
              value={value.destination}
              onChange={(e) =>
                onChange({ ...value, destination: e.target.value })
              }
              autoComplete="off"
            />
          </>
        ) : (
          <div className="chip-row">
            {invalidDestination ? (
              <Chip label={original!.destination} invalid />
            ) : null}
            {destinations.map((item) => (
              <Chip
                key={item}
                label={item}
                selected={
                  placesMatch(value.destination, item) ||
                  sameDestination(value.destination, item)
                }
                muted={!laneBookPickup || !value.commodity.trim()}
                onClick={() =>
                  laneBookPickup &&
                  value.commodity.trim() &&
                  onChange({ ...value, destination: item })
                }
              />
            ))}
            {laneBookPickup && value.commodity.trim() && destinations.length === 0 ? (
              <p className="field-hint">No destinations for this commodity on Customers.</p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

export function formComplete(value: FormState): boolean {
  return Boolean(
    value.truck.trim() &&
      value.stationId &&
      pickupLabel(value.stationId, value.pickup) &&
      value.commodity.trim() &&
      value.destination.trim() &&
      value.destination !== "Other...",
  );
}

export function sameForm(a: FormState, b: FormState): boolean {
  return (
    a.truck === b.truck &&
    a.stationId === b.stationId &&
    a.pickup.trim() === b.pickup.trim() &&
    a.commodity.trim() === b.commodity.trim() &&
    a.destination.trim() === b.destination.trim()
  );
}

export function routeLine(value: FormState): string {
  const pickup = pickupLabel(value.stationId, value.pickup) || "—";
  const dest = value.destination.trim() || "—";
  const commodity = value.commodity.trim() || "—";
  return `${pickup} → ${dest} · ${commodity}`;
}
