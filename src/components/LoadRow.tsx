import { formatCreatedStamp } from "../lib/chicagoDate";
import type { Load } from "../types";
import { CommodityTag } from "./CommodityTag";

type LoadRowProps = {
  load: Load;
  onEdit: () => void;
  highlight?: "editing" | "just-edited" | null;
  /** Spreadsheet check-off. Click the card to mark it; Edit still opens the load. */
  checked?: boolean;
  onToggleCheck?: () => void;
};

export function LoadRow({
  load,
  onEdit,
  highlight = null,
  checked = false,
  onToggleCheck,
}: LoadRowProps) {
  const createdStamp = formatCreatedStamp(load.createdAt);
  const main = (
    <>
      <div className="load-row-top">
        <span className="load-truck">
          {load.truck}
          {load.driverName ? (
            <span className="load-driver"> {load.driverName}</span>
          ) : null}
        </span>
        <span className="load-route">
          {load.pickup} <span className="arrow">→</span> {load.destination}
        </span>
      </div>
      <div className="load-row-meta">
        <CommodityTag
          commodity={load.commodity}
          note={
            highlight === "just-edited"
              ? "just edited"
              : load.displayName
                ? load.displayName
                : undefined
          }
        />
      </div>
    </>
  );
  return (
    <article
      className={[
        "load-row",
        highlight === "editing" ? "load-row-editing" : "",
        checked ? "load-row-checked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {onToggleCheck ? (
        <button
          type="button"
          className="load-row-main load-row-check-hit"
          aria-pressed={checked}
          aria-label={
            checked
              ? `Clear the mark on truck ${load.truck}`
              : `Mark truck ${load.truck}`
          }
          onClick={onToggleCheck}
        >
          {main}
        </button>
      ) : (
        <div className="load-row-main">{main}</div>
      )}
      <div className="load-row-actions">
        {createdStamp ? (
          <time className="load-created" dateTime={load.createdAt}>
            {createdStamp}
          </time>
        ) : null}
        {highlight === "editing" ? (
          <span className="editing-label">Editing…</span>
        ) : (
          <button type="button" className="edit-link" onClick={onEdit}>
            Edit
          </button>
        )}
      </div>
    </article>
  );
}
