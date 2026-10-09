import { useMemo, useState, type ReactNode } from "react";
import { dailyCounts } from "../lib/analytics";
import { applyDailyEodToSummary, displayLoadCount, isSheetEodCard } from "../lib/dailyEod";
import { formatHeaderDate, weekStartingSunday } from "../lib/chicagoDate";
import { notesButtonAriaLabel, notesButtonClassName } from "../lib/dayNotes";
import { readCheckedLoadIds, toggleCheckedLoad } from "../lib/loadCheckoff";
import {
  endOfDayCards,
  endOfDaySummary,
  rankAccordionLoads,
  rankCommodities,
  rankDestinations,
  rankPickups,
  type TotalsFilter,
} from "../lib/totals";
import { customerNames } from "../lib/customerLanes";
import { useDesktopLayout } from "../lib/layout";
import { DayPicker } from "../components/DayPicker";
import { DispatchTalliesRow } from "../components/DispatchTalliesRow";
import { DriversCard } from "../components/DriversCard";
import { EodReportButton } from "../components/EodReportButton";
import { LoadRow } from "../components/LoadRow";
import { CollapsibleRank } from "../components/CollapsibleRank";
import { SpecialtyBoardCard } from "../components/SpecialtyBoardCard";
import { StationCallsCard } from "../components/StationCallsCard";
import { useCustomerLanes } from "../store/CustomerLanesContext";
import { useDailyEod } from "../store/DailyEodContext";
import { useDayNotes } from "../store/DayNotesContext";
import { useDrivers } from "../store/DriversContext";
import { useLoads } from "../store/LoadsContext";
import "./yard-desk.css";

type YardDeskScreenProps = {
  date: string;
  onDateChange: (iso: string) => void;
  justEditedId: string | null;
  onLog: (date: string) => void;
  onNotes: (date: string) => void;
  onEdit: (id: string) => void;
  skinToggle?: ReactNode;
};

