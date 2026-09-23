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

  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 2);
  const pad = 28;
  const width = 1480;
  const hourColW = 56;
  const nameColW = 132;
  const gridW = nameColW + COLS.length * hourColW;
  const rowH = 28;
  const headerH = 30;
  const gridH = headerH + yards.length * rowH;
  const cardsH = 86;
  const tableRowH = 26;
  const tableH = 28 + eod.stations.length * tableRowH;
  const lfCols = 2;
  const lfRowH = 52;
  const lfRows = Math.ceil(Math.max(landfills.length, 1) / lfCols);
  const lfH = 36 + lfRows * lfRowH;
  const height =
    pad +
    64 +
    28 +
    gridH +
    28 +
    24 +
    cardsH +
    16 +
    tableH +
    28 +
    lfH +
    36 +
    pad;

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
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.stroke();
  };

  let y = pad;
  ctx.fillStyle = "#111827";
  ctx.font = "700 26px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("END OF DAY LOAD COUNT", pad, y + 26);
  ctx.font = "500 15px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.fillText(`${formatHeaderDate(opts.date)}  ·  Keith's Load Tracker`, pad, y + 50);
  y += 64;

  ctx.fillStyle = "#111827";
  ctx.font = "700 15px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Load Count By Hour", pad, y + 16);
  y += 28;
  card(pad, y, width - pad * 2, gridH + 16);
  drawHourGrid(ctx, pad + 10, y + 8, gridW, yards, store, opts.date, board, nameColW, hourColW, rowH, headerH);
  y += gridH + 28;

  ctx.fillStyle = "#111827";
  ctx.font = "700 15px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("End of day", pad, y + 16);
  y += 24;
  drawStatCards(ctx, pad, y, width - pad * 2, cardsH, eod);
  y += cardsH + 16;
  card(pad, y, width - pad * 2, tableH + 12);
  drawStationTable(ctx, pad + 12, y + 8, width - pad * 2 - 24, eod);
  y += tableH + 28;

  ctx.fillStyle = "#111827";
  ctx.font = "700 15px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`Landfill  ·  ${landfills.length} groups`, pad, y + 16);
  y += 28;
  drawLandfills(ctx, pad, y, width - pad * 2, landfills, lfCols, lfRowH);

  ctx.fillStyle = "#9ca3af";
  ctx.font = "500 12px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("For informational purposes only", pad, height - 16);

  return canvas.toDataURL("image/png");
}

function drawHourGrid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  _gridW: number,
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
  const gap = 10;
  const cw = (w - gap * (cards.length - 1)) / cards.length;
  cards.forEach((card, i) => {
    const cx = x + i * (cw + gap);
    ctx.fillStyle = card.emphasis ? "#fef3f2" : "#ffffff";
    ctx.strokeStyle = card.emphasis ? "#fecaca" : "#e5e7eb";
    ctx.lineWidth = 1;
    roundRect(ctx, cx, y, cw, h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#6b7280";
    ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(card.label, cx + cw / 2, y + 22);
    ctx.fillStyle = "#111827";
    ctx.font = "700 32px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(String(card.count), cx + cw / 2, y + 58);
    ctx.textAlign = "left";
  });
}

function drawStationTable(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  eod: EndOfDaySummary,
) {
  const cols = [
    { label: "STATION", key: "label", align: "left" as const, width: w * 0.4 },
    { label: "TOTALS", key: "pickedUp", align: "right" as const, width: w * 0.2 },
    { label: "MSW", key: "msw", align: "right" as const, width: w * 0.2 },
    { label: "CLOSED", key: "left", align: "right" as const, width: w * 0.2 },
  ];
  ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#6b7280";
  let cx = x;
  cols.forEach((col) => {
    ctx.textAlign = col.align;
    ctx.fillText(col.label, col.align === "left" ? cx : cx + col.width, y + 12);
    cx += col.width;
  });
  eod.stations.forEach((row, i) => {
    const ry = y + 28 + i * 26;
    ctx.fillStyle = "#111827";
    ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
    let px = x;
    const values = [row.label, String(row.pickedUp), String(row.msw), row.left ?? "—"];
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
  cols: number,
  rowH: number,
) {
  const gap = 10;
  const cw = (w - gap) / cols;
  const list = rows.length ? rows : [{ key: "none", label: "No destinations logged", count: 0, trashCount: 0 }];
  list.forEach((row, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const cx = x + c * (cw + gap);
    const cy = y + r * rowH;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    roundRect(ctx, cx, cy, cw, rowH - 8, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#111827";
    ctx.font = "700 14px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(row.label, cx + 14, cy + 28);
    ctx.textAlign = "right";
    ctx.fillText(`${row.trashCount} / ${row.count}`, cx + cw - 14, cy + 22);
    ctx.fillStyle = "#9ca3af";
    ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("MSW / TOTAL", cx + cw - 14, cy + 36);
    ctx.textAlign = "left";
  });
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
