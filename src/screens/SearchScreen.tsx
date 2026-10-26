import { useMemo, useState } from "react";
import { CommodityTag } from "../components/CommodityTag";
import { DayPicker } from "../components/DayPicker";
import { TimeOffEditRow, type TimeOffPatch } from "../components/TimeOffEditRow";
import { LoadCreatorBadge, LoadEditedMark, LoadRow } from "../components/LoadRow";
import { chicagoToday, formatShortDate, yearOfISO } from "../lib/chicagoDate";
import {
  driverTimeOffRows,
  type DriverTimeOffRow,
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
  const { rows: callOffRows, addRow, editRow, removeRow } = useCallOffLog();
  const { manualOffs, removeManualOff } = useDrivers();
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

  // 1.1.49: edit / delete a Time off row. Each source keeps its own sync path
  // (call-off log, Today manual offs, vacation board) so deletes tombstone and
  // propagate instead of resurrecting.
  const deleteTimeOff = async (row: DriverTimeOffRow) => {
    if (row.id.startsWith("vac:")) {
      await vacation.removeDriver(row.id.slice(4));
    } else if (row.id.startsWith("man:")) {
      if (selected) await removeManualOff(row.start, selected.name);
    } else {
      await removeRow(row.id);
    }
  };
  const saveTimeOff = async (row: DriverTimeOffRow, patch: TimeOffPatch) => {
    if (!selected) return;
    const end = patch.end === patch.start ? null : patch.end;
    if (row.id.startsWith("vac:") && patch.reason === "Vacation") {
      await vacation.editDriver(row.id.slice(4), { startOn: patch.start, endOn: patch.end });
      return;
    }
    if (!row.id.startsWith("vac:") && !row.id.startsWith("man:")) {
      await editRow(row.id, { start: patch.start, end, reason: patch.reason });
      return;
    }
    // Vacation -> other reason, or a single-day Today mark: move it to the call-off log.
    const added = await addRow({ name: selected.name, start: patch.start, end, reason: patch.reason });
    if (added) await deleteTimeOff(row);
  };
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
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeOff.map((row) => (
                      <TimeOffEditRow
                        key={row.id}
                        row={row}
                        today={today}
                        onSave={(patch) => saveTimeOff(row, patch)}
                        onDelete={() => deleteTimeOff(row)}
                      />
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
                            <LoadCreatorBadge displayName={load.displayName} />
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
