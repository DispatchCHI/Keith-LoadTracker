import { useMemo, useState } from "react";
import { DriverNameInput } from "../components/DriverNameInput";
import { addDays, chicagoToday, formatHeaderDate, previousWorkingDay } from "../lib/chicagoDate";
import {
  CALL_OFF_REASON_PRESETS,
  formatSheetStyleDate,
  callOffLogRowVisible,
  kindForLogEntry,
  logEntrySubtracts,
  type CallOffLogEntry,
} from "../lib/callOffLog";
import { cleanDriverName } from "../lib/driverRoster";
import {
  callOffKindFromReason,
  type CallOffKind,
} from "../lib/driverAvailability";
import { useCallOffLog } from "../store/CallOffLogContext";
import { useDriverGone } from "../store/DriverGoneContext";
import { useDriverRoster } from "../store/DriverRosterContext";
import "./calloffs-screen.css";

type FilterId = "upcoming" | "today" | "yesterday" | "all";

const OFF_TODAY_KINDS: CallOffKind[] = [
  "p-day",
  "call-off",
  "vacation",
  "fmla",
  "okd-off",
  "ncns",
];

const KIND_TITLE: Record<CallOffKind, string> = {
  "p-day": "P-Day",
  "call-off": "Call Off",
  vacation: "Vacation Day",
  fmla: "FMLA Day",
  "okd-off": "ok'd off",
  ncns: "NCNS",
  "late-early": "Late/Early",
};

function presetKind(reason: string): CallOffKind {
  return callOffKindFromReason(reason);
}

function presetClass(reason: string): string {
  return `calloff-kind-${presetKind(reason)}`;
}

