import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  chicagoToday,
  dayNumber,
  formatShortDate,
  weekStartingSunday,
  weekdayLetter,
  weekdayMed,
  weekdayName,
} from "../lib/chicagoDate";

type DayPickerProps = {
  date: string;
  onChange: (iso: string) => void;
  showCalendar?: boolean;
  /** Compact week used on the desktop Today totals panel. */
  variant?: "default" | "sheet";
  /** Per-ISO load counts. Must be keyed by each chip's own date, never the selected date. */
  loadCountFor?: (iso: string) => number;
  /** Per-ISO locked/live driver snapshot. Null when that day has no tally. */
  driverCountFor?: (iso: string) => number | null;
};

export function DayPicker({
  date,
  onChange,
  showCalendar = true,
  variant = "default",
  loadCountFor,
  driverCountFor,
}: DayPickerProps) {
  const today = chicagoToday();
  const week = weekStartingSunday(date);
  const weekLabel = `${formatShortDate(week[0])} – ${formatShortDate(week[6])}`;

  if (variant === "sheet") {
    const loads = loadCountFor ? loadCountFor(date) : null;
    const drivers = driverCountFor ? driverCountFor(date) : null;
    const loadWord = loads === 1 ? "load" : "loads";
    return (
      <div className="day-picker day-picker-sheet">
        <div className="sheet-week">
          <button
            type="button"
            className="sheet-nav"
            aria-label="Previous week"
            onClick={() => onChange(addDays(week[0], -7))}
          >
            <ChevronLeft size={16} />
          </button>
          {week.map((iso) => (
            <button
              key={iso}
              type="button"
              className={iso === date ? "sheet-day on" : "sheet-day"}
              aria-pressed={iso === date}
              onClick={() => onChange(iso)}
            >
              <span className="n">{dayNumber(iso)}</span>
              <span className="w">{weekdayLetter(iso)}</span>
            </button>
          ))}
          <button
            type="button"
            className="sheet-nav"
            aria-label="Next week"
            onClick={() => onChange(addDays(week[0], 7))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="sheet-summary">
          <strong>{weekdayName(date)}</strong>
          {loads !== null ? <span> · {loads} {loadWord}</span> : null}
          {drivers !== null ? <span> · {drivers} drivers</span> : null}
          {date !== today ? (
            <button type="button" className="sheet-today" onClick={() => onChange(today)}>
              Jump to today
            </button>
          ) : null}
        </div>
        <div className="sheet-others">
          {week
            .filter((iso) => iso !== date)
            .map((iso) => {
              const dayLoads = loadCountFor ? loadCountFor(iso) : null;
              const dayDrivers = driverCountFor ? driverCountFor(iso) : null;
              return (
                <button key={iso} type="button" className="sheet-other" onClick={() => onChange(iso)}>
                  {weekdayMed(iso)}
                  {dayLoads !== null ? ` ${dayLoads}` : ""}
                  {dayDrivers !== null ? ` · ${dayDrivers} drv` : ""}
                </button>
              );
            })}
        </div>
      </div>
    );
  }

  return (
    <div className="day-picker">
      <div className="week-nav">
        <button
          type="button"
          className="icon-btn"
          aria-label="Previous week"
          onClick={() => onChange(addDays(week[0], -7))}
        >
          <ChevronLeft size={20} />
        </button>
        <span className="week-label">{weekLabel}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Next week"
          onClick={() => onChange(addDays(week[0], 7))}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="day-strip" role="tablist" aria-label="Day">
        {week.map((iso) => {
          const loads = loadCountFor ? loadCountFor(iso) : null;
          const drivers = driverCountFor ? driverCountFor(iso) : null;
          return (
            <button
              key={iso}
              type="button"
              className={iso === date ? "day-chip day-chip-active" : "day-chip"}
              onClick={() => onChange(iso)}
            >
              <span className="day-num">{dayNumber(iso)}</span>
              <span className="day-wd">{weekdayLetter(iso)}</span>
              {loads !== null ? (
                <span className="day-loads">
                  {loads} {loads === 1 ? "load" : "loads"}
                </span>
              ) : null}
              {drivers !== null ? (
                <span className="day-drivers">{drivers} drv</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="day-picker-row">
        {date !== today ? (
          <button
            type="button"
            className="text-btn amber"
            onClick={() => onChange(today)}
          >
            Jump to today
          </button>
        ) : (
          <span />
        )}
        {showCalendar ? (
          <label className="date-pick inline">
            Calendar
            <input
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) onChange(e.target.value);
              }}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}
