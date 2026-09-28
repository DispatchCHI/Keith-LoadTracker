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
} from "../lib/loadDriver";
import { newLoadId } from "../lib/storage";
import { useDriverRoster } from "../store/DriverRosterContext";
import { useLoads } from "../store/LoadsContext";
import type { Load } from "../types";

type LogLoadScreenProps = {
  initialTruck?: string;
  date?: string;
  onCancel: () => void;
  onSaved: (id: string, date: string) => void;
};

export function LogLoadScreen({
  initialTruck = "",
  date,
  onCancel,
  onSaved,
}: LogLoadScreenProps) {
  const targetDate = date || chicagoToday();
  const notToday = targetDate !== chicagoToday();
  const screenClass = notToday
    ? "screen overlay-screen overlay-not-today"
    : "screen overlay-screen";
  const { saveLoad, loads } = useLoads();
  const { store: rosterStore } = useDriverRoster();
  const { consumeOpens } = useSpecialty();
  const [duplicate, setDuplicate] = useState<Load | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [truck, setTruck] = useState(initialTruck);
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
  const loggingDriverName = snapshotDriverNameForTruck(rosterStore, form.truck);
  const typingPreview = useMemo(
    () => previewDriversForTruckInput(rosterStore, truck),
    [rosterStore, truck],
  );

  const commitTruck = (nextTruck: string) => {
    setTruck(nextTruck);
    setForm((prev) => ({ ...prev, truck: nextTruck }));
    setStep("form");
  };

  const finishSave = () => {
    const now = new Date().toISOString();
    const pickup = pickupLabel(form.stationId, form.pickup);
    const destination = form.destination.trim();
    const candidate = {
      truck: form.truck.trim(),
      pickup,
      commodity: form.commodity.trim(),
      destination,
      createdAt: now,
    };

    let lastId = "";
    for (let i = 0; i < qty; i++) {
      const createdAt = batchCreatedAt(now, i);
      const id = newLoadId();
      lastId = id;
      saveLoad({
        id,
        ...candidate,
        createdAt,
        stationId: form.stationId,
        date: targetDate,
        updatedAt: createdAt,
        driverName: snapshotDriverNameForTruck(rosterStore, candidate.truck),
      });
    }

    // Dismiss immediately — specialty cloud deletes must not block the log screen.
    setDuplicate(null);
    onSaved(lastId, targetDate);

    const lane = resolveSpecialtyBoardMatch(
      form.stationId,
      pickup,
      destination,
      form.commodity,
    );
    if (lane) {
      void consumeOpens(targetDate, lane.specialtyId, lane.chips, qty).catch(
        (err) => console.warn("specialty consume after save failed", err),
      );
    }
  };

  const commit = (opts?: { forceDuplicate?: boolean }) => {
    if (!formComplete(form)) return;
    const forceDuplicate = opts?.forceDuplicate ?? false;
    const now = new Date().toISOString();
    const pickup = pickupLabel(form.stationId, form.pickup);
    const destination = form.destination.trim();

    // Duplicate soft-warn only — specialty opens must never block primary Save.
    // consumeOpens still runs fire-and-forget in finishSave when matched.
    if (!forceDuplicate) {
      const match = findNearDuplicate(loads, {
        truck: form.truck.trim(),
        pickup,
        commodity: form.commodity.trim(),
        destination,
        createdAt: now,
      });
      if (match) {
        setDuplicate(match);
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
          onChange={setTruck}
          onSubmit={() => truck && commitTruck(truck)}
          submitLabel="Next"
          autoFocus
          hint="Type the unit number or broker code, or use the pad."
          driverPreview={formatTruckDriverPreview(typingPreview)}
        />
      </div>
    );
  }

  return (
    <div className={screenClass}>
      <header className="overlay-header">
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <BrandMark size="sm" />
        <div>
          <p className="eyebrow">
            Truck {form.truck}
            {loggingDriverName ? ` · ${loggingDriverName}` : ""}
          </p>
          <h1 className="overlay-title">Log load</h1>
          <p className={notToday ? "overlay-sub overlay-not-today-banner" : "overlay-sub"}>
            {notToday ? `Not today — ${formatHeaderDate(targetDate)}` : "Today"}
          </p>
        </div>
      </header>

      <LoadForm
        value={form}
        onChange={setForm}
        onChangeTruck={() => setStep("truck")}
        driverName={loggingDriverName}
      />

      {duplicate ? (
        <div className="delete-confirm warn-confirm">
          <p>
            Truck {duplicate.truck} already has this same pickup, commodity, and
            destination logged {formatCreatedStamp(duplicate.createdAt) || "just now"}
            {duplicate.displayName ? ` by ${duplicate.displayName}` : ""}. This
            can double-count a dispatch.
            {qty > 1 ? ` Save anyway will still add ${qty} loads.` : ""}
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


      <div className="overlay-footer overlay-footer-stack">
        <QuantityStepper value={qty} onChange={setQuantity} />
        <div className="overlay-footer-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary grow"
            disabled={!formComplete(form)}
            onClick={() => commit()}
          >
            {qty === 1 ? "Save" : `Save ${qty} loads`}
          </button>
        </div>
      </div>
    </div>
  );
}