function nameKey(raw: string): string {
  return cleanDriverName(raw)
    .toLowerCase()
    .replace(/\s*-\s*t\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lastFirstKey(raw: string): string {
  const parts = nameKey(raw).split(" ").filter(Boolean);
  if (parts.length < 2) return nameKey(raw);
  return `${parts[parts.length - 1]} ${parts[0]}`;
}

function lookupEmpNumber(
  name: string,
  byExact: Map<string, string>,
  byLastFirst: Map<string, string>,
): string {
  const exact = nameKey(name);
  if (byExact.has(exact)) return byExact.get(exact) ?? "";
  const flip = lastFirstKey(name);
  return byLastFirst.get(flip) ?? "";
}

function coversDay(row: CallOffLogEntry, day: string): boolean {
  const last = row.end ?? row.start;
  return row.start <= day && last >= day;
}

function sheetRank(row: CallOffLogEntry, day: string): number {
  const last = row.end ?? row.start;
  if (row.start <= day && last >= day) return 0;
  if (row.start > day) return 1;
  return 2;
}

function compareSheet(a: CallOffLogEntry, b: CallOffLogEntry, day: string): number {
  const rank = sheetRank(a, day) - sheetRank(b, day);
  if (rank) return rank;
  const bucket = sheetRank(a, day);
  if (bucket === 0) return a.name.localeCompare(b.name);
  if (a.start !== b.start) {
    return bucket === 2 ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start);
  }
  return a.name.localeCompare(b.name);
}

function monthDay(iso: string): string {
  return formatSheetStyleDate(iso).replace(/\/\d{2}$/, "");
}

function offMeta(row: CallOffLogEntry, emp: string): string {
  const when = row.end ? `through ${monthDay(row.end)}` : monthDay(row.start);
  return emp ? `${emp} · ${when}` : when;
}

function noteMeta(row: CallOffLogEntry, emp: string): string {
  const reason = row.reason.trim();
  return emp ? `${emp} · ${reason}` : reason;
}

function pillClass(row: CallOffLogEntry): string {
  const category = kindForLogEntry(row);
  if (category === "note") return "calloffs-kind calloffs-note-pill";
  return `calloffs-kind calloff-chip calloff-chip-${category}`;
}

export function CallOffsScreen() {
  const today = chicagoToday();
  const yesterday = previousWorkingDay(today);
  const { rows, cloud, error, addRow, removeRow } = useCallOffLog();
  const { store: roster } = useDriverRoster();
  const gone = useDriverGone();
  const [filter, setFilter] = useState<FilterId>("all");
  const [name, setName] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("P-Day");
  const [formError, setFormError] = useState<string | null>(null);
  const customNote = reason.trim() !== "" && kindForLogEntry({ reason }) === "note";

  const empMaps = useMemo(() => {
    const byExact = new Map<string, string>();
    const byLastFirst = new Map<string, string>();
    const remember = (label: string, emp: string | null | undefined) => {
      const number = (emp ?? "").trim();
      if (!number) return;
      const exact = nameKey(label);
      if (!exact) return;
      if (!byExact.has(exact)) byExact.set(exact, number);
      const flip = lastFirstKey(label);
      if (flip && !byLastFirst.has(flip)) byLastFirst.set(flip, number);
    };
    for (const entry of Object.values(roster.entries)) {
      if (entry.kind !== "full") continue;
      remember(entry.name, entry.truckNumber);
    }
    for (const entry of Object.values(gone.store.entries)) {
      remember(entry.name, entry.employeeNumber);
    }
    return { byExact, byLastFirst };
  }, [gone.store.entries, roster.entries]);

  const cutoff = addDays(today, -30);
  const activeRows = useMemo(
    () => rows.filter((row) => callOffLogRowVisible(row, "all", today, yesterday, cutoff)),
    [rows, cutoff, today, yesterday],
  );

  const visible = useMemo(
    () =>
      rows
        .filter((row) => callOffLogRowVisible(row, filter, today, yesterday, cutoff))
        .slice()
        .sort((a, b) => compareSheet(a, b, today)),
    [rows, filter, today, yesterday, cutoff],
  );

  const todayRows = useMemo(
    () => rows.filter((row) => coversDay(row, today)),
    [rows, today],
  );
  const offToday = todayRows.filter((row) => logEntrySubtracts(row));
  const noteToday = todayRows.filter((row) => !logEntrySubtracts(row));
  const todayCount = offToday.length;

  const offGroups = OFF_TODAY_KINDS.flatMap((kind) => {
    const grouped = offToday
      .filter((row) => kindForLogEntry(row) === kind)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    return grouped.length ? [{ kind, rows: grouped }] : [];
  });

  const notes = noteToday.slice().sort((a, b) => a.name.localeCompare(b.name));

  function empFor(row: CallOffLogEntry): string {
    return lookupEmpNumber(row.name, empMaps.byExact, empMaps.byLastFirst);
  }

  async function onAdd() {
    if (!name.trim()) {
      setFormError("Enter a Full Roster driver name.");
      return;
    }
    if (!start) {
      setFormError("Pick a call-off date.");
      return;
    }
    const entry = await addRow({ name, start, end: end || null, reason });
    if (!entry) {
      setFormError("Could not save that row.");
      return;
    }
    setName("");
    setEnd("");
    setReason("P-Day");
    setFormError(null);
  }

  return (
    <div className="screen calloffs-screen">
      <header className="page-header">
        <div>
          <p className="eyebrow">Dispatcher log</p>
          <h1 className="page-title">Call-Off's</h1>
        </div>
        <p className="field-hint tight">
          {formatHeaderDate(today)} · {todayCount} off today
          {cloud ? " · synced" : " · this device"}
        </p>
      </header>

      <form
        className="calloffs-add"
        onSubmit={(event) => {
          event.preventDefault();
          void onAdd();
        }}
      >
        <div className="calloffs-add-grid">
          <DriverNameInput value={name} onChange={setName} placeholder="Driver name" aria-label="Driver name" />
          <input className="text-input" type="date" value={start} onChange={(event) => setStart(event.target.value)} aria-label="Call off date" />
          <input className="text-input" type="date" value={end} onChange={(event) => setEnd(event.target.value)} aria-label="Through date" />
          <input
            className="text-input calloffs-reason-input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason"
            aria-label="Reason"
          />
          <button type="submit" className="calloffs-add-btn">Add row</button>
        </div>

        <div className="calloffs-reason-row" role="group" aria-label="Reason presets">
          {CALL_OFF_REASON_PRESETS.map((item) => {
            const selected = reason === item;
            return (
              <button
                key={item}
                type="button"
                className={`calloff-kind-btn ${presetClass(item)}${selected ? " selected" : ""}`}
                aria-pressed={selected}
                onClick={() => setReason(item)}
              >
                {item}
              </button>
            );
          })}
        </div>

        {customNote ? (
          <p className="calloffs-hint">
            Custom reason saves as Notes only and does not subtract. Start with a chip (e.g. "Call Off, sick") to subtract.
          </p>
        ) : null}

        {formError ? <p className="form-error">{formError}</p> : null}
      </form>

      <div className="calloffs-split">
        <aside className="calloffs-board" aria-label="Off today">
          <div className="calloffs-board-head">
            <h2>Off today</h2>
            <span className="num">{todayCount}</span>
          </div>
          <p className="calloffs-hint">These subtract from Available.</p>
          {offGroups.length ? (
            offGroups.map((group) => (
              <section key={group.kind} className="calloffs-group">
                <div className={`calloffs-group-label kind-${group.kind}`}>
                  <span>{KIND_TITLE[group.kind]}</span>
                  <span>{group.rows.length}</span>
                </div>
                {group.rows.map((row) => (
                  <div key={row.id} className="calloffs-person">
                    <b>{row.name}</b>
                    <span>{offMeta(row, empFor(row))}</span>
                  </div>
                ))}
              </section>
            ))
          ) : (
            <p className="calloffs-hint">Nobody subtracting today.</p>
          )}

          <div className="calloffs-board-head calloffs-board-next">
            <h2>Still available</h2>
            <span className="num">{notes.length}</span>
          </div>
          <p className="calloffs-hint">Late, park-by, and custom notes stay on the log. They do not subtract.</p>
          {notes.length ? (
            <section className="calloffs-group">
              <div className="calloffs-group-label kind-late-early">
                <span>Notes only</span>
                <span>{notes.length}</span>
              </div>
              {notes.map((row) => (
                <div key={row.id} className="calloffs-person">
                  <b>{row.name}</b>
                  <span>{noteMeta(row, empFor(row))}</span>
                </div>
              ))}
            </section>
          ) : (
            <p className="calloffs-hint">No notes today.</p>
          )}
        </aside>

        <section className="calloffs-log" aria-label="Call-off sheet">
          <div className="calloffs-log-head">
            <h2>Sheet <span>{visible.length} row{visible.length === 1 ? "" : "s"}</span></h2>
            <div className="vac-year-row" role="tablist" aria-label="Call-off filter">
              {(
                [
                  ["all", `All (${activeRows.length})`],
                  ["upcoming", "Upcoming"],
                  ["today", `Today (${formatSheetStyleDate(today)})`],
                  ["yesterday", `Yesterday (${formatSheetStyleDate(yesterday)})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={filter === id ? "day-chip day-chip-active" : "day-chip"}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {error ? <p className="calloffs-hint">{error}</p> : null}
          <div className="calloffs-table-wrap">
            <table className="calloffs-table">
              <thead>
                <tr>
                  <th className="calloffs-emp">EMP #</th>
                  <th>Name</th>
                  <th>Call Off</th>
                  <th>Through Date</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <SheetRow
                    key={row.id}
                    row={row}
                    emp={empFor(row)}
                    today={today}
                    onRemove={() => void removeRow(row.id)}
                  />
                ))}
                {!visible.length ? (
                  <tr>
                    <td colSpan={6}>
                      <p className="oot-empty">No rows yet. Add a driver above to start the log.</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function SheetRow({
  row,
  emp,
  today,
  onRemove,
}: {
  row: CallOffLogEntry;
  emp: string;
  today: string;
  onRemove: () => void;
}) {
  const last = row.end ?? row.start;
  const current = row.start <= today && last >= today;
  const past = last < today;

  return (
    <tr className={current ? "is-today" : past ? "is-past" : undefined}>
      <td className="calloffs-emp">{emp || "—"}</td>
      <td>{row.name}</td>
      <td>{formatSheetStyleDate(row.start)}</td>
      <td>{row.end ? formatSheetStyleDate(row.end) : ""}</td>
      <td>
        <span className={pillClass(row)}>{row.reason}</span>
      </td>
      <td className="calloffs-actions">
        <button type="button" className="calloff-remove" onClick={onRemove} aria-label={`Remove ${row.name}`}>×</button>
      </td>
    </tr>
  );
}
