import { useEffect, useMemo, useRef, useState } from "react";
import type { Load } from "../types";
import { chicagoToday } from "../lib/chicagoDate";
import { customersAvailableForCounter, dispatchedForCustomer } from "../lib/customerTallies";
import { useCustomerLanes } from "../store/CustomerLanesContext";
import { useCustomerTallies } from "../store/CustomerTalliesContext";
import { TallyChip } from "./DispatchTalliesRow";

/**
 * Extra Asking counters under Hooker Street, plus "+ Add counter".
 * Each card works like Evanston Asking: per-day −/+ tally (synced) and
 * "N dispatched today" from that day's logged loads.
 */
export function CustomerTallyChips({
  date,
  dayLoads,
}: {
  date: string;
  dayLoads: readonly Pick<Load, "pickup" | "commodity">[];
}) {
  const { state, counters, askingOn, setAsking, addCounter, removeCounter } =
    useCustomerTallies();
  const { store: lanes } = useCustomerLanes();
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);
  const today = chicagoToday();

  const available = useMemo(
    () => customersAvailableForCounter(lanes, state, today),
    [lanes, state, today],
  );
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? available.filter((name) => name.toLowerCase().includes(q)) : available;
  }, [available, filter]);

  useEffect(() => {
    if (picking) filterRef.current?.focus();
  }, [picking]);

  const close = () => {
    setPicking(false);
    setFilter("");
  };

  return (
    <>
      {counters.map((counter) => {
        const value = askingOn(date, counter.key);
        const sent = dispatchedForCustomer(dayLoads, counter.customer, lanes, date);
        return (
          <TallyChip
            key={counter.key}
            label={`${counter.customer} Asking`}
            value={value}
            sub={`${sent} dispatched today`}
            onSet={(n) => void setAsking(date, counter.key, n)}
            onStepDown={() => void setAsking(date, counter.key, Math.max(0, value - 1))}
            onStepUp={() => void setAsking(date, counter.key, value + 1)}
            onRemove={() => void removeCounter(counter.key)}
          />
        );
      })}

      {picking ? (
        <div className="tally-add-picker" role="dialog" aria-label="Add a counter">
          <div className="tally-add-head">
            <span>Add counter</span>
            <button type="button" className="tally-chip-remove" aria-label="Close" onClick={close}>
              ×
            </button>
          </div>
          {available.length > 6 ? (
            <input
              ref={filterRef}
              className="tally-add-filter"
              placeholder="Filter customers"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
                if (e.key === "Enter" && shown.length === 1) {
                  void addCounter(shown[0]);
                  close();
                }
              }}
            />
          ) : null}
          {available.length === 0 ? (
            <p className="tally-add-empty">
              No other customers with open lanes. Add lanes on the Customers page first.
            </p>
          ) : (
            <ul className="tally-add-list">
              {shown.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    className="tally-add-option"
                    onClick={() => {
                      void addCounter(name);
                      close();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") close();
                    }}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <button type="button" className="tally-add-btn" onClick={() => setPicking(true)}>
          + Add counter
        </button>
      )}
    </>
  );
}
