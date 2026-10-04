import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  formComplete,
  LoadForm,
  type FormState,
} from "../components/LoadForm";
import { BrandMark } from "../components/BrandMark";
import { QuantityStepper } from "../components/QuantityStepper";
import { TruckEntry } from "../components/TruckEntry";
import { pickupLabel } from "../lib/cascade";
import { chicagoToday, formatCreatedStamp, formatHeaderDate } from "../lib/chicagoDate";
import { findNearDuplicate } from "../lib/duplicates";
import { batchCreatedAt, clampLoadQty } from "../lib/quantity";
import { resolveSpecialtyBoardMatch } from "../lib/specialtyBoard";
import { useSpecialty } from "../store/SpecialtyContext";
import {
  formatTruckDriverPreview,
  previewDriversForTruckInput,
  snapshotDriverNameForTruck,
  type TruckDriverPreview,
} from "../lib/loadDriver";
import { newLoadId } from "../lib/storage";
import {
  formatTruckList,
  parseTruckList,
} from "../lib/truck";
import { useDriverRoster } from "../store/DriverRosterContext";
import { useLoads } from "../store/LoadsContext";
import type { Load } from "../types";

type LogLoadScreenProps = {
  initialTruck?: string;
  date?: string;
  onCancel: () => void;
  onSaved: (id: string, date: string) => void;
};

function previewForTruckListInput(
  rosterStore: Parameters<typeof previewDriversForTruckInput>[0],
  raw: string,
): TruckDriverPreview {
  const { trucks } = parseTruckList(raw);
  if (trucks.length === 0) {
    return previewDriversForTruckInput(rosterStore, raw);
  }
  if (trucks.length === 1 && !raw.includes(",")) {
    return previewDriversForTruckInput(rosterStore, trucks[0]);
  }
  const parts = trucks.map((unit) => {
    const name = snapshotDriverNameForTruck(rosterStore, unit);
    return name ? `${unit} · ${name}` : unit;
  });
  return { exact: parts.join("  "), guesses: [] };
}

