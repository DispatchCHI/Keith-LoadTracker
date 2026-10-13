import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { logEntrySubtracts } from "../lib/callOffLog";
import { useCallOffLog } from "../store/CallOffLogContext";

const SEP = "[\\s,:;.\\-\u2013\u2014]*";
const LATE_CHIP = new RegExp(`^\\s*(late\\s*[/-]?\\s*early|late|early)\\b${SEP}`, "i");
const NOTES_CHIP = new RegExp(`^\\s*notes?\\b${SEP}`, "i");
/** Only a time / "at 7" / "til 2pm" left after the chip: routine, not a note. */
const TIME_ONLY =
  /^(?:(?:at|by|til|till|until|from|to|in|out|around|@|-)\s*)*\d{1,2}(?::\d{2})?\s*(?:a|p|am|pm|a\.m\.|p\.m\.)?\.?$/i;

/**
 * Ticker text for a Notes-only Call-Off, or null to skip it.
 * - Late/Early (or Late / Early) chip: skipped unless it carries real custom
 *   text beyond a time; then only the custom text shows.
 * - Notes chip: "Notes, parked by 10am" shows "parked by 10am".
 * - Custom typed reasons show as typed.
 */
export function tickerNoteText(reason: string): string | null {
  const raw = reason.trim();
  if (!raw) return null;
  if (LATE_CHIP.test(raw)) {
    const rest = raw.replace(LATE_CHIP, "").trim();
    if (!rest || TIME_ONLY.test(rest)) return null;
    return rest;
  }
  return raw.replace(NOTES_CHIP, "").trim();
}

/** Scrolling strip of the day's Notes-only Call-Off entries (Today page header). */
export function CallOffNotesTicker({ date }: { date: string }) {
  const { rows } = useCallOffLog();
  const items = useMemo(
    () =>
      rows
        .filter((row) => row.start <= date && (row.end ?? row.start) >= date)
        .filter((row) => !logEntrySubtracts(row))
        .flatMap((row) => {
          const text = tickerNoteText(row.reason);
          if (text === null) return [];
          return [{ id: row.id, label: text ? `${row.name}: ${text}` : row.name }];
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    [rows, date],
  );
  const windowRef = useRef<HTMLDivElement>(null);
  const unitRef = useRef<HTMLSpanElement>(null);
  const [copies, setCopies] = useState(2);
  const [unitW, setUnitW] = useState(0);
  const key = items.map((item) => item.label).join("|");

  // Repeat the strip until one "half" is at least as wide as the window, so
  // the loop always moves (even one short note) at a steady px/sec.
  useLayoutEffect(() => {
    const win = windowRef.current;
    const unit = unitRef.current;
    if (!win || !unit) return;
    const measure = () => {
      const w = unit.offsetWidth;
      const ww = win.clientWidth;
      if (!w) return;
      setUnitW(w);
      setCopies(Math.max(1, Math.ceil(ww / w)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(win);
    ro.observe(unit);
    return () => ro.disconnect();
  }, [key, items.length]);

  if (!items.length) return null;
  const PX_PER_SEC = 60;
  const half = unitW * copies;
  const seconds = half > 0 ? half / PX_PER_SEC : 20;
  const strip = (k: number, ref?: React.Ref<HTMLSpanElement>) => (
    <span key={k} ref={ref} className="notes-ticker-strip" aria-hidden={k > 0 || undefined}>
      {items.map((item) => (
        <span key={item.id} className="notes-ticker-item">
          {item.label}
        </span>
      ))}
    </span>
  );
  const strips = Array.from({ length: copies * 2 }, (_, k) => strip(k, k === 0 ? unitRef : undefined));
  return (
    <div className="notes-ticker" role="marquee" aria-label="Today's notes">
      <span className="notes-ticker-tag">Notes</span>
      <div className="notes-ticker-window" ref={windowRef}>
        <div
          key={`${key}-${copies}`}
          className="notes-ticker-track"
          style={{ animationDuration: `${seconds}s` }}
        >
          {strips}
        </div>
      </div>
    </div>
  );
}