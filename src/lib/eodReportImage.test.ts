import { describe, expect, it } from "vitest";
import {
  EOD_IMAGE_LAYOUT,
  EOD_IMAGE_TYPE,
  eodCardsBlockHeight,
  eodContentWidth,
  hourGridCardWidth,
  hourGridContentWidth,
  landfillColumnCount,
  landfillColumnWidth,
  measureEodReportLayout,
  measureStatCardWidth,
  stationTableCardWidth,
  stationTableContentWidth,
  statsColumnWidth,
} from "./eodReportImage";

/** Previous (pre-tighten / pre-side-by-side) height formula for the same content counts. */
function legacyHeight(yards: number, stations: number, landfills: number): number {
  const pad = 28;
  const rowH = 28;
  const headerH = 30;
  const gridH = headerH + yards * rowH;
  const cardsH = 86;
  const tableRowH = 26;
  const tableH = 28 + stations * tableRowH;
  const lfCols = 2;
  const lfRowH = 52;
  const lfRows = Math.ceil(Math.max(landfills, 1) / lfCols);
  const lfH = 36 + lfRows * lfRowH;
  return pad + 64 + 28 + gridH + 28 + 24 + cardsH + 16 + tableH + 28 + lfH + 36 + pad;
}

describe("EOD_IMAGE_LAYOUT", () => {
  it("scales every EOD canvas font up for email readability", () => {
    expect(EOD_IMAGE_TYPE).toEqual({
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
    });
    // Previous step was 26/15/15/12/13/11/20/12/13/14/10/12. This is a clear jump.
    expect(EOD_IMAGE_TYPE.title).toBeGreaterThan(26);
    expect(EOD_IMAGE_TYPE.hourCell).toBeGreaterThan(13);
    expect(EOD_IMAGE_TYPE.statValue).toBeGreaterThan(20);
    expect(EOD_IMAGE_TYPE.landfill).toBeGreaterThan(14);
    expect(EOD_IMAGE_TYPE.footer).toBeGreaterThan(12);
  });

  it("gives each row enough box for the larger type without opening the chips back up", () => {
    expect(EOD_IMAGE_LAYOUT.pad).toBeLessThanOrEqual(18);
    expect(EOD_IMAGE_LAYOUT.gridRowH).toBeGreaterThanOrEqual(EOD_IMAGE_TYPE.hourCell + 12);
    expect(EOD_IMAGE_LAYOUT.gridRowH).toBeLessThanOrEqual(44);
    expect(EOD_IMAGE_LAYOUT.tableRowH).toBeGreaterThanOrEqual(EOD_IMAGE_TYPE.tableCell + 12);
    expect(EOD_IMAGE_LAYOUT.tableRowH).toBeLessThanOrEqual(44);
    expect(EOD_IMAGE_LAYOUT.cardsH).toBeGreaterThanOrEqual(EOD_IMAGE_TYPE.statValue + 12);
    expect(EOD_IMAGE_LAYOUT.cardsH).toBeLessThanOrEqual(56);
    expect(EOD_IMAGE_LAYOUT.cardGap).toBeLessThanOrEqual(5);
    expect(EOD_IMAGE_LAYOUT.lfRowH).toBeGreaterThanOrEqual(
      EOD_IMAGE_TYPE.landfill + EOD_IMAGE_TYPE.landfillCaption + 14,
    );
    expect(EOD_IMAGE_LAYOUT.lfRowH).toBeLessThanOrEqual(54);
    expect(EOD_IMAGE_LAYOUT.footerH).toBeLessThanOrEqual(32);
    expect(EOD_IMAGE_LAYOUT.sectionGap).toBeLessThanOrEqual(12);
  });

  it("keeps station totals columns compact (not full-canvas percent widths)", () => {
    const tableW = stationTableContentWidth();
    const contentW = eodContentWidth();
    // Dense table should be well under half the canvas content width (leaves room for landfills).
    expect(tableW).toBeLessThan(contentW * 0.45);
    expect(EOD_IMAGE_LAYOUT.tableNameW).toBeLessThanOrEqual(180);
    expect(EOD_IMAGE_LAYOUT.tableNumW).toBeLessThanOrEqual(90);
    expect(tableW).toBe(
      EOD_IMAGE_LAYOUT.tableNameW + EOD_IMAGE_LAYOUT.tableNumW * 3,
    );
  });

  it("packs landfill cards at a fixed compact width in the right column", () => {
    expect(EOD_IMAGE_LAYOUT.lfCardW).toBeLessThanOrEqual(340);
    expect(EOD_IMAGE_LAYOUT.lfCardW).toBeGreaterThanOrEqual(220);
    const lfColW = landfillColumnWidth();
    const cols = landfillColumnCount(lfColW);
    // Two-up stacks destinations under Newton / Prairie View (no sparse third column).
    expect(cols).toBe(2);
    expect(EOD_IMAGE_LAYOUT.lfColsMax).toBe(2);
    const used =
      cols * EOD_IMAGE_LAYOUT.lfCardW + (cols - 1) * EOD_IMAGE_LAYOUT.lfGap;
    expect(used).toBeLessThanOrEqual(lfColW);
    // Fixed cards must not stretch to half-canvas width.
    const half = (eodContentWidth() - EOD_IMAGE_LAYOUT.lfGap) / 2;
    expect(EOD_IMAGE_LAYOUT.lfCardW).toBeLessThan(half * 0.75);
  });

  it("gives the hour grid more horizontal room after the font bump", () => {
    // Reclaim space from the right band; keep large type, widen hour cells.
    expect(EOD_IMAGE_LAYOUT.width).toBe(1600);
    expect(EOD_IMAGE_LAYOUT.hourColW).toBeGreaterThanOrEqual(72);
    expect(EOD_IMAGE_LAYOUT.lfColsMax).toBe(2);
    expect(landfillColumnCount()).toBe(2);
    // Stats chips stay content-width; band still usable beside the wider grid.
    expect(statsColumnWidth()).toBeGreaterThanOrEqual(280);
  });

  it("places hour grid and EOD stats in side-by-side columns (no blank upper-right)", () => {
    const gridW = hourGridCardWidth();
    const statsW = statsColumnWidth();
    const contentW = eodContentWidth();
    expect(hourGridContentWidth()).toBe(
      EOD_IMAGE_LAYOUT.nameColW + 12 * EOD_IMAGE_LAYOUT.hourColW,
    );
    expect(gridW + EOD_IMAGE_LAYOUT.colGap + statsW).toBe(contentW);
    // Stats column is a real usable band, not a sliver.
    expect(statsW).toBeGreaterThanOrEqual(280);
    expect(eodCardsBlockHeight()).toBe(
      EOD_IMAGE_LAYOUT.cardCount * EOD_IMAGE_LAYOUT.cardsH +
        (EOD_IMAGE_LAYOUT.cardCount - 1) * EOD_IMAGE_LAYOUT.cardGap,
    );
  });

  it("keeps End-of-day summary chips compact (content-width, not full stats column)", () => {
    const statsW = statsColumnWidth();
    // Cap at ~half the wide stats band so label/number sit close (no empty middle).
    expect(EOD_IMAGE_LAYOUT.statCardMaxW).toBeLessThanOrEqual(Math.ceil(statsW / 2) + 2);
    expect(EOD_IMAGE_LAYOUT.statCardMaxW).toBeLessThanOrEqual(300);
    expect(EOD_IMAGE_LAYOUT.statCardMaxW).toBeGreaterThanOrEqual(160);
    expect(EOD_IMAGE_LAYOUT.statCardPadX).toBeLessThanOrEqual(14);
    expect(EOD_IMAGE_LAYOUT.statCardInnerGap).toBeLessThanOrEqual(18);

    // jsdom Canvas measureText is stubby; assert the cap path with a fixed wide measure.
    const fakeCtx = {
      font: "",
      measureText(s: string) {
        const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 16);
        // Approximate bold UI sans (~0.62em) so the cap path sees real content width.
        return { width: String(s).length * px * 0.62 };
      },
    } as unknown as CanvasRenderingContext2D;
    const chipW = measureStatCardWidth(fakeCtx, "WALKING-FLOOR", 999, statsW);
    expect(chipW).toBeLessThanOrEqual(EOD_IMAGE_LAYOUT.statCardMaxW);
    expect(chipW).toBeLessThan(statsW * 0.55);
    expect(chipW).toBeGreaterThan(100);
  });

  it("places station totals and landfills in side-by-side columns", () => {
    const tableW = stationTableCardWidth();
    const lfW = landfillColumnWidth();
    expect(tableW + EOD_IMAGE_LAYOUT.colGap + lfW).toBe(eodContentWidth());
    expect(lfW).toBeGreaterThan(tableW);
    expect(landfillColumnCount(lfW)).toBe(2);
  });
});

