import { useMemo } from "react";
import { logEntrySubtracts } from "../lib/callOffLog";
import { useCallOffLog } from "../store/CallOffLogContext";

/** "Notes, parked by 10am" → "parked by 10am"; custom text stays as typed. */
export function tickerNoteText(reason: string): string {
  return reason.replace(/^\s*notes?\b[\s,:;.\-–—]*/i, "").trim();
}

/** Scrolling strip of the day's Notes-only Call-Off entries (Today page header). */
export function CallOffNotesTicker({ date }: { date: string }) {
  const { rows } = useCallOffLog();
  const items = useMemo(
    () =>
      rows
        .filter((row) => row.start <= date && (row.end ?? row.start) >= date)
        .filter((row) => !logEntrySubtracts(row))
        .map((row) => {
          const text = tickerNoteText(row.reason);
          return { id: row.id, label: text ? `${row.name}: ${text}` : row.name };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    [rows, date],
  );
  if (!items.length) return null;
  // ~6s per item keeps the speed readable however many notes there are.
  const seconds = Math.max(18, items.length * 7);
  const strip = (hidden: boolean) => (
    <span className="notes-ticker-strip" aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <span key={item.id} className="notes-ticker-item">
          {item.label}
        </span>
      ))}
    </span>
  );
  return (
    <div className="notes-ticker" role="marquee" aria-label="Today's notes">
      <span className="notes-ticker-tag">Notes</span>
      <div className="notes-ticker-window">
        <div className="notes-ticker-track" style={{ animationDuration: `${seconds}s` }}>
          {strip(false)}
          {strip(true)}
        </div>
      </div>
    </div>
  );
}
