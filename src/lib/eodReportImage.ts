import { addDays, formatHeaderDate } from "./chicagoDate";
import { applyDailyEodToSummary, type DailyEodTotals } from "./dailyEod";
import {
  STATION_CALL_HOURS,
  boardForDate,
  parseNumericCell,
  readStationCallStore,
  stationCallYards,
  stationCellFilled,
  type StationCallStore,
  type StationDayBoard,
  type StationHourKey,
} from "./stationCalls";
import {
  endOfDayCards,
  endOfDaySummary,
  rankDestinations,
  type EndOfDaySummary,
  type RankRow,
} from "./totals";
import type { Load } from "../types";

const COLS: { key: "start" | StationHourKey | "close"; label: string }[] = [
  { key: "start", label: "Start" },
  ...STATION_CALL_HOURS.map((h) => ({ key: h.key as StationHourKey, label: h.label })),
  { key: "close", label: "Close" },
];

const SANS = "ui-sans-serif, system-ui, sans-serif";

/**
 * Canvas type scale for the EOD PNG.
 * Email clients fit this ~1600px-wide image to the message column, so these
 * sizes are a clear step up from the previous 11–26px set — large enough to
 * stay readable after that shrink, without restretching the stat/landfill chips.
 */
export const EOD_IMAGE_TYPE = {
  title: 40,
  subtitle: 22,
  section: 24,
  hourHeader: 18,
  hourCell: 26,
  statLabel: 16,
  statValue: 32,
  tableHeader: 18,
  tableCell: 26,
  landfill: 20,
  landfillCaption: 13,
  footer: 18,
} as const;

function canvasFont(weight: 500 | 600 | 700, px: number): string {
  return `${weight} ${px}px ${SANS}`;
}

/** Shared spacing for the EOD PNG — row boxes track the type scale; chips stay compact. */
export const EOD_IMAGE_LAYOUT = {
  pad: 16,
  /** Modest bump past 1480 so hour cols can breathe without crushing EOD chips. */
  width: 1600,
  titleH: 80,
  sectionTitleH: 32,
  sectionGap: 10,
  /** Gap between left/right columns in the two side-by-side bands. */
  colGap: 12,
  /** Wider than the post-font-bump 62px so 26px hour figures aren't cramped. */
  hourColW: 72,
  nameColW: 176,
  gridHeaderH: 34,
  gridRowH: 40,
  gridCardPad: 12,
  /** Inner horizontal pad inside the hour-grid card. */
  gridInnerPad: 8,
  /**
   * Compact End-of-day commodity/stat bubbles (right of hour grid).
   * Taller only enough for the larger figure; still content-width chips
   * stacked in a tight column (not stretched across the stats band).
   */
  cardsH: 48,
  cardGap: 5,
  /** Inner horizontal pad inside each EOD stat chip. */
  statCardPadX: 12,
  /** Gap between label and count inside a chip (not stretched). */
  statCardInnerGap: 14,
  /**
   * Cap chip width so label/number sit close. Wider than the old 300px cap
   * is unnecessary — content at the new type scale is ~240px.
   */
  statCardMaxW: 248,
  /** How many EOD stat cards are drawn (TRASH/LEACHATE/WALKING-FLOOR/LOADS/SUBS). */
  cardCount: 5,
  tableHeaderH: 34,
  tableRowH: 40,
  tableCardPad: 10,
  /** Station totals: fixed dense cols (not % of full canvas). */
  tableNameW: 176,
  tableNumW: 80,
  /** Extra pad around station table content inside its card. */
  tableInnerPad: 10,
  /**
   * Landfill cards: fixed width, 2-up in the right column.
   * Cap at two columns so destinations stack under Newton / Prairie View
   * instead of leaving empty vertical space beside a sparse third column.
   */
  lfCardW: 328,
  /** Hard cap — never open a third landfill column even if the band is wide. */
  lfColsMax: 2,
  /** Trailing band for "12 / 34" and the MSW / TOTAL caption. */
  lfCountBand: 104,
  lfRowH: 50,
  lfGap: 8,
  footerH: 32,
} as const;

