import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { NotebookPen, Search, X } from "lucide-react";
import {
  ROSTER_UNAVAILABLE_REASONS,
  rosterStatusLabel,
  type DriverRosterEntry,
} from "../lib/driverRoster";
import { payTierFromHireDate, payTierLabel } from "../lib/driverPay";
import { formatPayCents, type WeekPay } from "../lib/loadPay";
import { yearsOfService, yearsOfServiceLabel } from "../lib/rosterHireDate";
import type { DriverAllotment } from "../lib/rosterAllotment";
import { notesForDriver } from "../lib/driverNotes";
import { useDriverNotes } from "../store/DriverNotesContext";
import { formatMonthDayYear } from "../lib/chicagoDate";
import "./drivers-table.css";

export type FullRosterRowData = {
  entry: DriverRosterEntry;
  out: boolean;
  storedOut: boolean;
  onVacation: boolean;
  allot: DriverAllotment;
  week: WeekPay;
};

type Handlers = {
  onMove: (id: string, delta: -1 | 1) => void;
  onRemove: (entry: DriverRosterEntry) => void;
  onStatus: (id: string, status: string | null) => void;
  onTruck: (id: string, truck: string) => Promise<{ ok: boolean; conflictName?: string }>;
  onProfile: (id: string, patch: { hireDate?: string | null; phone?: string | null }) => void;
  onNotes: (entry: DriverRosterEntry) => void;
};

type SortKey = "order" | "emp" | "name" | "yrs" | "truck" | "status" | "pday" | "calloff" | "okd" | "pay";

type FullRosterTableProps = Handlers & {
  rows: FullRosterRowData[];
  today: string;
  asOf: string;
  yardLabel: string;
  onAdd: () => void;
};

const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

export function fullRosterRowMatches(row: FullRosterRowData, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const e = row.entry;
  const hay = [e.name, e.truckNumber, e.assignedTruck, e.phone].map((v) => (v ?? "").toLowerCase());
  if (hay.some((v) => v.includes(q))) return true;
  const qd = digits(q);
  return qd.length >= 3 && digits(e.phone).includes(qd);
}

function sortValue(row: FullRosterRowData, key: SortKey, today: string): string | number {
  const e = row.entry;
  switch (key) {
    case "emp":
      return Number(digits(e.truckNumber)) || Number.MAX_SAFE_INTEGER;
    case "name":
      return e.name.toLowerCase();
    case "yrs":
      return yearsOfService(e.hireDate, today) ?? -1;
    case "truck":
      return Number(digits(e.assignedTruck)) || Number.MAX_SAFE_INTEGER;
    case "status":
      return row.out ? `1${rosterStatusLabel(e.status ?? "") || "vac"}` : "0";
    case "pday":
      return row.allot.pDayLeft;
    case "calloff":
      return row.allot.callOffLeft;
    case "okd":
      return row.allot.okdOffUsed;
    case "pay":
      return row.week.totalCents;
    default:
      return 0;
  }
}

