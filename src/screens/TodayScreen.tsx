import { useMemo } from "react";
import { dailyCounts } from "../lib/analytics";
import { displayLoadCount } from "../lib/dailyEod";
import {
  chicagoToday,
  formatHeaderDate,
  weekStartingSunday,
} from "../lib/chicagoDate";
import { sortLoadsNewestFirst } from "../lib/sortLoads";
import {
  notesButtonAriaLabel,
  notesButtonClassName,
} from "../lib/dayNotes";
import { useDailyEod } from "../store/DailyEodContext";
import { useDayNotes } from "../store/DayNotesContext";
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
  const { notesAffordance } = useDayNotes();
  const notesState = notesAffordance(date);
  const { totalsOn } = useDailyEod();
  const { availabilityOn } = useDrivers();
  const dayLoads = useMemo(() => sortLoadsNewestFirst(loadsOn(date)), [date, loadsOn]);
  const snapshot = totalsOn(date);
  const viewingToday = date === today;

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of dailyCounts(loads, weekStartingSunday(date))) {
      map.set(row.date, displayLoadCount(row.count, totalsOn(row.date)));
    }
    return map;
  }, [loads, date, totalsOn]);

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
        <button type="button" className="text-btn" onClick={() => onDateChange(today)}>
          Jump to today
        </button>
      ) : null}

      <button type="button" className="log-a-load" onClick={() => onLog(date)}>
        Log a load
      </button>

      {dayLoads.length === 0 ? (
        <div className="empty">
          <h2>No loads yet</h2>
        </div>
      ) : (
        <div className="feed">
          {dayLoads.map((load) => (
            <LoadRow
              key={load.id}
              load={load}
              onEdit={() => onEdit(load.id)}
              highlight={load.id === justEditedId ? "just-edited" : null}
            />
          ))}
        </div>
      )}

      {justEditedId ? (
        <p className="recalc-note">
          Totals recalculate after every edit. Same load, new facts.
        </p>
      ) : null}

      <div className="today-tools">
        <button
          type="button"
          className={notesButtonClassName(notesState)}
          data-notes-state={notesState}
          aria-label={notesButtonAriaLabel(notesState)}
          onClick={() => onNotes(date)}
        >
          Notes
        </button>
        <EodReportButton date={date} />
      </div>

      <DriversCard compact collapsible date={date} loadCount={displayLoadCount(dayLoads.length, snapshot)} />

      <DispatchTalliesRow
        date={date}
        bataviaDispatchedToday={msWDispatchedToday.batavia}
        evanstonDispatchedToday={msWDispatchedToday.evanston}
        hookerDispatchedToday={msWDispatchedToday.hooker}
      />

      <StationCallsCard date={date} />

      <SpecialtyBoardCard date={date} />
    </div>
  );
}