describe("measureEodReportLayout", () => {
  it("sizes height to two side-by-side bands and is shorter than the legacy formula", () => {
    const yards = 17;
    const stations = 17;
    const landfills = 4;
    const layout = measureEodReportLayout({
      yardCount: yards,
      stationCount: stations,
      landfillCount: landfills,
    });
    const old = legacyHeight(yards, stations, landfills);
    // Larger type spends the old side-by-side savings. Still not a blank poster.
    expect(layout.height).toBeGreaterThan(800);
    expect(layout.height).toBeLessThan(old + 400);
    expect(layout.width).toBe(EOD_IMAGE_LAYOUT.width);
    const lfCols = landfillColumnCount(layout.lfColW);
    expect(layout.lfRows).toBe(Math.ceil(4 / lfCols));
    expect(layout.lfH).toBe(layout.lfRows * EOD_IMAGE_LAYOUT.lfRowH);
    // Top band is hour-grid vs stacked cards (not stacked sections).
    expect(layout.topBandH).toBe(
      EOD_IMAGE_LAYOUT.sectionTitleH +
        Math.max(layout.gridH + EOD_IMAGE_LAYOUT.gridCardPad, layout.cardsBlockH),
    );
    // Bottom band is stations vs landfills side-by-side.
    expect(layout.bottomBandH).toBe(
      Math.max(
        layout.tableH + EOD_IMAGE_LAYOUT.tableCardPad,
        EOD_IMAGE_LAYOUT.sectionTitleH + layout.lfH,
      ),
    );
    // Footer band is small — no tall blank bottom reserved beyond footerH + pad.
    expect(EOD_IMAGE_LAYOUT.footerH + EOD_IMAGE_LAYOUT.pad).toBeLessThanOrEqual(48);
  });

  it("grows with more landfill rows and yards", () => {
    const small = measureEodReportLayout({ yardCount: 2, stationCount: 2, landfillCount: 1 });
    const big = measureEodReportLayout({ yardCount: 20, stationCount: 20, landfillCount: 9 });
    expect(big.height).toBeGreaterThan(small.height);
    expect(big.gridH).toBeGreaterThan(small.gridH);
    expect(big.lfRows).toBe(Math.ceil(9 / landfillColumnCount(big.lfColW)));
  });
});
