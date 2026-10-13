import { useMemo, useState } from "react";
import type { Load } from "../types";

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
  const sorted = useMemo(
    () => [...loads].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    [loads],
  );
  const shown = expanded ? sorted : sorted.slice(0, COLLAPSED);
  return (
    <section className="yard-panel recent-loads" aria-label="Recent loads">
      <div className="yard-panel-head">
        <h2>Load log</h2>
        {sorted.length > COLLAPSED ? (
          <button type="button" className="yard-expand" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show less" : `Show more (${sorted.length})`}
          </button>
        ) : null}
      </div>
      {sorted.length === 0 ? (
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
