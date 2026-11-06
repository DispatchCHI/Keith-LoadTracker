import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { isCustomTypedPickup } from "../lib/customPickupInput";
import {
  CUSTOM,
  CUSTOM_ID,
  STATIONS,
  commoditiesFor,
  destinationsFor,
  getStation,
  resolveStationId,
} from "../data/stations";
import { pickupLabel } from "../lib/cascade";
import { chicagoToday } from "../lib/chicagoDate";
import {
  namedOddballIdsSnapshot,
  subscribeOddballPickups,
} from "../lib/specialtyOddDays";
import {
  CUSTOM_SPECIALTY_LOAD_TYPES,
  lookupCustomSpecialtyIdByName,
  readCustomSpecialtyNames,
} from "../lib/customSpecialty";
import {
  filterStationsByCustomerLanes,
  rankPickupChoices,
  unmatchedLaneCustomers,
} from "../lib/pickupRank";
import {
  customersWithRealLanes,
  laneDestinationsMatch,
  placesMatch,
} from "../lib/customerLanes";
import {
  commodityChipsForLogLoad,
  destinationAfterCommoditySelect,
  destinationChipsForLogLoad,
  routeForPickupSelect,
} from "../lib/logLoadRoute";
import { useCustomerLanes } from "../store/CustomerLanesContext";
import { useLoads } from "../store/LoadsContext";
import { parseTruckList } from "../lib/truck";
import { Chip } from "./Chip";
import { collapsePickupGrid, pickupChipStyle } from "../lib/pickupChipOrder";
import {
  dropIndexFromRects,
  getPickupChipLayoutSnapshot,
  layoutPickupGridWithOrder,
  movePickupChip,
  pickupColumnsHaveKeys,
  resetPickupChipLayout,
  samePickupColumns,
  savePickupChipLayout,
  subscribePickupChipLayout,
} from "../lib/pickupChipLayout";
import { stationOrderKey } from "../lib/transferStationOrder";
import type { PickupChoice } from "../lib/pickupRank";

function choiceName(choice: PickupChoice): string {
  return choice.kind === "station" ? choice.station.name : choice.name;
}

function pickupDropAt(
  x: number,
  y: number,
  collapsed: boolean,
  lengths: readonly number[],
): { drop: { col: number; index: number } | null; overMore: boolean } {
  const list =
    typeof document !== "undefined" && typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(x, y)
      : [];
  let overMore = false;
  let drop: { col: number; index: number } | null = null;
  for (const el of list) {
    if (!(el instanceof Element)) continue;
    if (el.closest("[data-pickup-more]")) overMore = true;
    if (drop) continue;
    const host = el.closest("[data-pickup-col]");
    if (!(host instanceof HTMLElement)) continue;
    const col = Number(host.dataset.pickupCol);
    if (!Number.isInteger(col)) continue;
    const chips = [...host.querySelectorAll<HTMLElement>("[data-pickup-index]")];
    drop = {
      col,
      index: dropIndexFromRects({
        columnLength: lengths[col] ?? 0,
        collapsed,
        pointerY: y,
        chips: chips.map((chip) => {
          const rect = chip.getBoundingClientRect();
          return { index: Number(chip.dataset.pickupIndex), top: rect.top, height: rect.height };
        }),
      }),
    };
  }
  return { drop, overMore };
}

const CUSTOM_SPECIALTY_COMMODITIES: Record<string, string> = {
  Leachate: "Leachate (tanker)",
  Trash: "Trash (MSW)",
  "C&D": "C&D",
  Recycle: "Recycle",
  Residual: "Residual",
  "Yard Waste": "Yard Waste",
  Wood: "Wood",
};

const WALKING_FLOOR_NAME = /walking[\s-]*floor/i;

function isWalkingFloorName(value: string): boolean {
  return WALKING_FLOOR_NAME.test(value);
}

