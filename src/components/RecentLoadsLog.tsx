import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Load } from "../types";

const COLLAPSE_KEY = "chitrader.load-tracker.recent-loads-collapsed";
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

const COLLAPSED = 8;
const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  hour: "numeric",
  minute: "2-digit",
});

function shortCommodity(commodity: string): string {
  return commodity.replace(" (MSW)", "").replace(" (tanker)", "");
}

/** Compact dispatch-order log for the selected day (newest first). Not on the EOD image. */
export function RecentLoadsLog({
  loads,
  onEdit,
}: {
  loads: Load[];
  onEdit: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = () =>
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  const sorted = useMemo(
    () => [...loads].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    [loads],
  );
  const shown = expanded ? sorted : sorted.slice(0, COLLAPSED);
  return (
    <section className="yard-panel recent-loads" aria-label="Recent loads">
      <div className="yard-panel-head">
        <button
          type="button"
          className="recent-loads-toggle"
          aria-expanded={!collapsed}
          onClick={toggleCollapsed}
          style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <h2>
            Load log{collapsed ? ` (${sorted.length})` : ""}
          </h2>
        </button>
        {!collapsed && sorted.length > COLLAPSED ? (
          <button type="button" className="yard-expand" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show less" : `Show more (${sorted.length})`}
          </button>
        ) : null}
      </div>
      {collapsed ? null : sorted.length === 0 ? (
        <p className="recent-loads-empty">No loads yet.</p>
      ) : (
        <ol className={expanded ? "recent-loads-list recent-loads-scroll" : "recent-loads-list"}>
          {shown.map((load) => {
            const dt = new Date(load.createdAt);
            const time = Number.isNaN(dt.getTime()) ? "" : timeFmt.format(dt).replace(/\s?[AP]M$/, "");
            return (
              <li key={load.id}>
                <button
                  type="button"
                  className="recent-load"
                  title={`Edit truck ${load.truck}`}
                  onClick={() => onEdit(load.id)}
                >
                  <span className="rl-time">{time}</span>
                  <span className="rl-truck">{load.truck}</span>
                  <span className="rl-driver">{load.driverName ?? ""}</span>
                  <span className="rl-route">
                    {load.pickup} → {load.destination}
                  </span>
                  {load.commodity ? <span className="rl-com">{shortCommodity(load.commodity)}</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
