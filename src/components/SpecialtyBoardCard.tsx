import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { formatHeaderDate } from "../lib/chicagoDate";
import { MAX_LOAD_QTY } from "../lib/quantity";
import {
  CUSTOM_SPECIALTY_DEFAULT_NAMES,
  CUSTOM_SPECIALTY_LOAD_TYPES,
  SPECIALTY_CUSTOM_NAMES_EVENT,
  SPECIALTY_CUSTOM_NAMES_FLUSH_EVENT,
  customSpecialtyDisplayName,
  formatCustomSpecialtyChip,
  isCustomSpecialtyId,
  readCustomSpecialtyNameField,
  writeCustomSpecialtyName,
  type CustomSpecialtyId,
  type CustomSpecialtyLoadType,
} from "../lib/customSpecialty";
import {
  SPECIALTY_STATIONS,
  destSummary,
  slotsForStation,
  specialtyChipsFromCustomerLanes,
  specialtyDestHint,
  specialtyDestinationsFor,
  type SpecialtyDayBoard,
  type SpecialtyStation,
} from "../lib/specialtyBoard";
import { useCustomerLanes } from "../store/CustomerLanesContext";
import { useSpecialty } from "../store/SpecialtyContext";
import { Chip } from "./Chip";
import { QuantityStepper } from "./QuantityStepper";
import "./specialty-board.css";

