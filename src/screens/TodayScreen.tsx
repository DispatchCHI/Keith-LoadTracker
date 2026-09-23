import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { dailyCounts } from "../lib/analytics";
import { displayLoadCount } from "../lib/dailyEod";
import {
  chicagoToday,
  formatHeaderDate,
  weekStartingSunday,
} from "../lib/chicagoDate";
import { sortLoadsNewestFirst } from "../lib/sortLoads";
import { useDailyEod } from "../store/DailyEodContext";
import { useDrivers } from "../store/DriversContext";
import { useLoads } from "../store/LoadsContext";
import { BrandMark } from "../components/BrandMark";
import { DayPicker } from "../components/DayPicker";
import { DriversCard } from "../components/DriversCard";
import { StationCallsCard } from "../components/StationCallsCard";
import { SpecialtyBoardCard } from "../components/SpecialtyBoardCard";
import { DispatchTalliesRow } from "../components/DispatchTalliesRow";
import { EodReportButton } from "../components/EodReportButton";
import { LoadRow } from "../components/LoadRow";

function scrollParentFor(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

type TodayScreenProps = {
  date: string;
  onDateChange: (iso: string) => void;
  justEditedId: string | null;
  onLog: (date: string) => void;
  onNotes: (date: string) => void;
  onEdit: (id: string) => void;
  showDayPicker?: boolean;
};

export function TodayScreen({
  date,
  onDateChange,
  justEditedId,
  onLog,
  onNotes,
  onEdit,
  showDayPicker = false,
}: TodayScreenProps) {
  const today = chicagoToday();
  const { loads, loadsOn } = useLoads();
  const { totalsOn } = useDailyEod();
  const { availabilityOn } = useDrivers();
  const dayLoads = useMemo(() => sortLoadsNewestFirst(loadsOn(date)), [date, loadsOn]);
  const snapshot = totalsOn(date);
  const viewingToday = date === today;
  const [loadsOpen, setLoadsOpen] = useState(false);
  const dayLoadsBlockRef = useRef<HTMLElement | null>(null);
  const pinDayLoadsTopRef = useRef(false);

  useEffect(() => {
    setLoadsOpen(false);
  }, [date]);

  useLayoutEffect(() => {
    if (!loadsOpen || !pinDayLoadsTopRef.current) return;
    pinDayLoadsTopRef.current = false;
    const el = dayLoadsBlockRef.current;
    if (!el) return;
    const pad = 8;
    const scroller = scrollParentFor(el);
    if (scroller) {
      const delta =
        el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - pad;
      scroller.scrollTop += delta;
    } else {
      window.scrollBy(0, el.getBoundingClientRect().top - pad);
    }
  }, [loadsOpen]);

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of dailyCounts(loads, weekStartingSunday(date))) {
      map.set(row.date, displayLoadCount(row.count, totalsOn(row.date)));
    }
    return map;
  }, [loads, date, totalsOn]);

  const loadWord = dayLoads.length === 1 ? "load" : "loads";
  const msWDispatchedToday = useMemo(() => {
    const counts = { batavia: 0, evanston: 0, hooker: 0 };
    for (const load of dayLoads) {
      if (load.commodity !== "Trash (MSW)") continue;
      const pickup = load.pickup.trim().toLowerCase();
      if (pickup === "batavia") counts.batavia += 1;
      else if (pickup === "evanston") counts.evanston += 1;
      else if (pickup === "hooker street" || pickup === "hooker") counts.hooker += 1;
    }
    return counts;
  }, [dayLoads]);

  return (
    <div className="screen">
      <header className="page-header">
        <div className="page-header-brand">
          <BrandMark />
          <div>
            <p className="eyebrow">Load Tracker</p>
            <h1 className="page-title">{formatHeaderDate(date)}</h1>
          </div>
        </div>
        {justEditedId ? <span className="updated-badge">Updated</span> : null}
      </header>

      {showDayPicker ? (
        <DayPicker
          date={date}
          onChange={onDateChange}
          loadCountFor={(iso) => countByDate.get(iso) ?? 0}
          driverCountFor={(iso) => availabilityOn(iso)?.available ?? null}
        />
      ) : !viewingToday ? (
        <button type="button" className="text-btn amber" onClick={() => onDateChange(today)}>
          Jump to today
        </button>
      ) : null}

      <DriversCard compact collapsible date={date} loadCount={displayLoadCount(dayLoads.length, snapshot)} />

      <div className="log-load-row">
        <div className="log-load-actions">
          <button type="button" className="log-load-top" onClick={() => onLog(date)}>
            + Log load
          </button>
          <button type="button" className="log-load-top notes-top" onClick={() => onNotes(date)}>
            Notes
          </button>
          <EodReportButton date={date} />
        </div>
        <DispatchTalliesRow
          date={date}
          bataviaDispatchedToday={msWDispatchedToday.batavia}
          evanstonDispatchedToday={msWDispatchedToday.evanston}
          hookerDispatchedToday={msWDispatchedToday.hooker}
        />
      </div>

      <StationCallsCard date={date} />

      <SpecialtyBoardCard date={date} />

      {justEditedId ? (
        <p className="recalc-note">
          Totals recalculate after every edit. Same load, new facts.
        </p>
      ) : null}

      {dayLoads.length === 0 ? (
        <div className="empty">
          <h2>No loads {viewingToday ? "yet today" : `on ${formatHeaderDate(date)}`}</h2>
          <p>
            Log the first haul for this Chicago calendar day with + Log load
            above. You can keep adding more without losing this date. Use the
            week list to change days.
          </p>
        </div>
      ) : (
        <section
          ref={dayLoadsBlockRef}
          className={
            loadsOpen ? "totals-block day-loads-block" : "totals-block day-loads-block totals-block-collapsed"
          }
        >
          <button
            type="button"
            className="totals-toggle"
            aria-expanded={loadsOpen}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={() => {
              setLoadsOpen((v) => {
                if (!v) pinDayLoadsTopRef.current = true;
                return !v;
              });
            }}
          >
            <span className="totals-toggle-copy">
              <span className="totals-toggle-title">Day loads</span>
              <span className="totals-toggle-count">
                {dayLoads.length} {loadWord}
                {loadsOpen ? "" : " · tap to expand"}
              </span>
            </span>
            <ChevronDown
              size={18}
              className={loadsOpen ? "totals-chevron open" : "totals-chevron"}
              aria-hidden
            />
          </button>
          {loadsOpen ? (
            <div className="feed day-loads-feed">
              {dayLoads.map((load) => (
                <LoadRow
                  key={load.id}
                  load={load}
                  onEdit={() => onEdit(load.id)}
                  highlight={load.id === justEditedId ? "just-edited" : null}
                />
              ))}
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