/** Intrinsic content width of the hour grid (name + Start/hours/Close). */
export function hourGridContentWidth(): number {
  const L = EOD_IMAGE_LAYOUT;
  return L.nameColW + COLS.length * L.hourColW;
}

/** Hour-grid card width (content + inner pad). */
export function hourGridCardWidth(): number {
  const L = EOD_IMAGE_LAYOUT;
  return hourGridContentWidth() + L.gridInnerPad * 2;
}

/** Content width of the station totals table (name + 3 numeric cols). */
export function stationTableContentWidth(): number {
  const L = EOD_IMAGE_LAYOUT;
  return L.tableNameW + L.tableNumW * 3;
}

/** Station totals card width. */
export function stationTableCardWidth(): number {
  const L = EOD_IMAGE_LAYOUT;
  return stationTableContentWidth() + L.tableInnerPad * 2;
}

/** Full content area inside canvas padding. */
export function eodContentWidth(): number {
  const L = EOD_IMAGE_LAYOUT;
  return L.width - L.pad * 2;
}

/** Right-column width beside the hour grid (EOD stat bubbles). */
export function statsColumnWidth(): number {
  const L = EOD_IMAGE_LAYOUT;
  return Math.max(160, eodContentWidth() - hourGridCardWidth() - L.colGap);
}

/** Right-column width beside the station totals (landfill cards). */
export function landfillColumnWidth(): number {
  const L = EOD_IMAGE_LAYOUT;
  return Math.max(L.lfCardW, eodContentWidth() - stationTableCardWidth() - L.colGap);
}

/** How many fixed-width landfill cards fit in the given (or default landfill) column (capped at lfColsMax). */
export function landfillColumnCount(contentWidth = landfillColumnWidth()): number {
  const L = EOD_IMAGE_LAYOUT;
  const avail = Math.max(L.lfCardW, contentWidth);
  const fit = Math.max(1, Math.floor((avail + L.lfGap) / (L.lfCardW + L.lfGap)));
  return Math.min(L.lfColsMax, fit);
}

/** Stacked height of the five compact EOD stat cards (no section title). */
export function eodCardsBlockHeight(): number {
  const L = EOD_IMAGE_LAYOUT;
  return L.cardCount * L.cardsH + (L.cardCount - 1) * L.cardGap;
}

export type EodReportLayout = {
  width: number;
  height: number;
  gridH: number;
  tableH: number;
  lfRows: number;
  lfH: number;
  cardsH: number;
  cardsBlockH: number;
  topBandH: number;
  bottomBandH: number;
  statsColW: number;
  lfColW: number;
};

/** Content-sized canvas metrics (two side-by-side bands; no tall blank frame). */
export function measureEodReportLayout(opts: {
  yardCount: number;
  stationCount: number;
  landfillCount: number;
}): EodReportLayout {
  const L = EOD_IMAGE_LAYOUT;
  const yards = Math.max(0, opts.yardCount);
  const stations = Math.max(0, opts.stationCount);
  const landfills = Math.max(opts.landfillCount, 1);
  const gridH = L.gridHeaderH + yards * L.gridRowH;
  const tableH = L.tableHeaderH + stations * L.tableRowH;
  const lfColW = landfillColumnWidth();
  const lfCols = landfillColumnCount(lfColW);
  const lfRows = Math.ceil(landfills / lfCols);
  const lfH = lfRows * L.lfRowH;
  const cardsBlockH = eodCardsBlockHeight();
  const statsColW = statsColumnWidth();
  const topBandH =
    L.sectionTitleH + Math.max(gridH + L.gridCardPad, cardsBlockH);
  const bottomBandH = Math.max(tableH + L.tableCardPad, L.sectionTitleH + lfH);
  const height =
    L.pad +
    L.titleH +
    topBandH +
    L.sectionGap +
    bottomBandH +
    L.footerH +
    L.pad;
  return {
    width: L.width,
    height,
    gridH,
    tableH,
    lfRows,
    lfH,
    cardsH: L.cardsH,
    cardsBlockH,
    topBandH,
    bottomBandH,
    statsColW,
    lfColW,
  };
}