export function YardDeskScreen({
  date,
  onDateChange,
  justEditedId,
  onLog,
  onNotes,
  onEdit,
  skinToggle,
}: YardDeskScreenProps) {
  const desktop = useDesktopLayout();
  const { loads, loadsOn } = useLoads();
  const { notesAffordance } = useDayNotes();
  const notesState = notesAffordance(date);
  const { totalsOn } = useDailyEod();
  const { availabilityOn } = useDrivers();
  const { store: customerLanes } = useCustomerLanes();
  const knownCustomers = useMemo(() => customerNames(customerLanes), [customerLanes]);
  const dayLoads = useMemo(() => loadsOn(date), [date, loadsOn]);
  const snapshot = totalsOn(date);
  const [pickupKey, setPickupKey] = useState<string | null>(null);
  const [landfillKey, setLandfillKey] = useState<string | null>(null);
  const [commodityKey, setCommodityKey] = useState<string | null>(null);

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of dailyCounts(loads, weekStartingSunday(date))) {
      map.set(row.date, displayLoadCount(row.count, totalsOn(row.date)));
    }
    return map;
  }, [loads, date, totalsOn]);

  const byPickup = useMemo(
    () => rankPickups(dayLoads, knownCustomers),
    [dayLoads, knownCustomers],
  );
  const byDestination = useMemo(() => rankDestinations(dayLoads), [dayLoads]);
  const byCommodity = useMemo(() => rankCommodities(dayLoads), [dayLoads]);
  const eod = useMemo(
    () => applyDailyEodToSummary(endOfDaySummary(dayLoads, {}), snapshot),
    [dayLoads, snapshot],
  );

  const pickupFilter: TotalsFilter | null = pickupKey
    ? { kind: "pickup", key: pickupKey }
    : null;
  const landfillFilter: TotalsFilter | null = landfillKey
    ? { kind: "destination", key: landfillKey }
    : null;
  const commodityFilter: TotalsFilter | null = commodityKey
    ? { kind: "commodity", key: commodityKey }
    : null;

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

  const changeDate = (iso: string) => {
    onDateChange(iso);
    setPickupKey(null);
    setLandfillKey(null);
    setCommodityKey(null);
  };

  const toggleKey = (
    current: string | null,
    set: (key: string | null) => void,
    next: TotalsFilter,
  ) => {
    set(current === next.key ? null : next.key);
  };

  return (
    <div className="screen yard-desk">
      <div className="yard-toolbar">
        <div className="yard-date">
          <div>
            <p className="eyebrow">Chicago</p>
            <h1 className="page-title">{formatHeaderDate(date)}</h1>
          </div>
          {skinToggle}
        </div>
        <DayPicker
          date={date}
          onChange={changeDate}
          loadCountFor={(iso) => countByDate.get(iso) ?? 0}
          driverCountFor={(iso) => availabilityOn(iso)?.available ?? null}
        />
        <div className="yard-actions">
          <button type="button" className="log-load-top" onClick={() => onLog(date)}>
            + Log load
          </button>
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
          {justEditedId ? <span className="updated-badge">Updated</span> : null}
        </div>
        <div className="eod-stat-row yard-eod">
          {endOfDayCards(eod).map((card) => {
            const fromSheet = Boolean(snapshot) && isSheetEodCard(card.key);
            return (
              <article
                key={card.key}
                className={[
                  card.emphasis ? "eod-stat eod-stat-loads" : "eod-stat",
                  fromSheet ? "eod-stat-sheet" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="eod-stat-label">{card.label}</span>
                <span className="eod-stat-value">{card.count}</span>
              </article>
            );
          })}
        </div>
      </div>

      <div className="yard-work">
        <div className="yard-col yard-side">
          <DriversCard
            compact
            collapsible
            date={date}
            loadCount={displayLoadCount(dayLoads.length, snapshot)}
          />
          <DispatchTalliesRow
            date={date}
            bataviaDispatchedToday={msWDispatchedToday.batavia}
            evanstonDispatchedToday={msWDispatchedToday.evanston}
            hookerDispatchedToday={msWDispatchedToday.hooker}
          />
        </div>

        <div className="yard-col">
          <CollapsibleRank
            title="Transfer stations"
            hint="Tap a site · custom stays tagged"
            rows={byPickup}
            filterKind="pickup"
            active={pickupFilter}
            onSelect={(next) => toggleKey(pickupKey, setPickupKey, next)}
            defaultOpen
            compact
            columns={desktop ? 2 : 1}
            layout="sheet"
            emptyText="Nothing logged this day."
            expandedPanel={
              pickupFilter ? (
                <RankLoads
                  loads={rankAccordionLoads(dayLoads, pickupFilter)}
                  onEdit={onEdit}
                  checkoff
                />
              ) : null
            }
          />
        </div>

        <div className="yard-col">
          <CollapsibleRank
            title="Landfill"
            hint="Tap to open"
            rows={byDestination}
            filterKind="destination"
            active={landfillFilter}
            onSelect={(next) => toggleKey(landfillKey, setLandfillKey, next)}
            defaultOpen
            compact
            columns={1}
            layout="sheet"
            emptyText="Nothing logged this day."
            expandedPanel={
              landfillFilter ? (
                <RankLoads
                  loads={rankAccordionLoads(dayLoads, landfillFilter)}
                  onEdit={onEdit}
                />
              ) : null
            }
          />
          <CollapsibleRank
            title="Commodity"
            hint="Tap to open"
            rows={byCommodity}
            filterKind="commodity"
            active={commodityFilter}
            onSelect={(next) => toggleKey(commodityKey, setCommodityKey, next)}
            defaultOpen
            compact
            columns={1}
            layout="sheet"
            emptyText="Nothing logged this day."
            expandedPanel={
              commodityFilter ? (
                <RankLoads
                  loads={rankAccordionLoads(dayLoads, commodityFilter)}
                  onEdit={onEdit}
                />
              ) : null
            }
          />
        </div>
      </div>

      <SpecialtyBoardCard date={date} />
      <StationCallsCard date={date} />
    </div>
  );
}

function RankLoads({
  loads,
  onEdit,
  checkoff = false,
}: {
  loads: ReturnType<typeof rankAccordionLoads>;
  onEdit: (id: string) => void;
  checkoff?: boolean;
}) {
  const [checkedIds, setCheckedIds] = useState(() => readCheckedLoadIds());

  if (loads.length === 0) {
    return <p className="field-hint">No loads in this group.</p>;
  }
  return (
    <div className="feed rank-accordion-feed">
      {checkoff ? (
        <p className="field-hint tight">
          Click a load to shade the card. Click it again to clear it.
        </p>
      ) : null}
      {loads.map((load) => (
        <LoadRow
          key={load.id}
          load={load}
          checked={checkoff && checkedIds.has(load.id)}
          onToggleCheck={
            checkoff ? () => setCheckedIds(toggleCheckedLoad(load.id)) : undefined
          }
          onEdit={() => onEdit(load.id)}
        />
      ))}
    </div>
  );
}
