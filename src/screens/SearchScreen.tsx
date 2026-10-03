import { useMemo, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { CommodityTag } from "../components/CommodityTag";
import { DayPicker } from "../components/DayPicker";
import { LoadEditedMark, LoadRow } from "../components/LoadRow";
import { chicagoToday, formatShortDate, yearOfISO } from "../lib/chicagoDate";
import {
  driverTimeOffRows,
  formatTimeOffDays,
  formatTimeOffWhen,
  loadsForDriverName,
  loadsMatchingDriverQuery,
  searchFullRosterDrivers,
} from "../lib/driverSearch";
import { driverRosterYardLabel } from "../lib/driverRoster";
import { loggedDriverNamesForTruck } from "../lib/loadDriver";
import {
  CALL_OFF_ALLOTMENT,
  P_DAY_ALLOTMENT,
  allotmentForName,
  yearlyAllotmentUses,
} from "../lib/rosterAllotment";
import { yearsOfService, yearsOfServiceLabel } from "../lib/rosterHireDate";
import { rosterEntryOnVacation, vacationNamesOnDate } from "../lib/rosterVacation";
import { sanitizeTruck } from "../lib/truck";
import { useCallOffLog } from "../store/CallOffLogContext";
import { useDriverRoster } from "../store/DriverRosterContext";
import { useDrivers } from "../store/DriversContext";
import { useLoads } from "../store/LoadsContext";
import { useVacation } from "../store/VacationContext";

type SearchScreenProps = {
  editingId?: string | null;
  onEdit: (id: string) => void;
  onLogForTruck: (truck: string, date: string) => void;
};

export function SearchScreen({
  editingId,
  onEdit,
  onLogForTruck,
}: SearchScreenProps) {
  const today = chicagoToday();
  const year = yearOfISO(today);
  const { loads, loadsOn } = useLoads();
  const { store: roster } = useDriverRoster();
  const { rows: callOffRows } = useCallOffLog();
  const { manualOffs } = useDrivers();
  const vacation = useVacation();
  const [digits, setDigits] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [truck, setTruck] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [showPad, setShowPad] = useState(true);

  const dayLoads = useMemo(() => loadsOn(date), [date, loadsOn]);
  const hits = useMemo(
    () => (truck && !showPad ? [] : searchFullRosterDrivers(roster, nameQuery)),
    [nameQuery, roster, showPad, truck],
  );
  const selected = hits.find((hit) => hit.id === pickedId) ?? hits[0] ?? null;

  const allotmentUses = useMemo(
    () => yearlyAllotmentUses(callOffRows, manualOffs, year),
    [callOffRows, manualOffs, year],
  );
  const allot = selected ? allotmentForName(selected.name, allotmentUses) : null;
  const timeOff = useMemo(
    () =>
      selected
        ? driverTimeOffRows({
            name: selected.name,
            year,
            logRows: callOffRows,
            manuals: manualOffs,
            vacation: vacation.store,
          })
        : [],
    [selected, year, callOffRows, manualOffs, vacation.store],
  );
  const recentLoads = useMemo(
    () => (selected ? loadsForDriverName(loads, selected.name) : []),
    [loads, selected],
  );
  const nameLoadHits = useMemo(
    () =>
      nameQuery.trim() && hits.length === 0 && !(truck && !showPad)
        ? loadsMatchingDriverQuery(loads, nameQuery)
        : [],
    [hits.length, loads, nameQuery, showPad, truck],
  );

  const loadsForTruck = useMemo(() => {
    if (!truck) return [];
    return dayLoads.filter((load) => load.truck === truck);
  }, [dayLoads, truck]);
  const loggedDrivers = useMemo(
    () => (truck ? loggedDriverNamesForTruck(loadsForTruck, truck) : []),
    [loadsForTruck, truck],
  );

  const onVacation = selected
    ? rosterEntryOnVacation(
        selected,
        vacationNamesOnDate(vacation.store, today, selected.yard),
      )
    : false;
  const years = selected ? yearsOfService(selected.hireDate, today) : null;
  const identity = selected
    ? [
        driverRosterYardLabel(selected.yard),
        years === null ? null : yearsOfServiceLabel(years),
        selected.phone,
        selected.assignedTruck ? `truck ${selected.assignedTruck}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const find = () => {
    if (!digits) return;
    setTruck(digits);
    setNameQuery("");
    setPickedId(null);
    setShowPad(false);
  };

  const showingTruck = Boolean(truck && !showPad);

  return (
    <div className="screen search-screen">
      <header className="page-header">
        <div className="page-header-brand">
          <BrandMark />
          <div>
            <p className="eyebrow">Search</p>
            <h1 className="page-title">Search</h1>
          </div>
        </div>
      </header>

      <div className="search-controls">
        <label className="field">
          <div className="field-label">Search by driver</div>
          <input
            className="text-input search-driver-input"
            value={nameQuery}
            autoComplete="off"
            placeholder="Type a driver name"
            aria-label="Search by driver name"
            onChange={(e) => {
              setNameQuery(e.target.value);
              setPickedId(null);
              setTruck(null);
              setShowPad(true);
            }}
          />
        </label>

        {showingTruck ? (
          <button
            type="button"
            className="truck-display compact"
            onClick={() => setShowPad(true)}
          >
            <span className="truck-digits">{truck}</span>
            <span className="tap-hint">Tap to search another unit</span>
          </button>
        ) : (
          <form
            className="search-truck"
            onSubmit={(event) => {
              event.preventDefault();
              find();
            }}
          >
            <label className="truck-kb-label">
              Truck
              <input
                className="truck-kb-input search-truck-input"
                value={digits}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder="e.g. 418 or VZ"
                aria-label="Truck or broker code"
                onChange={(e) => setDigits(sanitizeTruck(e.target.value))}
              />
            </label>
            <p className="field-hint tight">Type a truck number or broker code. Enter to continue.</p>
            <button type="submit" className="btn-primary" disabled={!digits}>
              Find
            </button>
          </form>
        )}
      </div>

      {showingTruck ? (
        <>
          <section className="truck-summary">
            <div className="truck-summary-badge">TRUCK {truck}</div>
            <div className="truck-summary-copy">
              <p className="truck-summary-meta">
                {loadsForTruck.length} {loadsForTruck.length === 1 ? "load" : "loads"} ·{" "}
                {formatShortDate(date)}
              </p>
              {loggedDrivers.length ? (
                <p className="truck-roster-driver">Logged · {loggedDrivers.join(" · ")}</p>
              ) : null}
            </div>
          </section>

          <DayPicker date={date} onChange={setDate} />

          {loadsForTruck.length === 0 ? (
            <div className="empty compact">
              <h2>No loads for truck {truck}</h2>
              <p>
                Nothing logged on {formatShortDate(date)}. Log a haul for this unit, or pick
                another day.
              </p>
            </div>
          ) : (
            <div className="feed">
              {loadsForTruck.map((load) => (
                <LoadRow
                  key={load.id}
                  load={load}
                  onEdit={() => onEdit(load.id)}
                  highlight={load.id === editingId ? "editing" : null}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            className="btn-primary"
            onClick={() => onLogForTruck(truck!, date)}
          >
            + Log load for {truck}
          </button>
        </>
      ) : null}

      {!showingTruck && nameQuery.trim() && hits.length > 1 ? (
        <div className="search-hits" role="listbox" aria-label="Matching drivers">
          {hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              className={hit.id === selected?.id ? "search-hit on" : "search-hit"}
              onClick={() => setPickedId(hit.id)}
            >
              <b>
                {hit.truckNumber ? `${hit.truckNumber} ` : ""}
                {hit.name}
              </b>
              <span>{driverRosterYardLabel(hit.yard)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {!showingTruck && selected && allot ? (
        <section className="search-file">
          <div className="search-file-top">
            <div>
              <h2>
                {selected.truckNumber ? `${selected.truckNumber} ` : ""}
                {selected.name}
              </h2>
              {identity ? <p className="search-file-sub">{identity}</p> : null}
            </div>
            {onVacation ? <span className="search-vac">Vac this week</span> : null}
          </div>

          <div className="search-stats">
            <div className="search-stat search-stat-p">
              <span>P-Day left</span>
              <b>
                {allot.pDayLeft} of {P_DAY_ALLOTMENT}
              </b>
            </div>
            <div className="search-stat search-stat-c">
              <span>Call-off left</span>
              <b>
                {allot.callOffLeft} of {CALL_OFF_ALLOTMENT}
              </b>
            </div>
            <div className="search-stat search-stat-k">
              <span>OK'd Off this year</span>
              <b>{allot.okdOffUsed}</b>
            </div>
          </div>

          <div className="search-cols">
            <div>
              <h3>Time off · {year}</h3>
              {timeOff.length === 0 ? (
                <p className="search-empty">No time off in {year}.</p>
              ) : (
                <table className="search-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Reason</th>
                      <th>Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeOff.map((row) => (
                      <tr key={row.id}>
                        <td>{formatTimeOffWhen(row.start, row.end)}</td>
                        <td>
                          <span className={`tag calloff-chip calloff-chip-${row.kind}`}>
                            {row.reason}
                          </span>
                        </td>
                        <td>{formatTimeOffDays(row.start, row.end, today)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div>
              <h3>Recent loads</h3>
              {recentLoads.length === 0 ? (
                <p className="search-empty">No loads logged for this driver.</p>
              ) : (
                <table className="search-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Route</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLoads.map((load) => (
                      <tr key={load.id}>
                        <td>{formatShortDate(load.date)}</td>
                        <td>
                          <div className="search-load-line">
                            <div>
                              {load.truck} · {load.pickup} → {load.destination}
                              <div className="search-load-tag">
                                <CommodityTag commodity={load.commodity} />
                              </div>
                            </div>
                            <LoadEditedMark name={load.editedBy} />
                          </div>
                        </td>
                        <td>
                          <button type="button" className="edit-link" onClick={() => onEdit(load.id)}>
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {!showingTruck && nameQuery.trim() && hits.length === 0 ? (
        <>
          <div className="empty compact">
            <h2>No driver matches</h2>
            <p>Nothing on the roster matches “{nameQuery.trim()}”.</p>
          </div>
          {nameLoadHits.length > 0 ? (
            <div className="feed">
              {nameLoadHits.map((load) => (
                <LoadRow
                  key={load.id}
                  load={load}
                  onEdit={() => onEdit(load.id)}
                  highlight={load.id === editingId ? "editing" : null}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