export function LogLoadScreen({
  initialTruck = "",
  date,
  onCancel,
  onSaved,
}: LogLoadScreenProps) {
  const targetDate = date || chicagoToday();
  const notToday = targetDate !== chicagoToday();
  const screenClass = notToday
    ? "screen overlay-screen overlay-not-today log-load-sheet"
    : "screen overlay-screen log-load-sheet";
  const { saveLoad, loads } = useLoads();
  const { store: rosterStore } = useDriverRoster();
  const { opensFor, consumeOpens } = useSpecialty();
  const [duplicate, setDuplicate] = useState<Load | null>(null);
  const [specialtyWarn, setSpecialtyWarn] = useState<{
    opens: number;
    stationId: string;
    destination: string;
    pickup: string;
  } | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [truck, setTruck] = useState(initialTruck);
  const [truckError, setTruckError] = useState<string | null>(null);
  const [step, setStep] = useState<"truck" | "form">(
    initialTruck ? "form" : "truck",
  );
  const [form, setForm] = useState<FormState>({
    truck: initialTruck,
    stationId: "",
    pickup: "",
    commodity: "",
    destination: "",
  });

  const qty = clampLoadQty(quantity);
  const formTrucks = useMemo(
    () => parseTruckList(form.truck).trucks,
    [form.truck],
  );
  const truckCount = Math.max(1, formTrucks.length);
  const totalLoads = qty * truckCount;
  const loggingDriverName =
    formTrucks.length === 1
      ? snapshotDriverNameForTruck(rosterStore, formTrucks[0])
      : null;
  const typingPreview = useMemo(
    () => previewForTruckListInput(rosterStore, truck),
    [rosterStore, truck],
  );

  const commitTruck = (nextTruck: string) => {
    const { trucks, invalid } = parseTruckList(nextTruck);
    if (trucks.length === 0) {
      setTruckError(
        invalid.length
          ? "No valid truck numbers. Use unit numbers or broker codes (e.g. 207 or VZ)."
          : "Enter at least one truck number.",
      );
      return;
    }
    const normalized = formatTruckList(trucks);
    setTruckError(null);
    setTruck(normalized);
    setForm((prev) => ({ ...prev, truck: normalized }));
    setStep("form");
  };

  const finishSave = () => {
    const now = new Date().toISOString();
    const pickup = pickupLabel(form.stationId, form.pickup);
    const destination = form.destination.trim();
    const commodity = form.commodity.trim();
    const trucks = parseTruckList(form.truck).trucks;
    if (trucks.length === 0) return;

    let lastId = "";
    let batchIndex = 0;
    for (const unit of trucks) {
      for (let i = 0; i < qty; i++) {
        const createdAt = batchCreatedAt(now, batchIndex);
        batchIndex += 1;
        const id = newLoadId();
        lastId = id;
        saveLoad({
          id,
          truck: unit,
          pickup,
          commodity,
          destination,
          createdAt,
          stationId: form.stationId,
          date: targetDate,
          updatedAt: createdAt,
          driverName: snapshotDriverNameForTruck(rosterStore, unit),
        });
      }
    }

    // Dismiss immediately — specialty cloud deletes must not block the log screen.
    setDuplicate(null);
    setSpecialtyWarn(null);
    onSaved(lastId, targetDate);

    const lane = resolveSpecialtyBoardMatch(
      form.stationId,
      pickup,
      destination,
      form.commodity,
    );
    if (lane) {
      void consumeOpens(
        targetDate,
        lane.specialtyId,
        lane.chips,
        totalLoads,
      ).catch((err) => console.warn("specialty consume after save failed", err));
    }
  };

  const commit = (opts?: {
    forceDuplicate?: boolean;
    forceSpecialty?: boolean;
  }) => {
    if (!formComplete(form)) return;
    const trucks = parseTruckList(form.truck).trucks;
    if (trucks.length === 0) return;
    const forceDuplicate = opts?.forceDuplicate ?? false;
    const forceSpecialty = opts?.forceSpecialty ?? false;
    const now = new Date().toISOString();
    const pickup = pickupLabel(form.stationId, form.pickup);
    const destination = form.destination.trim();
    const commodity = form.commodity.trim();

    if (!forceDuplicate) {
      for (const unit of trucks) {
        const match = findNearDuplicate(loads, {
          truck: unit,
          pickup,
          commodity,
          destination,
          createdAt: now,
        });
        if (match) {
          setSpecialtyWarn(null);
          setDuplicate(match);
          return;
        }
      }
    }

    const lane = resolveSpecialtyBoardMatch(
      form.stationId,
      pickup,
      destination,
      form.commodity,
    );
    if (!forceSpecialty && lane) {
      const opens = opensFor(targetDate, lane.specialtyId, lane.chips);
      if (opens < totalLoads) {
        setDuplicate(null);
        setSpecialtyWarn({
          opens,
          stationId: lane.specialtyId,
          destination: lane.chip,
          pickup,
        });
        return;
      }
    }

    void finishSave();
  };

  if (step === "truck") {
    return (
      <div className={screenClass}>
        <header className="overlay-header">
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Back">
            <ArrowLeft size={22} />
          </button>
          <BrandMark size="sm" />
          <div>
            <p className="eyebrow">New load</p>
            <h1 className="overlay-title">Truck</h1>
            {notToday ? (
              <p className="overlay-sub overlay-not-today-banner">
                Not today — {formatHeaderDate(targetDate)}
              </p>
            ) : null}
          </div>
        </header>
        <TruckEntry
          value={truck}
          onChange={(next) => {
            setTruckError(null);
            setTruck(next);
          }}
          onSubmit={() => truck && commitTruck(truck)}
          submitLabel="Next"
          autoFocus
          allowMulti
          error={truckError}
          hint="Type unit numbers or broker codes — commas for several (e.g. 207, 214)."
          driverPreview={
            truckError ? undefined : formatTruckDriverPreview(typingPreview)
          }
        />
      </div>
    );
  }

  return (
    <div className={screenClass}>
      <header className="overlay-header log-load-head">
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div className="log-load-title">
          <p className="eyebrow">
            Log load · {notToday ? formatHeaderDate(targetDate) : "Today"}
          </p>
          <h1 className="overlay-title">
            {form.truck}
            {loggingDriverName ? ` · ${loggingDriverName}` : ""}
          </h1>
          {notToday ? (
            <p className="overlay-sub overlay-not-today-banner">Not today</p>
          ) : null}
          {formTrucks.length > 1 ? (
            <p className="overlay-sub">{formTrucks.length} trucks</p>
          ) : null}
        </div>
        <button
          type="button"
          className="log-load-change"
          onClick={() => {
            setTruckError(null);
            setStep("truck");
          }}
        >
          Change truck
        </button>
      </header>

      <LoadForm
        value={form}
        onChange={setForm}
        hideTruck
        onChangeTruck={() => {
          setTruckError(null);
          setStep("truck");
        }}
        driverName={loggingDriverName}
      />

      {duplicate ? (
        <div className="delete-confirm warn-confirm">
          <p>
            Truck {duplicate.truck} already has this same pickup, commodity, and
            destination logged {formatCreatedStamp(duplicate.createdAt) || "just now"}
            {duplicate.displayName ? ` by ${duplicate.displayName}` : ""}. This
            can double-count a dispatch.
            {totalLoads > 1
              ? ` Save anyway will still add ${totalLoads} loads.`
              : ""}
          </p>
          <div className="overlay-footer">
            <button type="button" className="btn-ghost" onClick={() => setDuplicate(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary grow"
              onClick={() => commit({ forceDuplicate: true })}
            >
              Save anyway
            </button>
          </div>
        </div>
      ) : null}

      {specialtyWarn ? (
        <div className="delete-confirm warn-confirm">
          <p className="specialty-warn-title">No Available Loads</p>
          <p>
            {specialtyWarn.opens === 0
              ? `No specialty opens for ${specialtyWarn.pickup} → ${specialtyWarn.destination} on this day.`
              : `Only ${specialtyWarn.opens} specialty open${specialtyWarn.opens === 1 ? "" : "s"} for ${specialtyWarn.pickup} → ${specialtyWarn.destination}, but you are logging ${totalLoads}.`}{" "}
            Add {totalLoads === 1 ? "this load" : `these ${totalLoads} loads`} to the daily tally
            anyway?
          </p>
          <div className="overlay-footer">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setSpecialtyWarn(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary grow"
              onClick={() =>
                commit({ forceDuplicate: true, forceSpecialty: true })
              }
            >
              Save anyway
            </button>
          </div>
        </div>
      ) : null}

      <div className="overlay-footer log-load-footer">
        <QuantityStepper value={qty} onChange={setQuantity} />
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary grow"
          disabled={!formComplete(form)}
          onClick={() =>
            commit({
              forceDuplicate: Boolean(duplicate),
              forceSpecialty: Boolean(specialtyWarn),
            })
          }
        >
          {totalLoads === 1 ? "Save" : `Save ${totalLoads} loads`}
        </button>
      </div>
    </div>
  );
}
