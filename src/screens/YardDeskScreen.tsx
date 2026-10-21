import { useMemo, useState, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dailyCounts } from "../lib/analytics";
import { applyDailyEodToSummary, displayLoadCount, isSheetEodCard } from "../lib/dailyEod";
import {
  addDays,
  dayNumber,
  formatCreatedStamp,
  formatHeaderDate,
  formatShortDate,
  isChicagoSunday,
  parseISODate,
  weekdayMed,
  weekStartingSunday,
} from "../lib/chicagoDate";
import { notesButtonAriaLabel, notesButtonClassName } from "../lib/dayNotes";
import { readCheckedLoadIds, toggleCheckedLoad } from "../lib/loadCheckoff";
import {
  CHECKOFF_POLL_MS,
  getCheckoffStore,
  isEvanstonPickup,
  subscribeCheckoffs,
  syncEvanstonCheckoffs,
  toggleEvanstonCheckoff,
} from "../lib/evanstonCheckoff";
import { useAuth } from "../store/AuthContext";
import {
  endOfDayCards,
  endOfDaySummary,
  isTrashOnlyRank,
  rankAccordionLoads,
  rankCommodities,
  rankDestinations,
  rankPickups,
  type RankRow,
} from "../lib/totals";
import { customerNames } from "../lib/customerLanes";
import { sortPickupsFixedOrder, transferStationCells } from "../lib/transferStationOrder";
import {
  deleteButtonLabel,
  deleteSelectedLoads,
  pruneSelection,
  toggleSelectAll,
  toggleSelectedId,
} from "../lib/loadMultiSelect";
import { CommodityTag } from "../components/CommodityTag";
import { LoadCreatorBadge, LoadEditedMark } from "../components/LoadRow";
import { CustomerTallyChips } from "../components/CustomerTallyChips";
import { DispatchTalliesRow } from "../components/DispatchTalliesRow";
import { DriversCard } from "../components/DriversCard";
import { RecentLoadsLog } from "../components/RecentLoadsLog";
import { EodReportButton } from "../components/EodReportButton";
import { SpecialtyBoardCard } from "../components/SpecialtyBoardCard";
import { StationCallsCard } from "../components/StationCallsCard";
import { useCustomerLanes } from "../store/CustomerLanesContext";
import { useDailyEod } from "../store/DailyEodContext";
import { useDayNotes } from "../store/DayNotesContext";
import { useDrivers } from "../store/DriversContext";
import { useLoads } from "../store/LoadsContext";
import type { Load } from "../types";
import "./yard-desk.css";

const EOD_LABELS: Record<string, string> = {
  trash: "Trash",
  leachate: "Leachate",
  "walking-floor": "Walking floor",
  loads: "Loads",
  subs: "Subs",
};

type YardDeskScreenProps = {
  date: string;
  onDateChange: (iso: string) => void;
  justEditedId: string | null;
  onLog: (date: string, pickup?: string) => void;
  onNotes: (date: string) => void;
  onEdit: (id: string) => void;
  /** Desktop top bar slot. When set, the band sits in that bar instead of the page. */
  topSlot?: HTMLElement | null;
  /** Keep the band out of the page until the desktop top bar slot is ready. */
  dockBand?: boolean;
};

