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

/** Shared spacing for the EOD PNG — kept tight so the canvas hugs content. */
export const EOD_IMAGE_LAYOUT = {
  pad: 16,
  width: 1480,
  titleH: 50,
  sectionTitleH: 20,
  sectionGap: 10,
  hourColW: 56,
  nameColW: 132,
  gridHeaderH: 24,
  gridRowH: 24,
  gridCardPad: 12,
  cardsH: 68,
  afterCardsGap: 10,
  tableHeaderH: 22,
  tableRowH: 22,
  tableCardPad: 10,
  /** Station totals: fixed dense cols (not % of full canvas). */
  tableNameW: 148,
  tableNumW: 72,
  /** Landfill cards: fixed width + packed columns (not 2 stretched half-width cards). */
  lfCardW: 300,
  lfRowH: 42,
  lfGap: 8,
  footerH: 28,
} as const;

/** How many fixed-width landfill cards fit across the content area. */
export function landfillColumnCount(contentWidth = EOD_IMAGE_LAYOUT.width - EOD_IMAGE_LAYOUT.pad * 2): number {
  const L = EOD_IMAGE_LAYOUT;
  const avail = Math.max(L.lfCardW, contentWidth);
  return Math.max(1, Math.floor((avail + L.lfGap) / (L.lfCardW + L.lfGap)));
}

/** Content width of the station totals table (name + 3 numeric cols). */
export function stationTableContentWidth(): number {
  const L = EOD_IMAGE_LAYOUT;
  return L.tableNameW + L.tableNumW * 3;
}

export type EodReportLayout = {
  width: number;
  height: number;
  gridH: number;
  tableH: number;
  lfRows: number;
  lfH: number;
  cardsH: number;
};

/** Content-sized canvas metrics (no tall fixed frame / blank bottom). */
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
  const lfCols = landfillColumnCount();
  const lfRows = Math.ceil(landfills / lfCols);
  const lfH = lfRows * L.lfRowH;
  const height =
    L.pad +
    L.titleH +
    L.sectionTitleH +
    gridH +
    L.gridCardPad +
    L.sectionGap +
    L.sectionTitleH +
    L.cardsH +
    L.afterCardsGap +
    tableH +
    L.tableCardPad +
    L.sectionGap +
    L.sectionTitleH +
    lfH +
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
  const { width, height, gridH, tableH, cardsH } = layout;

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
  ctx.font = "700 24px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("END OF DAY LOAD COUNT", L.pad, y + 22);
  ctx.font = "500 14px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.fillText(`${formatHeaderDate(opts.date)}  \u00b7  Keith's Load Tracker`, L.pad, y + 42);
  y += L.titleH;

  ctx.fillStyle = "#111827";
  ctx.font = "700 14px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Load Count By Hour", L.pad, y + 14);
  y += L.sectionTitleH;
  card(L.pad, y, width - L.pad * 2, gridH + L.gridCardPad);
  drawHourGrid(
    ctx,
    L.pad + 8,
    y + 6,
    yards,
    store,
    opts.date,
    board,
    L.nameColW,
    L.hourColW,
    L.gridRowH,
    L.gridHeaderH,
  );
  y += gridH + L.gridCardPad + L.sectionGap;

  ctx.fillStyle = "#111827";
  ctx.font = "700 14px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("End of day", L.pad, y + 14);
  y += L.sectionTitleH;
  drawStatCards(ctx, L.pad, y, width - L.pad * 2, cardsH, eod);
  y += cardsH + L.afterCardsGap;
  const tableInnerW = stationTableContentWidth();
  const tableCardW = Math.min(width - L.pad * 2, tableInnerW + 20);
  card(L.pad, y, tableCardW, tableH + L.tableCardPad);
  drawStationTable(ctx, L.pad + 10, y + 6, eod, L.tableHeaderH, L.tableRowH);
  y += tableH + L.tableCardPad + L.sectionGap;

  ctx.fillStyle = "#111827";
  ctx.font = "700 14px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`Landfill  \u00b7  ${landfills.length} groups`, L.pad, y + 14);
  y += L.sectionTitleH;
  drawLandfills(ctx, L.pad, y, width - L.pad * 2, landfills, L.lfRowH, L.lfGap);

  ctx.fillStyle = "#9ca3af";
  ctx.font = "500 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("For informational purposes only", L.pad, height - L.pad + 2);

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
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
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
    ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(yard.label, x + 6, ry + rowH / 2);
    COLS.forEach((col, i) => {
      const value =
        col.key === "start"
          ? priorClose(store, date, yard.id)
          : col.key === "close"
            ? closeCell(board, yard.id)
            : hourCell(board, yard.id, col.key);
      const cx = x + nameColW + i * hourColW + hourColW / 2;
      ctx.textAlign = "center";
      ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = isZeroish(value) ? "#dc2626" : "#111827";
      ctx.fillText(value, cx, ry + rowH / 2);
      ctx.textAlign = "left";
    });
  });
}

function drawStatCards(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  eod: EndOfDaySummary,
) {
  const cards = endOfDayCards(eod);
  const gap = 8;
  const cw = (w - gap * (cards.length - 1)) / cards.length;
  cards.forEach((item, i) => {
    const cx = x + i * (cw + gap);
    ctx.fillStyle = item.emphasis ? "#fef3f2" : "#ffffff";
    ctx.strokeStyle = item.emphasis ? "#fecaca" : "#e5e7eb";
    ctx.lineWidth = 1;
    roundRect(ctx, cx, y, cw, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#6b7280";
    ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(item.label, cx + cw / 2, y + 18);
    ctx.fillStyle = "#111827";
    ctx.font = "700 28px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(String(item.count), cx + cw / 2, y + 48);
    ctx.textAlign = "left";
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
  ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#6b7280";
  let cx = x;
  cols.forEach((col) => {
    ctx.textAlign = col.align;
    ctx.fillText(col.label, col.align === "left" ? cx : cx + col.width, y + headerH / 2 + 2);
    cx += col.width;
  });
  eod.stations.forEach((row, i) => {
    const ry = y + headerH + i * rowH + rowH / 2;
    ctx.fillStyle = "#111827";
    ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    let px = x;
    const values = [row.label, String(row.pickedUp), String(row.msw), row.left ?? "\u2014"];
    cols.forEach((col, ci) => {
      ctx.textAlign = col.align;
      ctx.fillText(values[ci], col.align === "left" ? px : px + col.width, ry);
      px += col.width;
    });
  });
  ctx.textAlign = "left";
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
  /** Name + counts sit close: counts right-aligned in a narrow trailing band, not card far edge of a stretched half-width cell. */
  const countBand = 78;
  const nameMax = cw - 24 - countBand - 8;
  list.forEach((row, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const cx = x + c * (cw + gap);
    const cy = y + r * rowH;
    const cardH = rowH - 6;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    roundRect(ctx, cx, cy, cw, cardH, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#111827";
    ctx.font = "700 13px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    const label = truncateLabel(ctx, row.label, nameMax);
    ctx.fillText(label, cx + 12, cy + 22);
    const countRight = cx + cw - 12;
    ctx.textAlign = "right";
    ctx.fillText(`${row.trashCount} / ${row.count}`, countRight, cy + 18);
    ctx.fillStyle = "#9ca3af";
    ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("MSW / TOTAL", countRight, cy + 30);
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