export function SpecialtyBoardCard({ date }: { date: string }) {
  const { boardOn, addOpen, removeOpen, cloud } = useSpecialty();
  const { store: customerLanes } = useCustomerLanes();
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const board = useMemo(() => boardOn(date), [boardOn, date]);
  const totalOpen = board.length;
  const regularStations = useMemo(
    () => SPECIALTY_STATIONS.filter((station) => !isCustomSpecialtyId(station.id)),
    [],
  );
  const extraStations = useMemo(
    () => SPECIALTY_STATIONS.filter((station) => isCustomSpecialtyId(station.id)),
    [],
  );

  return (
    <article className={`specialty-card${open ? "" : " specialty-card-collapsed"}`}>
      <button
        type="button"
        className="specialty-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="specialty-toggle-copy">
          <span className="specialty-toggle-title">Specialty loads</span>
          <span className="specialty-toggle-meta">
            {totalOpen} open · walking-floor · leachate · {formatHeaderDate(date)}
            {cloud ? " · synced" : " · this device only"}
            {open ? "" : " · tap to expand"}
          </span>
        </span>
        <ChevronDown
          size={18}
          className={open ? "totals-chevron open" : "totals-chevron"}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="specialty-body">
          <p className="specialty-hint">
            Walking-floor + leachate tallies · + queues several chips · open loads stay until
            −, a chip tap, or dispatch
          </p>
          <ul className="specialty-list">
            {regularStations.map((station) => (
              <StationRow
                key={station.id}
                station={station}
                board={board}
                picking={addingFor === station.id}
                onTogglePicker={() =>
                  setAddingFor((prev) => (prev === station.id ? null : station.id))
                }
                onCancelPicker={() => setAddingFor(null)}
                onAdd={(dests) => {
                  void addOpen(date, station.id, dests);
                }}
                onRemove={() => void removeOpen(date, station.id)}
                onRemoveDest={(dest) => void removeOpen(date, station.id, dest)}
                laneDestinations={(() => {
                  const fromLanes = specialtyChipsFromCustomerLanes(
                    customerLanes,
                    station.name,
                    station.id,
                  );
                  return fromLanes.length
                    ? fromLanes
                    : [...specialtyDestinationsFor(station.id)];
                })()}
              />
            ))}
          </ul>
          <p className="specialty-extra-label">Extra names</p>
          <ul className="specialty-extra-list">
            {extraStations.map((station) => (
              <StationRow
                key={station.id}
                station={station}
                board={board}
                picking={addingFor === station.id}
                onTogglePicker={() =>
                  setAddingFor((prev) => (prev === station.id ? null : station.id))
                }
                onCancelPicker={() => setAddingFor(null)}
                onAdd={(dests) => {
                  void addOpen(date, station.id, dests);
                }}
                onRemove={() => void removeOpen(date, station.id)}
                onRemoveDest={(dest) => void removeOpen(date, station.id, dest)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function StationRow({
  station,
  board,
  picking,
  onTogglePicker,
  onCancelPicker,
  onAdd,
  onRemove,
  onRemoveDest,
  laneDestinations,
}: {
  station: SpecialtyStation;
  board: SpecialtyDayBoard;
  picking: boolean;
  onTogglePicker: () => void;
  onCancelPicker: () => void;
  onAdd: (destinations: readonly string[]) => void;
  onRemove: () => void;
  onRemoveDest: (dest: string) => void;
  laneDestinations?: string[];
}) {
  const slots = slotsForStation(board, station.id);
  const summary = destSummary(slots);
  const count = slots.length;
  const custom = isCustomSpecialtyId(station.id);
  const label = custom ? customSpecialtyDisplayName(station.id) : station.name;
  const destChips =
    laneDestinations && laneDestinations.length > 0
      ? laneDestinations
      : [...specialtyDestinationsFor(station.id)];

  return (
    <li
      className={[
        "specialty-row",
        custom ? "is-custom" : "",
        picking ? "is-picking" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={custom ? "specialty-row-main specialty-extra-main" : "specialty-row-main"}>
        {custom ? (
          <CustomSpecialtyNameInput id={station.id as CustomSpecialtyId} />
        ) : (
          <span className="specialty-station">{station.name}</span>
        )}
        {custom ? (
          <div className="specialty-extra-controls">
            <span className={`specialty-count${count ? " has-open" : ""}`}>{count}</span>
            <div className="specialty-stepper">
              <StepperButtons label={label} count={count} onRemove={onRemove} onAdd={onTogglePicker} />
            </div>
          </div>
        ) : (
          <>
            <span className={`specialty-count${count ? " has-open" : ""}`}>{count}</span>
            <div className="specialty-stepper">
              <StepperButtons label={label} count={count} onRemove={onRemove} onAdd={onTogglePicker} />
            </div>
          </>
        )}
      </div>

      {summary.length > 0 ? (
        <div className="specialty-dests">
          {summary.map((row) => (
            <button
              key={row.destination}
              type="button"
              className="specialty-dest-chip"
              title={`Remove one ${row.destination}`}
              onClick={() => onRemoveDest(row.destination)}
            >
              {row.destination}
              {row.count > 1 ? ` x${row.count}` : ""}
            </button>
          ))}
        </div>
      ) : null}

      {picking && custom ? (
        <CustomSpecialtyPicker
          stationId={station.id as CustomSpecialtyId}
          onCancel={onCancelPicker}
          onAdd={onAdd}
        />
      ) : picking ? (
        <SpecialtyDestQueue
          hint={specialtyDestHint(station.id)}
          destChips={destChips}
          onCancel={onCancelPicker}
          onAdd={onAdd}
        />
      ) : null}
    </li>
  );
}

function StepperButtons({
  label,
  count,
  onRemove,
  onAdd,
}: {
  label: string;
  count: number;
  onRemove: () => void;
  onAdd: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="specialty-btn"
        aria-label={`Remove specialty load at ${label}`}
        disabled={count === 0}
        onClick={onRemove}
      >
        <Minus size={16} strokeWidth={2.6} />
      </button>
      <button
        type="button"
        className="specialty-btn"
        aria-label={`Add specialty loads at ${label}`}
        onClick={onAdd}
      >
        <Plus size={16} strokeWidth={2.6} />
      </button>
    </>
  );
}

function CustomSpecialtyNameInput({ id }: { id: CustomSpecialtyId }) {
  const example = CUSTOM_SPECIALTY_DEFAULT_NAMES[id];
  const [value, setValue] = useState(() => readCustomSpecialtyNameField(id));
  const focusedRef = useState(false);

  useEffect(() => {
    const onRemote = () => {
      if (focusedRef[0]) return;
      setValue(readCustomSpecialtyNameField(id));
    };
    window.addEventListener(SPECIALTY_CUSTOM_NAMES_EVENT, onRemote);
    return () => window.removeEventListener(SPECIALTY_CUSTOM_NAMES_EVENT, onRemote);
  }, [id]);

  return (
    <input
      className="text-input specialty-name-input"
      value={value}
      placeholder={example}
      aria-label={`Pickup name for ${id}`}
      onFocus={(event) => {
        focusedRef[0] = true;
        if (value === example) event.currentTarget.select();
      }}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        writeCustomSpecialtyName(id, next);
      }}
      onBlur={() => {
        focusedRef[0] = false;
        const next = value.replace(/\s+/g, " ").trim();
        setValue(next);
        writeCustomSpecialtyName(id, next);
        window.dispatchEvent(new Event(SPECIALTY_CUSTOM_NAMES_FLUSH_EVENT));
      }}
    />
  );
}

function queueEntries(queued: readonly string[]): { dest: string; count: number }[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const dest of queued) {
    if (!counts.has(dest)) order.push(dest);
    counts.set(dest, (counts.get(dest) ?? 0) + 1);
  }
  return order.map((dest) => ({ dest, count: counts.get(dest) ?? 0 }));
}

function SpecialtyDestQueue({
  hint,
  destChips,
  onCancel,
  onAdd,
}: {
  hint: string;
  destChips: readonly string[];
  onCancel: () => void;
  onAdd: (destinations: readonly string[]) => void;
}) {
  const [queued, setQueued] = useState<string[]>([]);
  const entries = queueEntries(queued);
  const total = queued.length;

  function bump(dest: string) {
    setQueued((prev) => (prev.length >= MAX_LOAD_QTY ? prev : [...prev, dest]));
  }

  function drop(dest: string) {
    setQueued((prev) => {
      const idx = prev.lastIndexOf(dest);
      if (idx < 0) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }

  function commit() {
    if (!queued.length) return;
    onAdd(queued);
    setQueued([]);
  }

  const addLabel = total === 1 ? "Add 1 open" : `Add ${total} opens`;

  return (
    <div className="specialty-picker">
      <p className="field-hint tight">{hint}</p>
      <p className="field-hint tight">Tap a chip to queue it. Tap again for another.</p>
      <div className="chip-row">
        {destChips.map((dest) => {
          const count = entries.find((row) => row.dest === dest)?.count ?? 0;
          return (
            <Chip
              key={dest}
              label={count > 0 ? `${dest} x${count}` : dest}
              selected={count > 0}
              onClick={() => bump(dest)}
            />
          );
        })}
      </div>
      {entries.length > 0 ? (
        <>
          <p className="specialty-queue-label">Queued · tap to take one off</p>
          <div className="specialty-dests specialty-queue">
            {entries.map((row) => (
              <button
                key={row.dest}
                type="button"
                className="specialty-dest-chip"
                title={`Remove one queued ${row.dest}`}
                onClick={() => drop(row.dest)}
              >
                {row.dest}
                {row.count > 1 ? ` x${row.count}` : ""}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <div className="vac-add-actions specialty-picker-actions">
        <button
          type="button"
          className="text-btn amber specialty-add-open"
          disabled={total === 0}
          onClick={commit}
        >
          {total === 0 ? "Add opens" : addLabel}
        </button>
        <button type="button" className="text-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function CustomSpecialtyPicker({
  stationId,
  onCancel,
  onAdd,
}: {
  stationId: CustomSpecialtyId;
  onCancel: () => void;
  onAdd: (chips: readonly string[]) => void;
}) {
  const [loadType, setLoadType] = useState<CustomSpecialtyLoadType>("Recycle");
  const [dest, setDest] = useState("");
  const [qty, setQty] = useState(1);
  const addLabel = qty === 1 ? "Add 1 open" : `Add ${qty} opens`;
  return (
    <form
      className="specialty-picker specialty-extra-picker"
      onSubmit={(event) => {
        event.preventDefault();
        const chip = formatCustomSpecialtyChip(loadType, dest);
        onAdd(Array.from({ length: qty }, () => chip));
        setDest("");
        setQty(1);
      }}
    >
      <p className="field-hint tight">{specialtyDestHint(stationId)}</p>
      <div className="specialty-type-row">
        {CUSTOM_SPECIALTY_LOAD_TYPES.map((item) => (
          <button
            key={item}
            type="button"
            className={`specialty-type-chip${loadType === item ? " is-selected" : ""}`}
            aria-pressed={loadType === item}
            onClick={() => setLoadType(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <input
        className="text-input specialty-dest-input"
        value={dest}
        onChange={(event) => setDest(event.target.value)}
        placeholder="Delivery destination"
        aria-label="Custom delivery destination"
      />
      <QuantityStepper value={qty} onChange={setQty} />
      <div className="vac-add-actions specialty-picker-actions">
        <button type="submit" className="text-btn amber specialty-add-open">
          {addLabel}
        </button>
        <button type="button" className="text-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