export function YardDeskScreen({
  date,
  onDateChange,
  justEditedId,
  onLog,
  onNotes,
  onEdit,
  topSlot = null,
  dockBand = false,
}: YardDeskScreenProps) {
  const { loads, loadsOn } = useLoads();
  const { notesAffordance } = useDayNotes();
  const notesState = notesAffordance(date);
  const { totalsOn } = useDailyEod();
  const { availabilityOn } = useDrivers();
  const { store: customerLanes } = useCustomerLanes();
  const knownCustomers = useMemo(() => customerNames(customerLanes), [customerLanes]);
  const dayLoads = useMemo(() => loadsOn(date), [date, loadsOn]);
  const snapshot = totalsOn(date);
  const [stamp, setStamp] = useState(date);
  const [pickupKey, setPickupKey] = useState<string | null>(null);
  const [landfillKey, setLandfillKey] = useState<string | null>(null);
  const [commodityKey, setCommodityKey] = useState<string | null>(null);

  if (stamp !== date) {
    setStamp(date);
    setPickupKey(null);
    setLandfillKey(null);
    setCommodityKey(null);
  }

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of dailyCounts(loads, weekStartingSunday(date))) {
      map.set(row.date, displayLoadCount(row.count, totalsOn(row.date)));
    }
    return map;
  }, [loads, date, totalsOn]);

  const byPickup = useMemo(
    () => sortPickupsFixedOrder(rankPickups(dayLoads, knownCustomers)),
    [dayLoads, knownCustomers],
  );
  const byDestination = useMemo(() => rankDestinations(dayLoads), [dayLoads]);
  const byCommodity = useMemo(() => rankCommodities(dayLoads), [dayLoads]);
  const eod = useMemo(
    () => applyDailyEodToSummary(endOfDaySummary(dayLoads, {}), snapshot),
    [dayLoads, snapshot],
  );
  const week = weekStartingSunday(date);
  const openPickup = pickupKey;
  const openLandfill = landfillKey;
  const openCommodity = commodityKey;

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
  };

  const band = (
      <div className="yard-band">
        <div className="yard-date">
          <div>
            <p className="eyebrow">Chicago</p>
            <h1 className="page-title">{formatHeaderDate(date)}</h1>
          </div>
        </div>

        <div className="yard-week" role="group" aria-label="Week">
          <button
            type="button"
            className="yard-week-nav"
            aria-label="Previous week"
            onClick={() => changeDate(addDays(week[0], -7))}
          >
            <ChevronLeft size={14} />
          </button>
          {week.map((iso) => (
            <button
              key={iso}
              type="button"
              className={iso === date ? "yard-day on" : "yard-day"}
              aria-pressed={iso === date}
              onClick={() => changeDate(iso)}
            >
              <span className="yard-day-w">{weekdayMed(iso)}</span>
              <span className="yard-day-n">{dayNumber(iso)}</span>
              <span className="yard-day-c">{countByDate.get(iso) ?? 0}</span>
            </button>
          ))}
          <button
            type="button"
            className="yard-week-nav"
            aria-label="Next week"
            onClick={() => changeDate(addDays(week[0], 7))}
          >
            <ChevronRight size={14} />
          </button>
        </div>

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
                <span className="eod-stat-label">{EOD_LABELS[card.key] ?? card.label}</span>
                <span className="eod-stat-value">{card.count}</span>
              </article>
            );
          })}
        </div>

        <label className="yard-cal">
          <span className="yard-cal-kicker">Calendar</span>
          <input
            type="date"
            value={date}
            aria-label={`Calendar, ${formatShortDate(date)}, ${parseISODate(date).y}`}
            onChange={(event) => {
              const next = event.target.value;
              if (next) changeDate(next);
            }}
          />
        </label>
      </div>
  );

  return (
    <div className="screen yard-desk">
      {dockBand ? (topSlot ? createPortal(band, topSlot) : null) : band}

      <div className="yard-work">
        <div className="yard-col yard-side">
          <YardDrivers
            date={date}
            available={availabilityOn(date)?.available ?? null}
            loadCount={displayLoadCount(dayLoads.length, snapshot)}
          />
          <DispatchTalliesRow
            date={date}
            bataviaDispatchedToday={msWDispatchedToday.batavia}
            evanstonDispatchedToday={msWDispatchedToday.evanston}
            hookerDispatchedToday={msWDispatchedToday.hooker}
          >
            <CustomerTallyChips date={date} dayLoads={dayLoads} />
          </DispatchTalliesRow>
          <RecentLoadsLog loads={dayLoads} onEdit={onEdit} />
        </div>

        <div className="yard-col">
          <TransferStations
            rows={byPickup}
            openKey={openPickup}
            loads={dayLoads}
            onSelect={(key) => {
              setPickupKey(openPickup === key ? null : key);
            }}
            onEdit={onEdit}
            onLogStation={(pickup) => onLog(date, pickup)}
          />
        </div>

        <div className="yard-col yard-right">
          <OpeningList
            title="Landfill"
            rows={byDestination}
            openKey={openLandfill}
            loads={
              openLandfill
                ? rankAccordionLoads(dayLoads, { kind: "destination", key: openLandfill })
                : []
            }
            onSelect={(key) => {
              setLandfillKey(openLandfill === key ? null : key);
            }}
            onEdit={onEdit}
          />
          <OpeningList
            title="Commodity"
            rows={byCommodity}
            openKey={openCommodity}
            loads={
              openCommodity
                ? rankAccordionLoads(dayLoads, { kind: "commodity", key: openCommodity })
                : []
            }
            onSelect={(key) => {
              setCommodityKey(openCommodity === key ? null : key);
            }}
            onEdit={onEdit}
          />
        </div>
      </div>

      <SpecialtyBoardCard date={date} layout="chips" />
      <StationCallsCard date={date} noteAside />
    </div>
  );
}