function priorClose(store: StationCallStore, date: string, stationId: string): string {
  const prev = store[addDays(date, -1)]?.[stationId]?.close;
  if (!stationCellFilled(prev)) return "";
  return parseNumericCell(prev) == null ? "" : String(prev).trim();
}

function hourCell(board: StationDayBoard, stationId: string, key: StationHourKey): string {
  const raw = board[stationId]?.hours[key];
  return stationCellFilled(raw) ? String(raw).trim() : "";
}

function closeCell(board: StationDayBoard, stationId: string): string {
  const raw = board[stationId]?.close;
  return stationCellFilled(raw) ? String(raw).trim() : "";
}

function isZeroish(value: string): boolean {
  const n = parseNumericCell(value);
  return n === 0;
}

export function buildEodReportPng(opts: {
  date: string;
  loads: Load[];
  snapshot: DailyEodTotals | null;
}): string {
  const store = readStationCallStore();
  const board = boardForDate(store, opts.date);
  const yards = stationCallYards();
  const eod = applyDailyEodToSummary(endOfDaySummary(opts.loads, board), opts.snapshot);
  const landfills = rankDestinations(opts.loads);
  const L = EOD_IMAGE_LAYOUT;
  const layout = measureEodReportLayout({
    yardCount: yards.length,
    stationCount: eod.stations.length,
    landfillCount: landfills.length,
  });

  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 2);
  const { width, height, gridH, tableH, cardsH, cardsBlockH, statsColW, lfColW } = layout;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the EOD image");
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(0, 0, width, height);

  const card = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
  };

  let y = L.pad;
  ctx.fillStyle = "#111827";
  ctx.font = canvasFont(700, EOD_IMAGE_TYPE.title);
  ctx.fillText("END OF DAY LOAD COUNT", L.pad, y + 40);
  ctx.font = canvasFont(500, EOD_IMAGE_TYPE.subtitle);
  ctx.fillStyle = "#6b7280";
  ctx.fillText(formatHeaderDate(opts.date), L.pad, y + 68);
  y += L.titleH;

  // Top band: hour grid (left) + End-of-day stat bubbles (right) — fills upper-right.
  const gridCardW = hourGridCardWidth();
  const statsX = L.pad + gridCardW + L.colGap;
  ctx.fillStyle = "#111827";
  ctx.font = canvasFont(700, EOD_IMAGE_TYPE.section);
  ctx.fillText("Load Count By Hour", L.pad, y + 24);
  ctx.fillText("End of day", statsX, y + 24);
  y += L.sectionTitleH;
  const topBodyY = y;
  card(L.pad, topBodyY, gridCardW, gridH + L.gridCardPad);
  drawHourGrid(
    ctx,
    L.pad + L.gridInnerPad,
    topBodyY + 6,
    yards,
    store,
    opts.date,
    board,
    L.nameColW,
    L.hourColW,
    L.gridRowH,
    L.gridHeaderH,
  );
  drawStatCards(ctx, statsX, topBodyY, statsColW, cardsH, eod);
  y = topBodyY + Math.max(gridH + L.gridCardPad, cardsBlockH) + L.sectionGap;

  // Bottom band: station totals (left) + landfills (right).
  const tableCardW = stationTableCardWidth();
  const lfX = L.pad + tableCardW + L.colGap;
  card(L.pad, y, tableCardW, tableH + L.tableCardPad);
  drawStationTable(ctx, L.pad + L.tableInnerPad, y + 6, eod, L.tableHeaderH, L.tableRowH);
  ctx.fillStyle = "#111827";
  ctx.font = canvasFont(700, EOD_IMAGE_TYPE.section);
  ctx.fillText(`Landfill  ·  ${landfills.length} groups`, lfX, y + 24);
  drawLandfills(ctx, lfX, y + L.sectionTitleH, lfColW, landfills, L.lfRowH, L.lfGap);

  return canvas.toDataURL("image/png");
}

