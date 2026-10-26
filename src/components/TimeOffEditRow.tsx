import { useState } from "react";
import "../screens/calloffs-screen.css";
import { CALL_OFF_REASON_PRESETS, kindForLogEntry } from "../lib/callOffLog";
import { formatTimeOffDays, formatTimeOffWhen, type DriverTimeOffRow } from "../lib/driverSearch";

export type TimeOffPatch = { start: string; end: string; reason: string };

const REASONS: string[] = ["Vacation", ...CALL_OFF_REASON_PRESETS];

/** One row of the driver file's Time off table, with Edit / Delete (1.1.49). */
export function TimeOffEditRow({
  row,
  today,
  onSave,
  onDelete,
}: {
  row: DriverTimeOffRow;
  today: string;
  onSave: (patch: TimeOffPatch) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(row.start);
  const [end, setEnd] = useState(row.end);
  const [reason, setReason] = useState(row.reason);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function begin() {
    setStart(row.start);
    setEnd(row.end);
    setReason(row.reason);
    setErr(null);
    setEditing(true);
  }

  async function save() {
    if (!start) return setErr("Pick a start date.");
    const last = end || start;
    if (last < start) return setErr("End is before start.");
    if (!reason.trim()) return setErr("Pick a reason.");
    setBusy(true);
    try {
      await onSave({ start, end: last, reason: reason.trim() });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const when = formatTimeOffWhen(row.start, row.end);
    if (!window.confirm(`Delete ${row.reason} (${when})? This removes it on every desk.`)) return;
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <tr className="calloffs-editing">
        <td colSpan={4}>
          <div className="timeoff-edit">
            <input className="text-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start date" />
            <input className="text-input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Through date" />
            <div className="calloffs-reason-row" role="group" aria-label="Reason">
              {REASONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`calloff-kind-btn calloff-kind-${kindForLogEntry({ reason: item })}${reason === item ? " selected" : ""}`}
                  aria-pressed={reason === item}
                  onClick={() => setReason(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="calloffs-actions">
              <button type="button" className="calloff-save" disabled={busy} onClick={() => void save()}>Save</button>
              <button type="button" className="calloff-cancel" onClick={() => setEditing(false)}>Cancel</button>
            </div>
            {err ? <p className="form-error">{err}</p> : null}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{formatTimeOffWhen(row.start, row.end)}</td>
      <td>
        <span className={`tag calloff-chip calloff-chip-${row.kind}`}>{row.reason}</span>
      </td>
      <td>{formatTimeOffDays(row.start, row.end, today)}</td>
      <td className="calloffs-actions">
        <button type="button" className="calloff-edit" disabled={busy} onClick={begin} title="Edit" aria-label={`Edit ${row.reason}`}>{"\u270E"}</button>
        <button type="button" className="calloff-remove" disabled={busy} onClick={() => void remove()} title="Delete" aria-label={`Delete ${row.reason}`}>{"\u00D7"}</button>
      </td>
    </tr>
  );
}