import { useEffect, useMemo, useRef, useState } from "react";
import type { DriverGoneEntry } from "../lib/driverGone";
import type { DriverRosterEntry, DriverRosterStore } from "../lib/driverRoster";
import { searchAssignableDrivers } from "../lib/truckAssignPrompt";

type TruckAssignPromptProps = {
  truck: string;
  /** 1-based position when several trucks need a driver. */
  position: number;
  total: number;
  store: DriverRosterStore;
  goneEntries: readonly DriverGoneEntry[];
  onAssign: (entry: DriverRosterEntry) => Promise<{ ok: boolean; conflictName?: string }>;
  onSkip: () => void;
};

/** "Truck 2181 isn't assigned to a driver" — pick one, or skip. */
export function TruckAssignPrompt({
  truck,
  position,
  total,
  store,
  goneEntries,
  onAssign,
  onSkip,
}: TruckAssignPromptProps) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [confirmFor, setConfirmFor] = useState<DriverRosterEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery("");
    setHighlight(0);
    setConfirmFor(null);
    setError(null);
    inputRef.current?.focus();
  }, [truck]);

  const matches = useMemo(
    () => searchAssignableDrivers(store, goneEntries, query),
    [store, goneEntries, query],
  );
  const selected = matches[Math.min(highlight, Math.max(0, matches.length - 1))] ?? null;

  const assign = async (entry: DriverRosterEntry | null) => {
    if (!entry || busy) return;
    const current = entry.assignedTruck;
    if (current && current !== truck && confirmFor?.id !== entry.id) {
      setConfirmFor(entry);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await onAssign(entry);
      if (!result.ok) {
        setError(`Truck ${truck} is already assigned to ${result.conflictName ?? "another driver"}.`);
        setConfirmFor(null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="delete-confirm warn-confirm truck-assign-prompt"
      role="dialog"
      aria-label={`Assign truck ${truck}`}
    >
      <p className="truck-assign-title">
        Truck {truck} isn&apos;t assigned to a driver
        {total > 1 ? <span className="truck-assign-count"> ({position} of {total})</span> : null}
      </p>
      <input
        ref={inputRef}
        className="truck-assign-input"
        value={query}
        placeholder="Driver name or EMP #"
        aria-label="Search Full Roster drivers"
        autoComplete="off"
        spellCheck={false}
        autoFocus
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setConfirmFor(null);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, Math.max(0, matches.length - 1)));
            setConfirmFor(null);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(0, h - 1));
            setConfirmFor(null);
          } else if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            void assign(selected);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onSkip();
          }
        }}
      />
      {matches.length ? (
        <ul className="truck-assign-list" role="listbox">
          {matches.map((entry, i) => {
            const active = entry.id === selected?.id;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={active ? "truck-assign-opt is-active" : "truck-assign-opt"}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => {
                    setHighlight(i);
                    void assign(entry);
                  }}
                >
                  <span className="truck-assign-emp">{entry.truckNumber ?? "—"}</span>{" "}
                  {entry.name}
                  {entry.assignedTruck ? (
                    <span className="truck-assign-has"> · has truck {entry.assignedTruck}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : query.trim() ? (
        <p className="field-hint tight">No Full Roster driver matches.</p>
      ) : (
        <p className="field-hint tight">Type a name or EMP #. Enter assigns, Esc skips.</p>
      )}
      {confirmFor ? (
        <p className="truck-assign-replace" role="alert">
          {confirmFor.name} has truck {confirmFor.assignedTruck} now. Assign {truck} instead?
          Press Enter or Replace to confirm.
        </p>
      ) : null}
      {error ? (
        <p className="field-hint tight" role="alert" style={{ color: "var(--amber)" }}>
          {error}
        </p>
      ) : null}
      <div className="overlay-footer">
        <button type="button" className="btn-ghost" onClick={onSkip} disabled={busy}>
          Skip
        </button>
        <button
          type="button"
          className="btn-primary grow"
          disabled={!selected || busy}
          onClick={() => void assign(confirmFor ?? selected)}
        >
          {confirmFor ? `Replace with ${truck}` : "Assign"}
        </button>
      </div>
    </div>
  );
}
