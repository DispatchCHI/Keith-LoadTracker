import { ChevronDown } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
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
  /** Number of side-by-side columns for the row list. Defaults to 1 (stacked). */
  columns?: number;
  /** Table used on the desktop Today totals panel. Cards stay the default. */
  layout?: "cards" | "sheet";
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
  columns = 1,
  layout = "cards",
}: CollapsibleRankProps) {
  const [open, setOpen] = useState(defaultOpen);
  const max = rows[0]?.count ?? 0;
  const keys = rows.length;

  if (layout === "sheet") {
    return (
      <SheetRank
        title={title}
        hint={hint}
        rows={rows}
        filterKind={filterKind}
        active={active}
        onSelect={onSelect}
        open={open}
        setOpen={setOpen}
        emptyText={emptyText}
        expandedPanel={expandedPanel}
        columns={columns}
      />
    );
  }

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

      {open ? (
        <>
          {hint ? <p className="totals-hint">{hint}</p> : null}
          {rows.length === 0 ? (
            <p className="field-hint">{emptyText}</p>
          ) : (
            <ul
              className={columns > 1 ? "rank-list rank-list-grid" : "rank-list"}
              style={columns > 1 ? ({ "--rank-cols": columns } as CSSProperties) : undefined}
            >
              {rows.map((row) => {
                const selected =
                  active?.kind === filterKind && active.key === row.key;
                const pct = max === 0 ? 0 : Math.max(8, (row.count / max) * 100);
                return (
                  <li
                    key={row.key}
                    className={selected ? "rank-item rank-item-open" : "rank-item"}
                  >
                    {onSelect ? (
                      <button
                        type="button"
                        className={
                          selected
                            ? `rank-row rank-row-active${compact ? " rank-row-compact" : ""}`
                            : `rank-row${compact ? " rank-row-compact" : ""}`
                        }
                        aria-expanded={selected}
                        onClick={() => onSelect({ kind: filterKind, key: row.key })}
                      >
                        <RankInner row={row} pct={pct} showBar={!compact} commodity={filterKind === "commodity"} />
                      </button>
                    ) : (
                      <div
                        className={`rank-row rank-row-static${compact ? " rank-row-compact" : ""}`}
                      >
                        <RankInner row={row} pct={pct} showBar={!compact} commodity={filterKind === "commodity"} />
                      </div>
                    )}
                    {selected && expandedPanel ? (
                      <div className="rank-accordion">{expandedPanel}</div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}

function SheetRank({
  title,
  hint,
  rows,
  filterKind,
  active,
  onSelect,
  open,
  setOpen,
  emptyText,
  expandedPanel,
  columns,
}: {
  title: string;
  hint?: string;
  rows: RankRow[];
  filterKind: TotalsFilter["kind"];
  active: TotalsFilter | null;
  onSelect?: (filter: TotalsFilter) => void;
  open: boolean;
  setOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  emptyText: string;
  expandedPanel?: ReactNode;
  columns: number;
}) {
  const commodity = filterKind === "commodity";
  const span = columns * 3;
  const pairs: RankRow[][] = [];
  for (let i = 0; i < rows.length; i += columns) {
    pairs.push(rows.slice(i, i + columns));
  }
  const head = commodity ? ["Site", "Loads", ""] : ["Site", "MSW", "Total"];

  return (
    <section
      className={
        open
          ? "totals-block totals-sheet-block"
          : "totals-block totals-sheet-block totals-block-collapsed"
      }
    >
      <button
        type="button"
        className="totals-toggle"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="totals-toggle-copy">
          <span className="totals-toggle-title">{title}</span>
        </span>
        {hint ? <span className="totals-toggle-count">{hint}</span> : null}
        <ChevronDown
          size={16}
          className={open ? "totals-chevron open" : "totals-chevron"}
          aria-hidden
        />
      </button>
      {open ? (
        rows.length === 0 ? (
          <p className="field-hint">{emptyText}</p>
        ) : (
          <table className="sheet-sites">
            <thead>
              <tr>
                {Array.from({ length: columns }, (_, col) =>
                  head.map((label, index) => (
                    <th key={`${col}-${label}-${index}`} className={index === 0 ? "" : "num"}>
                      {label}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            {pairs.map((pair) => {
              const openHere = pair.some(
                (row) => active?.kind === filterKind && active.key === row.key,
              );
              return (
                <tbody key={pair[0]?.key}>
                  <tr>
                    {pair.map((row) => {
                      const selected = active?.kind === filterKind && active.key === row.key;
                      const full = !commodity && row.count > 0 && row.trashCount === row.count;
                      const choose = () => onSelect?.({ kind: filterKind, key: row.key });
                      return (
                        <SiteCells
                          key={row.key}
                          row={row}
                          commodity={commodity}
                          selected={selected}
                          full={full}
                          onChoose={onSelect ? choose : undefined}
                        />
                      );
                    })}
                    {pair.length < columns
                      ? Array.from({ length: (columns - pair.length) * 3 }, (_, index) => (
                          <td key={`pad-${index}`} />
                        ))
                      : null}
                  </tr>
                  {openHere && expandedPanel ? (
                    <tr className="sheet-expand">
                      <td colSpan={span}>{expandedPanel}</td>
                    </tr>
                  ) : null}
                </tbody>
              );
            })}
          </table>
        )
      ) : null}
    </section>
  );
}

function SiteCells({
  row,
  commodity,
  selected,
  full,
  onChoose,
}: {
  row: RankRow;
  commodity: boolean;
  selected: boolean;
  full: boolean;
  onChoose?: () => void;
}) {
  const mark = selected ? "is-on" : "";
  const nums = full ? `num full site-cell ${mark}` : `num site-cell ${mark}`;
  const name = (
    <>
      {row.label}
      {row.custom ? <span className="custom-pill">Custom</span> : null}
    </>
  );
  return (
    <>
      <td className={`site-cell ${mark}`}>
        <CellHit label={row.label} selected={selected} onChoose={onChoose}>
          {name}
        </CellHit>
      </td>
      <td className={nums}>
        <CellHit onChoose={onChoose} align="end">
          {commodity ? row.count : row.trashCount}
        </CellHit>
      </td>
      <td className={nums}>
        {commodity ? null : (
          <CellHit onChoose={onChoose} align="end">
            {row.count}
          </CellHit>
        )}
      </td>
    </>
  );
}

function CellHit({
  children,
  onChoose,
  label,
  selected,
  align = "start",
}: {
  children: ReactNode;
  onChoose?: () => void;
  label?: string;
  selected?: boolean;
  align?: "start" | "end";
}) {
  if (!onChoose) {
    return <span className={align === "end" ? "site-hit num-hit" : "site-hit"}>{children}</span>;
  }
  return (
    <button
      type="button"
      className={align === "end" ? "site-hit num-hit" : "site-hit"}
      aria-label={label}
      aria-expanded={label ? selected : undefined}
      onClick={onChoose}
    >
      {children}
    </button>
  );
}

function RankInner({
  row,
  pct,
  showBar,
  commodity = false,
}: {
  row: RankRow;
  pct: number;
  showBar: boolean;
  commodity?: boolean;
}) {
  return (
    <>
      <div className="rank-row-top">
        <span className="rank-label">
          {row.label}
          {row.custom ? <span className="custom-pill">Custom</span> : null}
        </span>
        <span className="rank-count-group">
          <strong
            className="rank-count"
            aria-label={
              commodity
                ? `${row.count} loads`
                : `${row.trashCount} trash of ${row.count} loads`
            }
          >
            {formatRankTrashTotal(row, { commodity })}
          </strong>
          {!commodity ? <span className="rank-count-caption">MSW / Total</span> : null}
        </span>
      </div>
      {showBar ? (
        <div className="rank-track" aria-hidden>
          <div className="rank-fill" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </>
  );
}