function specialtyCommodityChips(loadTypes: readonly string[]): string[] {
  const seen = new Set<string>();
  const chips: string[] = [];
  for (const item of loadTypes) {
    if (isWalkingFloorName(item)) continue;
    const label = CUSTOM_SPECIALTY_COMMODITIES[item] ?? item;
    if (seen.has(label)) continue;
    seen.add(label);
    chips.push(label);
  }
  if (!chips.includes("C&D")) chips.push("C&D");
  return chips;
}

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const name = value.trim();
    if (!name || isWalkingFloorName(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

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
  /** Truck sits in the header, so the form skips that box and the lane note. */
  hideTruck?: boolean;
  /** Chicago day being logged. Odd-ball pickups only appear if that card was added this day. */
  logDate?: string;
};

export function LoadForm({
  value,
  onChange,
  original,
  onChangeTruck,
  driverName,
  hideTruck = false,
  logDate,
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
  const rankedPickups = useMemo(
    () => rankPickupChoices(laneStations, extraLaneCustomers, loads),
    [laneStations, extraLaneCustomers, loads],
  );
  const pickupName0 = (c: (typeof rankedPickups)[number]) =>
    c.kind === "station" ? c.station.name : c.name;
  const pickupLayout = useSyncExternalStore(
    subscribePickupChipLayout,
    getPickupChipLayoutSnapshot,
    getPickupChipLayoutSnapshot,
  );
  const gridCols = useMemo(
    () => layoutPickupGridWithOrder(rankedPickups, pickupName0, pickupLayout),
    [pickupLayout, rankedPickups],
  );
  const collapsedCols = useMemo(() => collapsePickupGrid(gridCols), [gridCols]);
  const shownCount = collapsedCols.reduce((n, col) => n + col.length, 0);
  const totalCount = gridCols.reduce((n, col) => n + col.length, 0);
  const restCount = totalCount - shownCount;
  const [showAllStations, setShowAllStations] = useState(() => {
    const collapsed = collapsedCols.flat();
    if (!value.stationId || value.stationId === CUSTOM_ID) {
      if (!value.pickup.trim()) return false;
      return !collapsed.some(
        (choice) =>
          choice.kind === "lane" &&
          choice.name.toLowerCase() === value.pickup.trim().toLowerCase(),
      );
    }
    return !collapsed.some(
      (choice) => choice.kind === "station" && choice.station.id === value.stationId,
    );
  });
  const gridShown = showAllStations || restCount === 0 ? gridCols : collapsedCols;
  const pickupCollapsed = !showAllStations && restCount > 0;
  const customPickupOrder = pickupColumnsHaveKeys(pickupLayout);
  const [pickupDrag, setPickupDrag] = useState<{
    col: number;
    index: number;
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const [pickupDrop, setPickupDrop] = useState<{ col: number; index: number } | null>(null);
  const pickupGridRef = useRef(gridCols);
  pickupGridRef.current = gridCols;
  const pickupCollapsedRef = useRef(pickupCollapsed);
  pickupCollapsedRef.current = pickupCollapsed;
  const suppressPickupClick = useRef(false);
  const pickupDragCleanup = useRef<(() => void) | null>(null);
  const pickupExpandTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      pickupDragCleanup.current?.();
      if (pickupExpandTimer.current != null) window.clearTimeout(pickupExpandTimer.current);
      document.body.classList.remove("pickup-dragging");
    };
  }, []);

  const commitPickupMove = (
    fromCol: number,
    fromIndex: number,
    to: { col: number; index: number },
  ) => {
    const cols = pickupGridRef.current;
    const keys = cols.map((col) => col.map((choice) => stationOrderKey(choiceName(choice))));
    const next = movePickupChip(keys, { col: fromCol, index: fromIndex }, to);
    if (samePickupColumns(keys, next)) return;
    savePickupChipLayout(next);
  };

  const startPickupDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    col: number,
    index: number,
    label: string,
  ) => {
    if (event.button !== 0) return;
    pickupDragCleanup.current?.();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    const clearExpand = () => {
      if (pickupExpandTimer.current != null) {
        window.clearTimeout(pickupExpandTimer.current);
        pickupExpandTimer.current = null;
      }
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      pickupDragCleanup.current = null;
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging) {
        if (dx * dx + dy * dy < 64) return;
        dragging = true;
        suppressPickupClick.current = true;
        document.body.classList.add("pickup-dragging");
      }
      ev.preventDefault();
      const lengths = pickupGridRef.current.map((column) => column.length);
      const hit = pickupDropAt(ev.clientX, ev.clientY, pickupCollapsedRef.current, lengths);
      setPickupDrag({ col, index, label, x: ev.clientX, y: ev.clientY });
      setPickupDrop(hit.drop);
      if (hit.overMore && pickupCollapsedRef.current) {
        if (pickupExpandTimer.current == null) {
          pickupExpandTimer.current = window.setTimeout(() => {
            pickupExpandTimer.current = null;
            setShowAllStations(true);
          }, 180);
        }
      } else {
        clearExpand();
      }
    };
    const onUp = (ev: PointerEvent) => {
      stop();
      clearExpand();
      document.body.classList.remove("pickup-dragging");
      if (!dragging) {
        setPickupDrag(null);
        setPickupDrop(null);
        return;
      }
      ev.preventDefault();
      const lengths = pickupGridRef.current.map((column) => column.length);
      const hit = pickupDropAt(ev.clientX, ev.clientY, pickupCollapsedRef.current, lengths);
      if (hit.drop) commitPickupMove(col, index, hit.drop);
      setPickupDrag(null);
      setPickupDrop(null);
      window.setTimeout(() => {
        suppressPickupClick.current = false;
      }, 0);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    pickupDragCleanup.current = stop;
  };

  const customNames = readCustomSpecialtyNames();
  const boardDate = logDate || chicagoToday();
  const namedOddballs = useSyncExternalStore(
    subscribeOddballPickups,
    () => namedOddballIdsSnapshot(boardDate),
    () => namedOddballIdsSnapshot(boardDate),
  );
  const customPickupId = lookupCustomSpecialtyIdByName(value.pickup);
  const isCustom = value.stationId === CUSTOM_ID;
  // "Custom..." is the only choice that types a pickup. Programmed lane chips
  // (Customers-page lanes with no station entry, e.g. Crown Point) and odd-ball
  // chips also store stationId=CUSTOM_ID but must never show the text box.
  const customChipSelected = isCustomTypedPickup({
    isCustom,
    pickup: value.pickup,
    oddballNames: [
      ...(customPickupId ? [value.pickup] : []),
      ...namedOddballs.map((id) => customNames[id]),
    ],
    laneNames: extraLaneCustomers,
  });
  const [customTyping, setCustomTyping] = useState(false);
  const showCustomPickupInput = isCustom && (customTyping || customChipSelected);
  const today = chicagoToday();
  const pickupName = pickupLabel(value.stationId, value.pickup).trim();
  const laneBookPickup = useMemo(() => {
    if (!pickupName) return null;
    if (laneCustomers.some((name) => placesMatch(name, pickupName))) return pickupName;
    return null;
  }, [laneCustomers, pickupName]);
  const catalogStationId = resolveStationId(pickupName, value.stationId);
  const catalogCommodities = useMemo(
    () =>
      commoditiesFor(catalogStationId === CUSTOM_ID ? undefined : catalogStationId),
    [catalogStationId],
  );
  const commodities = useMemo(() => {
    if (!pickupName) return [];
    return uniqueNames(
      commodityChipsForLogLoad({
        laneBookPickup,
        store: customerLanes,
        asOf: today,
        catalogCommodities,
      }),
    );
  }, [catalogCommodities, customerLanes, laneBookPickup, pickupName, today]);
  const destinations = useMemo(() => {
    if (!value.commodity.trim()) return [];
    const catalog = destinationsFor(
      catalogStationId === CUSTOM_ID ? value.stationId : catalogStationId,
      value.commodity,
    );
    return uniqueNames(
      destinationChipsForLogLoad({
        laneBookPickup,
        commodity: value.commodity,
        store: customerLanes,
        asOf: today,
        catalogDestinations: catalog,
      }),
    );
  }, [
    catalogStationId,
    customerLanes,
    laneBookPickup,
    today,
    value.commodity,
    value.stationId,
  ]);
  const cascadeNote = useMemo(() => {
    if (!laneBookPickup) return null;
    return `${laneBookPickup} commodity and destination come from Customers lanes.`;
  }, [laneBookPickup]);
  const selectStation = (stationId: string) => {
    if (stationId !== CUSTOM_ID) setCustomTyping(false);
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
    const cascaded = routeForPickupSelect({
      stationId,
      pickupName: name,
      store: customerLanes,
      asOf: today,
      loads,
    });
    onChange({
      ...value,
      stationId,
      pickup: name || pickup,
      commodity: cascaded.commodity,
      destination: cascaded.destination,
    });
  };
  const selectLaneCustomer = (name: string) => {
    setCustomTyping(false);
    const stationId = resolveStationId(name, CUSTOM_ID);
    const cascaded = routeForPickupSelect({
      stationId,
      pickupName: name,
      store: customerLanes,
      asOf: today,
      loads,
    });
    onChange({
      ...value,
      stationId,
      pickup: name,
      commodity: cascaded.commodity,
      destination: cascaded.destination,
    });
  };
  const invalidCommodity =
    Boolean(original?.commodity) &&
    original!.commodity !== value.commodity &&
    original!.commodity !== "" &&
    !commodities.some((item) => item === original!.commodity) &&
    !isWalkingFloorName(original!.commodity);
  const invalidDestination =
    Boolean(original?.destination) &&
    original!.destination !== value.destination &&
    original!.destination !== "" &&
    !destinations.some((item) =>
      laneDestinationsMatch(item, original!.destination),
    );
  return (
    <div className="form-stack">
      {hideTruck ? null : (
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
      )}
      <section className="field">
        <div className="field-label pickup-label">
          <span>Pickup</span>
          {customPickupOrder ? (
            <button type="button" className="pickup-reset-order" onClick={() => resetPickupChipLayout()}>
              Reset order
            </button>
          ) : null}
        </div>
        <div className="chip-row">
          <div className="pickup-grid">
            {gridShown.map((col, colIndex) => (
              <div key={colIndex} className="pickup-col" data-pickup-col={colIndex}>
                {col.map((choice, index) => {
                  const label = choiceName(choice);
                  const selected =
                    choice.kind === "station"
                      ? value.stationId === choice.station.id
                      : isCustom && value.pickup.trim().toLowerCase() === choice.name.toLowerCase();
                  const dragging = pickupDrag?.col === colIndex && pickupDrag.index === index;
                  return (
                    <span key={choice.kind === "station" ? choice.station.id : `lane-${choice.name}`} className="pickup-chip-slot">
                      {pickupDrop?.col === colIndex && pickupDrop.index === index ? (
                        <span className="pickup-drop-line" />
                      ) : null}
                      <Chip
                        label={label}
                        tone={pickupChipStyle(label)}
                        selected={selected}
                        className={dragging ? "pickup-chip-dimmed" : ""}
                        attrs={{ "data-pickup-index": String(index) }}
                        onPointerDown={(event) => startPickupDrag(event, colIndex, index, label)}
                        onClick={() => {
                          if (suppressPickupClick.current) {
                            suppressPickupClick.current = false;
                            return;
                          }
                          if (choice.kind === "station") selectStation(choice.station.id);
                          else selectLaneCustomer(choice.name);
                        }}
                      />
                    </span>
                  );
                })}
                {pickupDrop?.col === colIndex && pickupDrop.index === col.length ? (
                  <span className="pickup-drop-line" />
                ) : null}
                <span className="pickup-col-tail" data-pickup-end={colIndex} />
              </div>
            ))}
          </div>
          {!showAllStations && restCount > 0 ? (
            <Chip
              label={`+ ${restCount} more`}
              muted
              attrs={{ "data-pickup-more": "1" }}
              onClick={() => setShowAllStations(true)}
            />
          ) : null}
          {pickupDrag && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="pickup-chip-ghost"
                  style={{ left: pickupDrag.x, top: pickupDrag.y, ...pickupChipStyle(pickupDrag.label) }}
                >
                  {pickupDrag.label}
                </div>,
                document.body,
              )
            : null}
          <Chip
            label="Custom..."
            selected={customChipSelected}
            onClick={() => {
              setCustomTyping(true);
              selectStation(CUSTOM_ID);
            }}
          />
          {namedOddballs.map((id) => (
            <Chip
              key={id}
              label={customNames[id]}
              selected={isCustom && customPickupId === id}
              onClick={() => {
                setCustomTyping(false);
                onChange({
                  ...value,
                  stationId: CUSTOM_ID,
                  pickup: customNames[id],
                });
              }}
            />
          ))}
        </div>
        {showCustomPickupInput ? (
          <input
            className="text-input"
            placeholder="Odd-ball pickup name (matches a specialty bubble)"
            value={value.pickup}
            onChange={(e) => onChange({ ...value, pickup: e.target.value })}
            autoComplete="off"
          />
        ) : hideTruck ? null : cascadeNote ? (
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
              {specialtyCommodityChips([
                ...CUSTOM_SPECIALTY_LOAD_TYPES,
                ...CUSTOM.exampleCommodities,
                ...catalogCommodities,
              ]).map((item) => (
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
              placeholder="Commodity (Trash, C&D, Recycle, Leachate…)"
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
                selected={value.commodity === item}
                muted={!pickupName}
                onClick={() => {
                  if (!pickupName) return;
                  const destination = destinationAfterCommoditySelect({
                    stationId: value.stationId,
                    pickupName,
                    commodity: item,
                    currentDestination: value.destination,
                    store: customerLanes,
                    asOf: today,
                    laneBookPickup,
                  });
                  onChange({
                    ...value,
                    commodity: item,
                    destination,
                  });
                }}
              />
            ))}
            {!pickupName ? (
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
                selected={laneDestinationsMatch(value.destination, item)}
                muted={!pickupName || !value.commodity.trim()}
                onClick={() =>
                  pickupName &&
                  value.commodity.trim() &&
                  onChange({ ...value, destination: item })
                }
              />
            ))}
            {pickupName && value.commodity.trim() && destinations.length === 0 ? (
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
    parseTruckList(value.truck).trucks.length > 0 &&
      value.stationId &&
      pickupLabel(value.stationId, value.pickup) &&
      value.commodity.trim() &&
      value.destination.trim() &&
      value.destination !== "Other..." &&
      !isWalkingFloorName(value.commodity),
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
