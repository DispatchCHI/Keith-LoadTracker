import { useMemo, useState } from "react";
import { chicagoToday, formatShortDate, parseISODate } from "../lib/chicagoDate";
import {
  DISPATCH_CREW,
  DAYS_PER_WEEK,
  MAX_VACATION_WEEKS,
  bankDays,
  crewMember,
  daysLeft,
  daysUsed,
  dutyLabel,
  monthNames,
  personName,
  saturdayOnOrAfter,
  usedPercent,
  vacationChipLabel,
  yearsEmployed,
  type DispatchPerson,
  type SaturdayDuty,
  type SaturdayRow,
} from "../lib/saturdayCrew";
import { useSaturdayCrew } from "../store/SaturdayCrewContext";

const DUTY_CHOICES: SaturdayDuty[] = ["mike", "tim", "keith", "everyone", "open"];

export function DispatchScreen() {
  const today = chicagoToday();
  const { boardFor, addDay, removeDay, setDuty, setNote, setWeeks, setStartDate } = useSaturdayCrew();
  const [year, setYear] = useState(() => parseISODate(today).y);
  const [month, setMonth] = useState(() => parseISODate(today).m - 1);
  const [selected, setSelected] = useState(() => saturdayOnOrAfter(today));
  const [drafts, setDrafts] = useState<Record<DispatchPerson, string>>({
    tim: "",
    keith: "",
    mike: "",
  });
  const [noteDraft, setNoteDraft] = useState<string | null>(null);

  const board = boardFor(year);
  const thisSaturday = saturdayOnOrAfter(today);
  const rows = useMemo(
    () => board.saturdays.filter((row) => parseISODate(row.date).m - 1 === month),
    [board.saturdays, month],
  );
  const selectedRow =
    board.saturdays.find((row) => row.date === selected) ?? rows[0] ?? null;
  const jul4 = board.saturdays.find((row) => row.date === `${year}-07-04`);
  const noteValue = noteDraft ?? selectedRow?.note ?? "";

  function shiftYear(delta: number) {
    const nextYear = year + delta;
    const nextBoard = boardFor(nextYear);
    const inMonth = nextBoard.saturdays.filter((row) => parseISODate(row.date).m - 1 === month);
    const keep = inMonth.find((row) => row.date === thisSaturday) ?? inMonth[0];
    setYear(nextYear);
    setNoteDraft(null);
    if (keep) setSelected(keep.date);
  }

  function openMonth(nextMonth: number) {
    setMonth(nextMonth);
    setNoteDraft(null);
    const inMonth = board.saturdays.filter((row) => parseISODate(row.date).m - 1 === nextMonth);
    const keep = inMonth.find((row) => row.date === thisSaturday) ?? inMonth[0];
    if (keep) setSelected(keep.date);
  }

  function choose(date: string) {
    setSelected(date);
    setNoteDraft(null);
  }

  function commitNote(row: SaturdayRow) {
    if (noteDraft === null) return;
    setNote(year, row.date, noteDraft);
    setNoteDraft(null);
  }

  return (
    <section className="screen dispatch-screen">
      <header className="dispatch-head">
        <div>
          <h1 className="page-title">Dispatch</h1>
          <p className="desk-sub">Saturday crew on the right. Vacation days on the left.</p>
        </div>
        <div className="dispatch-year">
          <button type="button" onClick={() => shiftYear(-1)} aria-label="Previous year">
            ‹
          </button>
          <span>{year}</span>
          <button type="button" onClick={() => shiftYear(1)} aria-label="Next year">
            ›
          </button>
        </div>
      </header>

      <div className="dispatch-split">
        <section className="dispatch-col">
          <div className="dispatch-panel-h">
            <h2>Vacation days</h2>
          </div>
          <p className="dispatch-hint">
            A week is {DAYS_PER_WEEK} days. Change the weeks when someone earns more, and add a start date.
          </p>
          <div className="dispatch-cards">
            {DISPATCH_CREW.map((person) => {
              const member = crewMember(board, person.id);
              const weeks = member.weeks;
              const used = daysUsed(board.vacations, person.id);
              const left = daysLeft(board, person.id);
              const tenure = yearsEmployed(member.startDate, today);
              const chips = board.vacations.filter((use) => use.person === person.id);
              return (
                <article key={person.id} className="dispatch-card">
                  <div className="dispatch-card-top">
                    <div className="dispatch-who">
                      <i className={`dispatch-swatch is-${person.id}`} />
                      {person.name}
                    </div>
                    <div className="dispatch-weeks">
                      <button
                        type="button"
                        aria-label={`Fewer weeks for ${person.name}`}
                        disabled={weeks <= 0}
                        onClick={() => setWeeks(year, person.id, weeks - 1)}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={MAX_VACATION_WEEKS}
                        aria-label={`${person.name} vacation weeks`}
                        value={weeks}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (!Number.isFinite(next)) return;
                          setWeeks(year, person.id, next);
                        }}
                      />
                      <span>weeks</span>
                      <button
                        type="button"
                        aria-label={`More weeks for ${person.name}`}
                        disabled={weeks >= MAX_VACATION_WEEKS}
                        onClick={() => setWeeks(year, person.id, weeks + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <label className="dispatch-start">
                    Start date
                    <input
                      type="date"
                      aria-label={`${person.name} start date`}
                      value={member.startDate ?? ""}
                      onChange={(event) => setStartDate(year, person.id, event.target.value || null)}
                    />
                    <span>{tenure === null ? "" : `${tenure} ${tenure === 1 ? "year" : "years"}`}</span>
                  </label>
                  <div className="dispatch-left-row">
                    <div className="dispatch-left-num">
                      {left}
                      <span>days left</span>
                    </div>
                    <div className="dispatch-bank">
                      {used} used · {bankDays(weeks)} days
                    </div>
                  </div>
                  <div className="dispatch-track">
                    <i className={`is-${person.id}`} style={{ width: `${usedPercent(board, person.id)}%` }} />
                  </div>
                  <div className="dispatch-chips">
                    {chips.map((use) => (
                      <span key={use.id} className="dispatch-chip">
                        {vacationChipLabel(use)}
                        <button type="button" aria-label={`Remove ${vacationChipLabel(use)}`} onClick={() => removeDay(year, use.id)}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <form
                    className="dispatch-add"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const date = drafts[person.id];
                      if (!date) return;
                      addDay(year, person.id, date);
                      setDrafts((current) => ({ ...current, [person.id]: "" }));
                    }}
                  >
                    <input
                      type="date"
                      aria-label={`${person.name} vacation date`}
                      min={`${year}-01-01`}
                      max={`${year}-12-31`}
                      value={drafts[person.id]}
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [person.id]: event.target.value }))
                      }
                    />
                    <button type="submit">Add day</button>
                  </form>
                </article>
              );
            })}
          </div>
        </section>

        <section className="dispatch-col">
          <div className="dispatch-panel-h">
            <h2>Saturday schedule</h2>
            <p>Click a Saturday, then pick who works.</p>
          </div>
          <div className="dispatch-months">
            {monthNames().map((name, index) => (
              <button
                key={name}
                type="button"
                className={index === month ? "is-on" : ""}
                onClick={() => openMonth(index)}
              >
                {name}
              </button>
            ))}
          </div>
          {jul4?.duty === "open" ? (
            <p className="dispatch-callout">
              Jul 4 is blank on the sheet. Open that month and set a name, or choose Everyone.
            </p>
          ) : null}
          <div className="dispatch-editor">
            <div className="dispatch-sat-list">
              {rows.map((row) => (
                <button
                  key={row.date}
                  type="button"
                  className={row.date === selectedRow?.date ? "is-selected" : ""}
                  onClick={() => choose(row.date)}
                >
                  <span className="dispatch-date">{formatShortDate(row.date)}</span>
                  <span className={`dispatch-pill is-${row.duty}`}>{dutyLabel(row.duty)}</span>
                  {row.with ? <span className="dispatch-with">with {personName(row.with)}</span> : null}
                  {row.note ? <span className="dispatch-note">{row.note}</span> : null}
                  {row.date === thisSaturday ? <span className="dispatch-now">This Sat</span> : null}
                </button>
              ))}
            </div>
            {selectedRow ? (
              <div className="dispatch-menu">
                <p>{formatShortDate(selectedRow.date)} who works</p>
                {DUTY_CHOICES.map((duty) => (
                  <button
                    key={duty}
                    type="button"
                    className={selectedRow.duty === duty ? "is-pick" : ""}
                    onClick={() => {
                      commitNote(selectedRow);
                      setDuty(year, selectedRow.date, duty);
                    }}
                  >
                    {dutyLabel(duty)}
                    {selectedRow.duty === duty ? <span>✓</span> : null}
                  </button>
                ))}
                <label className="dispatch-note-field">
                  Note
                  <input
                    value={noteValue}
                    placeholder="Optional note"
                    onChange={(event) => setNoteDraft(event.target.value)}
                    onBlur={() => commitNote(selectedRow)}
                  />
                </label>
              </div>
            ) : null}
          </div>
          <div className="dispatch-log">
            <h3>Change log</h3>
            {board.log.length ? (
              <ul>
                {board.log.map((entry) => (
                  <li key={entry.id}>{entry.text}</li>
                ))}
              </ul>
            ) : (
              <p>No changes yet.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
