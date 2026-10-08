import { useMemo, useState } from "react";
import { CollapsibleRank } from "../components/CollapsibleRank";
import { DayPicker } from "../components/DayPicker";
import { LoadRow } from "../components/LoadRow";
import { dailyCounts } from "../lib/analytics";
import {
  applyDailyEodToSummary,
  displayLoadCount,
  isSheetEodCard,
} from "../lib/dailyEod";
import {
  chicagoToday,
  formatHeaderDate,
  formatShortDate,
  weekStartingSunday,
} from "../lib/chicagoDate";
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
import { useCustomerLanes } from "../store/CustomerLanesContext";
import { useDailyEod } from "../store/DailyEodContext";
import { useDrivers } from "../store/DriversContext";
import { useLoads } from "../store/LoadsContext";

type TotalsScreenProps = {
  date: string;
  onDateChange: (iso: string) => void;
  onEdit: (id: string) => void;
  onLog: (date: string) => void;
  embedded?: boolean;
};

export function TotalsScreen({
  date,
  onDateChange,
  onEdit,
  onLog,
  embedded = false,
}: TotalsScreenProps) {
  const today = chicagoToday();
  const { loads, loadsOn, exportCsv, hasSampleLoads, clearSampleLoads } = useLoads();
  const { totalsOn } = useDailyEod();
  const { availabilityOn } = useDrivers();
  const { store: customerLanes } = useCustomerLanes();
  const knownCustomers = useMemo(() => customerNames(customerLanes), [customerLanes]);
  const [filter, setFilter] = useState<TotalsFilter | null>(null);
  const snapshot = totalsOn(date);

  const dayLoads = loadsOn(date);
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

  const matching = filter ? rankAccordionLoads(dayLoads, filter) : [];
  const dayPhrase = date === today ? "today" : `on ${formatShortDate(date)}`;

  const toggle = (next: TotalsFilter) => {
    setFilter((prev) =>
      prev && prev.kind === next.kind && prev.key === next.key ? null : next,
    );
  };

  const changeDate = (iso: string) => {
    onDateChange(iso);
    setFilter(null);
  };

  return (
    <div className={embedded ? "screen screen-panel totals-sheet" : "screen"}>
      {embedded ? (
        <div className="sheet-top">
          <p className="eyebrow">Day totals</p>
          <label className="date-pick sheet-cal">
            <input
              type="date"
              value={date}
              aria-label="Calendar"
              onChange={(event) => {
                if (event.target.value) changeDate(event.target.value);
              }}
            />
          </label>
        </div>
      ) : (
        <header className="page-header">
          <div className="page-header-brand">
            <div>
              <p className="eyebrow">Day totals</p>
              <h1 className="page-title">{formatHeaderDate(date)}</h1>
            </div>
          </div>
          <button
            type="button"
            className="text-btn amber"
            onClick={() => exportCsv(date)}
            disabled={dayLoads.length === 0}
          >
            Export CSV
          </button>
        </header>
      )}

      <DayPicker
        date={date}
        onChange={changeDate}
        variant={embedded ? "sheet" : "default"}
        showCalendar={!embedded}
        loadCountFor={(iso) => countByDate.get(iso) ?? 0}
        driverCountFor={(iso) => availabilityOn(iso)?.available ?? null}
      />

      <section className="eod-block">
        {embedded ? null : (
          <div className="eod-head">
            <h2 className="section-title">End of day</h2>
          </div>
        )}
        <div className="eod-stat-row">
          {endOfDayCards(eod).map((card) => {
            const fromSheet = Boolean(snapshot) && isSheetEodCard(card.key);
            const label = embedded && card.key === "walking-floor" ? "WF" : card.label;
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
                <span className="eod-stat-label">{label}</span>
                <span className="eod-stat-value">{card.count}</span>
              </article>
            );
          })}
        </div>
      </section>

      {dayLoads.length === 0 ? (
        <div className="empty compact">
          <h2>No loads {dayPhrase}</h2>
          <p>
            {snapshot
              ? "TRASH / LEACHATE / WF / LOADS / SUBS come from the Dispatch Board sheet. Log a haul if you want truck rows too."
              : "Log a haul and these rankings fill in live."}
          </p>
          <button type="button" className="btn-primary" onClick={() => onLog(date)}>
            + Log load
          </button>
        </div>
      ) : (
        <>
          <CollapsibleRank
            title="Transfer station"
            hint={
              embedded
                ? "tap a row · custom stays tagged"
                : "Pickup location. Custom sites are tagged. Tap a row to expand those loads under it."
            }
            rows={byPickup}
            filterKind="pickup"
            active={filter}
            onSelect={toggle}
            defaultOpen
            compact
            columns={2}
            layout={embedded ? "sheet" : "cards"}
            emptyText="Nothing logged this day."
            expandedPanel={
              filter?.kind === "pickup" ? (
                <RankLoadList loads={matching} onEdit={onEdit} checkoff />
              ) : null
            }
          />
          <CollapsibleRank
            title="Landfill"
            hint={
              embedded
                ? "delivery sites · tap to open"
                : "Delivery / destination. Tap a row to expand those loads under it."
            }
            rows={byDestination}
            filterKind="destination"
            active={filter}
            onSelect={toggle}
            defaultOpen={false}
            compact
            columns={2}
            layout={embedded ? "sheet" : "cards"}
            emptyText="Nothing logged this day."
            expandedPanel={
              filter?.kind === "destination" ? (
                <RankLoadList loads={matching} onEdit={onEdit} />
              ) : null
            }
          />
          <CollapsibleRank
            title="Commodity"
            hint={
              embedded
                ? "trash, leachate, and the rest · tap to open"
                : "Trash, recycle, yard, wood, leachate, and the rest."
            }
            rows={byCommodity}
            filterKind="commodity"
            active={filter}
            onSelect={toggle}
            defaultOpen={false}
            compact
            columns={2}
            layout={embedded ? "sheet" : "cards"}
            emptyText="Nothing logged this day."
            expandedPanel={
              filter?.kind === "commodity" ? (
                <RankLoadList loads={matching} onEdit={onEdit} />
              ) : null
            }
          />

          {!embedded && !filter ? (
            <p className="field-hint">Tap a row to list those loads under it.</p>
          ) : null}

          {embedded ? null : (
            <button type="button" className="btn-primary" onClick={() => onLog(date)}>
              + Log load
            </button>
          )}
        </>
      )}

      {!embedded && hasSampleLoads ? (
        <button
          type="button"
          className="text-btn danger block-btn"
          onClick={clearSampleLoads}
        >
          Clear sample loads
        </button>
      ) : null}
    </div>
  );
}

function RankLoadList({
  loads,
  onEdit,
  checkoff = false,
}: {
  loads: ReturnType<typeof rankAccordionLoads>;
  onEdit: (id: string) => void;
  /** Click a load card to mark it while comparing against a spreadsheet. */
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
            checkoff
              ? () => setCheckedIds(toggleCheckedLoad(load.id))
              : undefined
          }
          onEdit={() => onEdit(load.id)}
        />
      ))}
    </div>
  );
}
