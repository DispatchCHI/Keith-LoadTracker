import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatRankTrashTotal, type RankRow, type TotalsFilter } from "../lib/totals";

type CollapsibleRankProps = {
  title: string;
  hint?: string;
  rows: RankRow[];
  filterKind: TotalsFilter["kind"];
  active?: TotalsFilter | null;
  onSelect?: (filter: TotalsFilter) => void;
  defaultOpen?: boolean;
  emptyText?: string;
  /** Compact numbers/table — no full-width bars. */
  compact?: boolean;
  /** Loads for the selected row, rendered as an accordion under that row. */
  expandedPanel?: ReactNode;
};

export function CollapsibleRank({
  title,
  hint,
  rows,
  filterKind,
  active = null,
  onSelect,
  defaultOpen = true,
  emptyText = "Nothing logged in this group.",
  compact = false,
  expandedPanel,
}: CollapsibleRankProps) {
  const [open, setOpen] = useState(defaultOpen);
  const max = rows[0]?.count ?? 0;
  const keys = rows.length;

  return (
    <section className={open ? "totals-block" : "totals-block totals-block-collapsed"}>
      <button
        type="button"
        className="totals-toggle"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="totals-toggle-copy">
          <span className="totals-toggle-title">{title}</span>
          <span className="totals-toggle-count">
            {keys} {keys === 1 ? "group" : "groups"}
          </span>
        </span>
        <ChevronDown
          size={20}
          className={open ? "totals-chevron open" : "totals-chevron"}
          aria-hidden
        />
      </button>