function drawHourGrid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  yards: { id: string; label: string }[],
  store: StationCallStore,
  date: string,
  board: StationDayBoard,
  nameColW: number,
  hourColW: number,
  rowH: number,
  headerH: number,
) {
  ctx.font = canvasFont(600, EOD_IMAGE_TYPE.hourHeader);
  ctx.fillStyle = "#6b7280";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  COLS.forEach((col, i) => {
    ctx.fillText(col.label, x + nameColW + i * hourColW + hourColW / 2, y + headerH / 2);
  });
  ctx.textAlign = "left";
  yards.forEach((yard, r) => {
    const ry = y + headerH + r * rowH;
    if (r % 2 === 1) {
      ctx.fillStyle = "#f9fafb";
      ctx.fillRect(x, ry, nameColW + COLS.length * hourColW, rowH);
    }
    ctx.fillStyle = "#111827";
    ctx.font = canvasFont(600, EOD_IMAGE_TYPE.hourCell);
    ctx.textBaseline = "middle";
    ctx.fillText(yard.label, x + 8, ry + rowH / 2);
    COLS.forEach((col, i) => {
      const value =
        col.key === "start"
          ? priorClose(store, date, yard.id)
          : col.key === "close"
            ? closeCell(board, yard.id)
            : hourCell(board, yard.id, col.key);
      const cx = x + nameColW + i * hourColW + hourColW / 2;
      ctx.textAlign = "center";
      ctx.font = canvasFont(600, EOD_IMAGE_TYPE.hourCell);
      ctx.fillStyle = isZeroish(value) ? "#dc2626" : "#111827";
      ctx.fillText(value, cx, ry + rowH / 2);
      ctx.textAlign = "left";
    });
  });
}

/** Label font for EOD summary chips (TRASH / LEACHATE / …). */
const STAT_LABEL_FONT = canvasFont(700, EOD_IMAGE_TYPE.statLabel);
/** Value font for EOD summary chips. */
const STAT_VALUE_FONT = canvasFont(700, EOD_IMAGE_TYPE.statValue);

/**
 * Content-width for one EOD stat chip (label + gap + count + pad), capped by
 * statCardMaxW and the available column width.
 */
export function measureStatCardWidth(
  ctx: CanvasRenderingContext2D,
  label: string,
  count: number | string,
  columnW: number,
): number {
  const L = EOD_IMAGE_LAYOUT;
  ctx.font = STAT_LABEL_FONT;
  const labelW = ctx.measureText(label).width;
  ctx.font = STAT_VALUE_FONT;
  const countW = ctx.measureText(String(count)).width;
  const content =
    L.statCardPadX + labelW + L.statCardInnerGap + countW + L.statCardPadX;
  return Math.min(Math.ceil(content), L.statCardMaxW, Math.max(1, columnW));
}