export function FullRosterTable({ rows, today, asOf, yardLabel, onAdd, ...handlers }: FullRosterTableProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "order", dir: 1 });
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const { store } = useDriverNotes();
  const latestNotes = useMemo(() => {
    const map = new Map<string, { noteDate: string; note: string } | null>();
    for (const row of rows) map.set(row.entry.id, notesForDriver(store, row.entry)[0] ?? null);
    return map;
  }, [rows, store]);

  const shown = useMemo(() => {
    const indexed = rows.map((row, index) => ({ row, index }));
    const filtered = indexed.filter(({ row }) => fullRosterRowMatches(row, query));
    if (sort.key === "order") return filtered;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a.row, sort.key, today);
      const bv = sortValue(b.row, sort.key, today);
      if (av < bv) return -sort.dir;
      if (av > bv) return sort.dir;
      return a.index - b.index;
    });
  }, [rows, query, sort, today]);

  const customOrder = sort.key === "order" && !query.trim();

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clickSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key !== key ? { key, dir: 1 } : prev.dir === 1 ? { key, dir: -1 } : { key: "order", dir: 1 },
    );

  const th = (k: SortKey, label: string, className?: string) => (
    <th key={k} className={className} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="drv-tbl-sort" onClick={() => clickSort(k)}>
        {label}
        {sort.key === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );

  return (
    <div className="drv-tbl-wrap">
      <div className="drv-tbl-toolbar">
        <label className="drv-tbl-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, emp #, truck #, phone"
            aria-label={`Search ${yardLabel} roster`}
            autoComplete="off"
          />
          {query ? (
            <button type="button" className="drv-tbl-clear" aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={13} aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <span className="drv-tbl-count">
          {query.trim() ? `${shown.length} of ${rows.length}` : `${rows.length} drivers`}
        </span>
        {sort.key !== "order" ? (
          <button type="button" className="text-btn" onClick={() => setSort({ key: "order", dir: 1 })}>
            Back to custom order
          </button>
        ) : null}
        <button
          type="button"
          className="text-btn"
          onClick={() =>
            setOpenIds((prev) => (prev.size ? new Set() : new Set(shown.map(({ row }) => row.entry.id))))
          }
        >
          {openIds.size ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <div className="drv-tbl-scroll">
        <table className="drv-tbl" aria-label={`${yardLabel} hired roster`}>
          <thead>
            <tr>
              <th className="drv-tbl-c-move">
                <button
                  type="button"
                  className="drv-tbl-sort"
                  title="Custom order"
                  onClick={() => setSort({ key: "order", dir: 1 })}
                >
                  ↕
                </button>
              </th>
              {th("emp", "Emp#")}
              {th("name", "Name", "drv-tbl-c-name")}
              {th("truck", "Truck")}
              {th("status", "Status")}
              <th className="drv-tbl-c-phone">Phone</th>
              {th("pday", "P-Day", "drv-tbl-c-num")}
              {th("calloff", "Call-off", "drv-tbl-c-num")}
              {th("okd", "OK'd Off", "drv-tbl-c-num")}
              {th("pay", "Week $", "drv-tbl-c-pay")}
              <th className="drv-tbl-c-act" aria-label="Actions" />
            </tr>
          </thead>
          {shown.map(({ row, index }) => (
            <FullRosterRow
              key={row.entry.id}
              row={row}
              index={index}
              count={rows.length}
              canMove={customOrder}
              today={today}
              asOf={asOf}
              open={openIds.has(row.entry.id)}
              onToggle={() => toggle(row.entry.id)}
              onOpen={() => setOpenIds((prev) => new Set(prev).add(row.entry.id))}
              latestNote={latestNotes.get(row.entry.id) ?? null}
              {...handlers}
            />
          ))}
          {shown.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={11} className="drv-tbl-empty">
                  No drivers match “{query}”.
                </td>
              </tr>
            </tbody>
          ) : null}
        </table>
      </div>
      <button type="button" className="vac-add-link drv-sat-add" onClick={onAdd}>
        + Add
      </button>
    </div>
  );
}

type RowProps = Handlers & {
  row: FullRosterRowData;
  index: number;
  count: number;
  canMove: boolean;
  today: string;
  asOf: string;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
  latestNote: { noteDate: string; note: string } | null;
};

function FullRosterRow({
  row,
  index,
  count,
  canMove,
  today,
  asOf,
  open,
  onToggle,
  onOpen,
  latestNote,
  onMove,
  onRemove,
  onStatus,
  onTruck,
  onProfile,
  onNotes,
}: RowProps) {
  const { entry, out, storedOut, onVacation, allot, week } = row;
  const [editing, setEditing] = useState(false);
  const [truck, setTruck] = useState(entry.assignedTruck ?? "");
  const [truckError, setTruckError] = useState<string | null>(null);
  const [phone, setPhone] = useState(entry.phone ?? "");
  const [hireDate, setHireDate] = useState(entry.hireDate ?? "");
  const [truckFocused, setTruckFocused] = useState(false);
  const truckDirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (truckFocused || truckDirty.current) return;
    setTruck(entry.assignedTruck ?? "");
  }, [entry.assignedTruck, truckFocused]);
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);
  useEffect(() => {
    setPhone(entry.phone ?? "");
  }, [entry.phone]);
  useEffect(() => {
    setHireDate(entry.hireDate ?? "");
  }, [entry.hireDate]);

  const yos = yearsOfService(entry.hireDate, today);
  const tier = payTierFromHireDate(entry.hireDate, asOf);

  const saveTruck = async (raw = truck) => {
    const next = raw.trim();
    if ((entry.assignedTruck ?? "") === next) {
      truckDirty.current = false;
      return;
    }
    const result = await onTruck(entry.id, next);
    if (result && !result.ok) {
      truckDirty.current = false;
      setTruck(entry.assignedTruck ?? "");
      setTruckError(`Truck # already assigned to ${result.conflictName ?? "another driver"}.`);
    } else {
      truckDirty.current = false;
      setTruckError(null);
    }
  };

  const saveProfile = () => {
    onProfile(entry.id, { phone: phone.trim() || null, hireDate: hireDate.trim() || null });
    setEditing(false);
  };

  const rowClick = (event: MouseEvent<HTMLTableRowElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, a, label")) return;
    onToggle();
  };

  const stop = (event: MouseEvent) => event.stopPropagation();

  return (
    <tbody className={open ? "drv-tbl-group is-open" : "drv-tbl-group"}>
      <tr className={out ? "drv-tbl-row is-out" : "drv-tbl-row"} onClick={rowClick}>
        <td className="drv-tbl-c-move" data-label="">
          <div className="drv-move">
            <button
              type="button"
              className="drv-move-btn"
              aria-label={`Move ${entry.name} up`}
              title={canMove ? undefined : "Clear search and sort to reorder"}
              disabled={!canMove || index === 0}
              onClick={() => onMove(entry.id, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="drv-move-btn"
              aria-label={`Move ${entry.name} down`}
              title={canMove ? undefined : "Clear search and sort to reorder"}
              disabled={!canMove || index === count - 1}
              onClick={() => onMove(entry.id, 1)}
            >
              ↓
            </button>
          </div>
        </td>
        <td className="drv-tbl-c-emp" data-label="Emp#">
          {entry.truckNumber ?? "—"}
        </td>
        <td className="drv-tbl-c-name" data-label="Name">
          <button
            type="button"
            className="drv-tbl-caret"
            aria-expanded={open}
            aria-label={open ? `Collapse ${entry.name}` : `Expand ${entry.name}`}
            onClick={onToggle}
          >
            {open ? "⌃" : "⌄"}
          </button>
          <span className="drv-tbl-name">{entry.name}</span>
          {out ? <span className="drv-out-tag">Out</span> : null}
          {onVacation ? (
            <span className="drv-vac-from" title="From the Vacation tab this week">
              Vac
            </span>
          ) : null}
          {yos !== null ? (
            <span
              className="drv-yos-tag"
              title={`${payTierLabel(tier)} · started ${entry.hireDate}`}
              aria-label={`Years of service: ${yos}. ${payTierLabel(tier)}`}
            >
              {yearsOfServiceLabel(yos)}
            </span>
          ) : (
            <span className="drv-yos-tag is-missing" title="Add a start date to set pay tier">
              No start
            </span>
          )}
        </td>
        <td className="drv-tbl-c-truck" data-label="Truck">
          <input
            className="text-input drv-assigned-truck"
            value={truck}
            onClick={stop}
            onChange={(event) => {
              const next = event.target.value;
              truckDirty.current = true;
              setTruck(next);
              if (truckError) setTruckError(null);
              if (saveTimer.current) clearTimeout(saveTimer.current);
              saveTimer.current = setTimeout(() => {
                void saveTruck(next);
              }, 400);
            }}
            onFocus={() => setTruckFocused(true)}
            onBlur={(event) => {
              setTruckFocused(false);
              if (saveTimer.current) clearTimeout(saveTimer.current);
              // Read the input, not React state (delete-then-tab can blur first).
              void saveTruck(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            placeholder="Truck #"
            autoComplete="off"
            aria-label={`Truck number for ${entry.name}`}
          />
          {truckError ? (
            <p className="drv-truck-error" role="alert">
              {truckError}
            </p>
          ) : null}
        </td>
        <td className="drv-tbl-c-status" data-label="Status">
          <select
            className={storedOut || onVacation ? "drv-status-select is-out" : "drv-status-select"}
            value={entry.status ?? ""}
            aria-label={`Unavailability for ${entry.name}`}
            onClick={stop}
            onChange={(event) => onStatus(entry.id, event.target.value || null)}
          >
            <option value="">{onVacation ? "No mark" : "Available"}</option>
            {ROSTER_UNAVAILABLE_REASONS.map((r) => (
              <option key={r.token} value={r.token}>
                {r.reason !== r.label ? `${r.label} — ${r.reason}` : r.label}
              </option>
            ))}
            {entry.status && !ROSTER_UNAVAILABLE_REASONS.some((r) => r.token === entry.status) ? (
              <option value={entry.status}>{rosterStatusLabel(entry.status)}</option>
            ) : null}
          </select>
        </td>
        <td className="drv-tbl-c-phone" data-label="Phone">
          {entry.phone ?? ""}
        </td>
        <td className="drv-tbl-c-num" data-label="P-Day">
          <span
            className={allot.pDayLeft ? "drv-allot-tag drv-allot-pday" : "drv-allot-tag drv-allot-pday is-empty"}
            title={`Personal days left this year (${allot.pDayUsed} used)`}
          >
            {allot.pDayLeft}
          </span>
        </td>
        <td className="drv-tbl-c-num" data-label="Call-off">
          <span
            className={
              allot.callOffLeft ? "drv-allot-tag drv-allot-calloff" : "drv-allot-tag drv-allot-calloff is-empty"
            }
            title={`Call-offs left this year (${allot.callOffUsed} used)`}
          >
            {allot.callOffLeft}
          </span>
        </td>
        <td className="drv-tbl-c-num" data-label="OK'd Off">
          <span
            className={
              allot.okdOffUsed ? "drv-allot-tag drv-allot-okdoff" : "drv-allot-tag drv-allot-okdoff is-empty"
            }
            title="Ok'd Off days logged this calendar year"
          >
            {allot.okdOffUsed}
          </span>
        </td>
        <td className="drv-tbl-c-pay" data-label="Week $">
          {formatPayCents(week.totalCents)}
        </td>
        <td className="drv-tbl-c-act">
          <button
            type="button"
            className="drv-pay-icon drv-notes-icon"
            aria-label={`Notes for ${entry.name}`}
            title="Driver notes"
            onClick={() => onNotes(entry)}
          >
            <NotebookPen size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="drv-pay-icon"
            aria-label={`Edit ${entry.name}`}
            onClick={() => {
              setEditing((value) => !value);
              onOpen();
            }}
          >
            ✎
          </button>
          <button
            type="button"
            className="vac-pill-x drv-remove"
            aria-label={`Remove ${entry.name}`}
            onClick={() => onRemove(entry)}
          >
            ×
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="drv-tbl-detail">
          <td colSpan={11}>
            <div className="drv-tbl-detail-inner">
              {editing ? (
                <div className="drv-pay-edit">
                  <label className="drv-pay-field">
                    <span>Phone</span>
                    <input
                      className="text-input"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="(312) 555-0147"
                      autoComplete="off"
                    />
                  </label>
                  <label className="drv-pay-field">
                    <span>Start date</span>
                    <input
                      className="text-input"
                      type="date"
                      value={hireDate}
                      onChange={(event) => setHireDate(event.target.value)}
                    />
                  </label>
                  <div className="vac-add-actions">
                    <button type="button" className="text-btn amber" onClick={saveProfile}>
                      Save
                    </button>
                    <button type="button" className="text-btn" onClick={() => setEditing(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="drv-pay-week drv-tbl-week" aria-label={`Pay this week for ${entry.name}`}>
                {week.days.map((day) => (
                  <div key={day.date} className="drv-pay-day">
                    <span className="drv-pay-dow">{day.weekday}</span>
                    <span className={day.cents ? "drv-pay-amt" : "drv-pay-amt is-zero"}>
                      {formatPayCents(day.cents)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="drv-allotment">
                <span className={allot.pDayLeft ? "drv-allot-tag drv-allot-pday" : "drv-allot-tag drv-allot-pday is-empty"}>
                  P-Day {allot.pDayLeft}
                </span>
                <span
                  className={
                    allot.callOffLeft ? "drv-allot-tag drv-allot-calloff" : "drv-allot-tag drv-allot-calloff is-empty"
                  }
                >
                  Call-off {allot.callOffLeft}
                </span>
                <span
                  className={allot.okdOffUsed ? "drv-allot-tag drv-allot-okdoff" : "drv-allot-tag drv-allot-okdoff is-empty"}
                >
                  OK'd Off {allot.okdOffUsed}
                </span>
              </div>
              <button type="button" className="drv-tbl-note" onClick={() => onNotes(entry)}>
                {latestNote ? (
                  <>
                    <strong>{formatMonthDayYear(latestNote.noteDate)}</strong> — {latestNote.note}
                  </>
                ) : (
                  <span className="drv-tbl-note-empty">No notes · add one</span>
                )}
              </button>
            </div>
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}