function YardDrivers({
  date,
  available,
  loadCount,
}: {
  date: string;
  available: number | null;
  loadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const sunday = isChicagoSunday(date);
  const ratio =
    !sunday && available != null && available > 0 ? (loadCount / available).toFixed(2) : null;

  const summary = sunday
    ? "No Sunday tally"
    : available == null
      ? "Roster not loaded"
      : `${available} available`;

  return (
    <section className="yard-panel yard-drivers">
      <div className="yard-panel-head">
        <h2>Available drivers</h2>
        <button
          type="button"
          className="yard-expand"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Expanded" : "Expand"}
        </button>
      </div>
      <p className="yard-driver-summary">
        {summary}
        {ratio ? (
          <>
            {" "}
            <strong>{ratio}</strong> loads per driver
          </>
        ) : null}
      </p>
      {open ? (
        <DriversCard sectionsOnly showUnavailable date={date} loadCount={loadCount} />
      ) : null}
    </section>
  );
}

function TransferStations({
  rows,
  openKey,
  loads,
  onSelect,
  onEdit,
  onLogStation,
}: {
  rows: RankRow[];
  openKey: string | null;
  loads: Load[];
  onSelect: (key: string) => void;
  onEdit: (id: string) => void;
  onLogStation: (pickup: string) => void;
}) {
  const open = rows.find((row) => row.key === openKey) ?? null;
  const openLoads = open
    ? rankAccordionLoads(loads, { kind: "pickup", key: open.key })
    : [];
  const { deleteLoad } = useLoads();
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [pickedFor, setPickedFor] = useState<string | null>(open?.key ?? null);
  if (pickedFor !== (open?.key ?? null)) {
    // Popup closed or switched site: clear the selection.
    setPickedFor(open?.key ?? null);
    setPicked(new Set());
  }
  const openIds = openLoads.map((load) => load.id);
  const livePicked = pruneSelection(picked, openIds);
  const allPicked = openIds.length > 0 && livePicked.size === openIds.length;
  const deletePicked = () => {
    const n = deleteSelectedLoads([...livePicked], deleteLoad, (msg) => window.confirm(msg));
    if (n > 0) setPicked(new Set());
  };

  return (
    <section className="yard-panel yard-transfers">
      <div className="yard-panel-head">
        <h2>Transfer stations</h2>
        <span className="yard-hint">Tap a site · MSW / total</span>
      </div>
      {rows.length > 0 ? (
        <div className="yard-site-grid">
          {transferStationCells(rows).map((row, i) => {
            if (!row) return <span key={`gap-${i}`} className="yard-site-gap" aria-hidden="true" />;
            const selected = row.key === openKey;
            const trashOnly = isTrashOnlyRank(row);
            const numClass = trashOnly ? "yard-site-num full" : "yard-site-num";
            return (
              <button
                key={row.key}
                type="button"
                className={selected ? "yard-site on" : "yard-site"}
                aria-expanded={selected}
                onClick={() => onSelect(row.key)}
              >
                <span className="yard-site-name">
                  {row.label}
                  {row.custom ? <em className="yard-custom">Custom</em> : null}
                </span>
                <span className={numClass}>{row.trashCount}</span>
                <span className={numClass}>{row.count}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="yard-empty">Nothing logged this day.</p>
      )}
      {open ? (
        <div className="yard-load-pop" role="region" aria-label={`${open.label} loads`}>
          <div className="yard-load-pop-head">
            <strong>{open.label}</strong>
            {open.custom ? <em className="yard-custom">Custom</em> : null}
            <span>
              {open.trashCount} msw · {open.count} total
            </span>
            <button
              type="button"
              className="yard-load-pop-log"
              onClick={() => onLogStation(open.label)}
            >
              Log load
            </button>
            <button type="button" className="yard-load-pop-close" onClick={() => onSelect(open.key)}>
              Close
            </button>
            <button
              type="button"
              className="yard-load-pop-delete"
              disabled={livePicked.size === 0}
              onClick={deletePicked}
            >
              {deleteButtonLabel(livePicked.size)}
            </button>
            <input
              type="checkbox"
              className="yard-line-pick"
              aria-label="Select all loads"
              title="Select all"
              checked={allPicked}
              disabled={openIds.length === 0}
              onChange={() => setPicked(toggleSelectAll(livePicked, openIds))}
            />
          </div>
          <RankLoads
            loads={openLoads}
            onEdit={onEdit}
            checkoff
            picked={livePicked}
            onPick={(id) => setPicked(toggleSelectedId(livePicked, id))}
          />
        </div>
      ) : null}
    </section>
  );
}

function OpeningList({
  title,
  rows,
  openKey,
  loads,
  onSelect,
  onEdit,
}: {
  title: string;
  rows: RankRow[];
  openKey: string | null;
  loads: Load[];
  onSelect: (key: string) => void;
  onEdit: (id: string) => void;
}) {
  return (
    <section className="yard-panel yard-rank">
      <div className="yard-panel-head">
        <h2>{title}</h2>
        <span className="yard-hint">Tap to open</span>
      </div>
      <div className="yard-rank-scroll">
        {rows.length === 0 ? <p className="yard-empty">Nothing logged this day.</p> : null}
        <ul className="yard-rank-list">
          {rows.map((row) => {
            const open = row.key === openKey;
            return (
              <li key={row.key}>
                <button
                  type="button"
                  className={open ? "yard-rank-row on" : "yard-rank-row"}
                  aria-expanded={open}
                  onClick={() => onSelect(row.key)}
                >
                  <span>{row.label}</span>
                  <b>{row.count}</b>
                </button>
                {open ? <RankLoads loads={loads} onEdit={onEdit} /> : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function RankLoads({
  loads,
  onEdit,
  checkoff = false,
  picked,
  onPick,
}: {
  loads: Load[];
  onEdit: (id: string) => void;
  checkoff?: boolean;
  /** Multi-delete selection (station popup only). */
  picked?: ReadonlySet<string>;
  onPick?: (id: string) => void;
}) {
  const [checkedIds, setCheckedIds] = useState(() => readCheckedLoadIds());
  const { displayName: myName } = useAuth();
  const shared = useSyncExternalStore(subscribeCheckoffs, getCheckoffStore, getCheckoffStore);
  const hasEvanston = checkoff && loads.some((load) => isEvanstonPickup(load.pickup, load.stationId));
  useEffect(() => {
    if (!hasEvanston) return;
    void syncEvanstonCheckoffs();
    const id = window.setInterval(() => void syncEvanstonCheckoffs(), CHECKOFF_POLL_MS);
    return () => window.clearInterval(id);
  }, [hasEvanston]);

  if (loads.length === 0) {
    return <p className="yard-empty">No loads in this group.</p>;
  }
  return (
    <div className="feed yard-load-feed">
      {checkoff ? (
        <p className="yard-empty">Shade turns the load darker gray. A second click clears it.</p>
      ) : null}
      {loads.map((load) => {
        const evanston = checkoff && isEvanstonPickup(load.pickup, load.stationId);
        const sharedEntry = evanston ? shared[load.id] : undefined;
        // Evanston: shared across desks; falls back to this desk's old local shade until first click.
        const checked = checkoff && (sharedEntry ? sharedEntry.checked : checkedIds.has(load.id));
        const checkedTitle =
          sharedEntry?.checked && sharedEntry.checkedAt
            ? `Checked ${formatCreatedStamp(sharedEntry.checkedAt)}${sharedEntry.checkedBy ? ` by ${sharedEntry.checkedBy}` : ""}`
            : undefined;
        const loggedAt = checkoff ? formatCreatedStamp(load.createdAt) : "";
        return (
          <div key={load.id} className={checked ? "yard-line is-checked" : "yard-line"}>
            <button
              type="button"
              className="yard-line-main"
              aria-pressed={checkoff ? checked : undefined}
              onClick={
                checkoff
                  ? evanston
                    ? () => toggleEvanstonCheckoff(load.id, checked, myName || null)
                    : () => setCheckedIds(toggleCheckedLoad(load.id))
                  : () => onEdit(load.id)
              }
            >
              <b>{load.truck}</b>
              {load.driverName ? <span className="yard-line-driver">{load.driverName}</span> : null}
              <span className="yard-line-route">
                {load.pickup} → {load.destination}
              </span>
              {checkoff ? (
                <CommodityTag commodity={load.commodity} />
              ) : (
                <span className="yard-line-kind">{load.commodity}</span>
              )}
              {checked ? (
                <em className="yard-line-mark" title={checkedTitle}>
                  Checked
                </em>
              ) : null}
              {checkoff && loggedAt ? (
                <time className="yard-line-time" dateTime={load.createdAt}>
                  {loggedAt}
                </time>
              ) : null}
              {checkoff ? <LoadEditedMark name={load.editedBy} /> : null}
            </button>
            {checkoff ? <LoadCreatorBadge displayName={load.displayName} /> : null}
            {checkoff ? (
              <button type="button" className="yard-line-edit" onClick={() => onEdit(load.id)}>
                Edit
              </button>
            ) : null}
            {onPick ? (
              <input
                type="checkbox"
                className="yard-line-pick"
                aria-label={`Select load ${load.truck}`}
                checked={picked?.has(load.id) ?? false}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onPick(load.id)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