function drawStatCards(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  eod: EndOfDaySummary,
) {
  const L = EOD_IMAGE_LAYOUT;
  const cards = endOfDayCards(eod);
  const gap = L.cardGap;
  // Uniform chip width from the widest card so the stack is a tight column
  // (not stretched across the full stats band — that left a huge empty middle).
  let chipW = 0;
  for (const item of cards) {
    chipW = Math.max(chipW, measureStatCardWidth(ctx, item.label, item.count, w));
  }
  chipW = Math.min(chipW, L.statCardMaxW, w);
  cards.forEach((item, i) => {
    const cy = y + i * (h + gap);
    ctx.fillStyle = item.emphasis ? "#fef3f2" : "#ffffff";
    ctx.strokeStyle = item.emphasis ? "#fecaca" : "#e5e7eb";
    ctx.lineWidth = 1;
    roundRect(ctx, x, cy, chipW, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#6b7280";
    ctx.font = STAT_LABEL_FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(item.label, x + L.statCardPadX, cy + h / 2);
    ctx.fillStyle = "#111827";
    ctx.font = STAT_VALUE_FONT;
    ctx.textAlign = "right";
    ctx.fillText(String(item.count), x + chipW - L.statCardPadX, cy + h / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  });
}

function drawStationTable(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  eod: EndOfDaySummary,
  headerH: number,
  rowH: number,
) {
  const L = EOD_IMAGE_LAYOUT;
  const cols = [
    { label: "STATION", align: "left" as const, width: L.tableNameW },
    { label: "TOTALS", align: "right" as const, width: L.tableNumW },
    { label: "MSW", align: "right" as const, width: L.tableNumW },
    { label: "CLOSED", align: "right" as const, width: L.tableNumW },
  ];
  ctx.font = canvasFont(700, EOD_IMAGE_TYPE.tableHeader);
  ctx.fillStyle = "#6b7280";
  ctx.textBaseline = "middle";
  let cx = x;
  cols.forEach((col) => {
    ctx.textAlign = col.align;
    ctx.fillText(col.label, col.align === "left" ? cx : cx + col.width, y + headerH / 2);
    cx += col.width;
  });
  eod.stations.forEach((row, i) => {
    const ry = y + headerH + i * rowH + rowH / 2;
    ctx.fillStyle = "#111827";
    ctx.font = canvasFont(600, EOD_IMAGE_TYPE.tableCell);
    let px = x;
    const values = [row.label, String(row.pickedUp), String(row.msw), row.left ?? "\u2014"];
    cols.forEach((col, ci) => {
      ctx.textAlign = col.align;
      ctx.fillText(values[ci], col.align === "left" ? px : px + col.width, ry);
      px += col.width;
    });
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawLandfills(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  rows: RankRow[],
  rowH: number,
  gap: number,
) {
  const L = EOD_IMAGE_LAYOUT;
  const cw = L.lfCardW;
  const cols = landfillColumnCount(w);
  const list = rows.length ? rows : [{ key: "none", label: "No destinations logged", count: 0, trashCount: 0 }];
  /** Name + counts sit close: counts right-aligned in a narrow trailing band, not the far edge of a stretched half-width cell. */
  const countBand = L.lfCountBand;
  const inset = 10;
  const nameMax = cw - inset - countBand - 8;
  const namePx = EOD_IMAGE_TYPE.landfill;
  const capPx = EOD_IMAGE_TYPE.landfillCaption;
  list.forEach((row, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const cx = x + c * (cw + gap);
    const cy = y + r * rowH;
    // 4px stack gap (was 6) so the taller type doesn't loosen the grouping.
    const cardH = rowH - 4;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    roundRect(ctx, cx, cy, cw, cardH, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#111827";
    ctx.font = canvasFont(700, namePx);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const label = truncateLabel(ctx, row.label, nameMax);
    const lineGap = 3;
    const block = namePx + lineGap + capPx;
    const top = Math.max(2, (cardH - block) / 2);
    const nameBaseline = top + Math.round(namePx * 0.78);
    const capBaseline = top + namePx + lineGap + Math.round(capPx * 0.78);
    ctx.fillText(label, cx + inset, cy + nameBaseline);
    const countRight = cx + cw - inset;
    ctx.textAlign = "right";
    ctx.fillText(`${row.trashCount} / ${row.count}`, countRight, cy + nameBaseline);
    ctx.fillStyle = "#9ca3af";
    ctx.font = canvasFont(600, capPx);
    ctx.fillText("MSW / TOTAL", countRight, cy + capBaseline);
    ctx.textAlign = "left";
  });
}

function truncateLabel(ctx: CanvasRenderingContext2D, label: string, maxW: number): string {
  if (ctx.measureText(label).width <= maxW) return label;
  const ell = "\u2026";
  let lo = 0;
  let hi = label.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(label.slice(0, mid) + ell).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return lo <= 0 ? ell : label.slice(0, lo) + ell;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export async function shareEodReportPng(dataUrl: string, date: string): Promise<void> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const name = `EOD-load-count-${date}.png`;
  const file = new File([blob], name, { type: "image/png" });
  const nav = navigator as Navigator & {
    share?: (data: ShareData & { files?: File[] }) => Promise<void>;
    canShare?: (data: ShareData & { files?: File[] }) => boolean;
  };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: `EOD load count ${date}` });
    return;
  }
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = name;
  a.click();
}
