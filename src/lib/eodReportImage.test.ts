import { describe, expect, it } from "vitest";
import {
  EOD_IMAGE_LAYOUT,
  landfillColumnCount,
  measureEodReportLayout,
  stationTableContentWidth,
} from "./eodReportImage";

/** Previous (pre-tighten) height formula for the same content counts. */
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
  it("keeps padding and row heights denser than the old generous values", () => {
    expect(EOD_IMAGE_LAYOUT.pad).toBeLessThanOrEqual(18);
    expect(EOD_IMAGE_LAYOUT.gridRowH).toBeLessThanOrEqual(26);
    expect(EOD_IMAGE_LAYOUT.tableRowH).toBeLessThanOrEqual(24);
    expect(EOD_IMAGE_LAYOUT.cardsH).toBeLessThanOrEqual(72);
    expect(EOD_IMAGE_LAYOUT.lfRowH).toBeLessThanOrEqual(46);
    expect(EOD_IMAGE_LAYOUT.footerH).toBeLessThanOrEqual(32);
    expect(EOD_IMAGE_LAYOUT.sectionGap).toBeLessThanOrEqual(12);
  });

  it("keeps station totals columns compact (not full-canvas percent widths)", () => {
    const tableW = stationTableContentWidth();
    const contentW = EOD_IMAGE_LAYOUT.width - EOD_IMAGE_LAYOUT.pad * 2;
    // Dense table should be well under half the canvas content width.
    expect(tableW).toBeLessThan(contentW * 0.45);
    expect(EOD_IMAGE_LAYOUT.tableNameW).toBeLessThanOrEqual(180);
    expect(EOD_IMAGE_LAYOUT.tableNumW).toBeLessThanOrEqual(90);
    expect(tableW).toBe(
      EOD_IMAGE_LAYOUT.tableNameW + EOD_IMAGE_LAYOUT.tableNumW * 3,
    );
  });

  it("packs landfill cards at a fixed compact width (more than 2 columns)", () => {
    expect(EOD_IMAGE_LAYOUT.lfCardW).toBeLessThanOrEqual(340);
    expect(EOD_IMAGE_LAYOUT.lfCardW).toBeGreaterThanOrEqual(220);
    const cols = landfillColumnCount();
    expect(cols).toBeGreaterThanOrEqual(3);
    // Fixed cards must not stretch to half-canvas width.
    const half = (EOD_IMAGE_LAYOUT.width - EOD_IMAGE_LAYOUT.pad * 2 - EOD_IMAGE_LAYOUT.lfGap) / 2;
    expect(EOD_IMAGE_LAYOUT.lfCardW).toBeLessThan(half * 0.75);
  });
});

describe("measureEodReportLayout", () => {
  it("sizes height to content and is shorter than the legacy fixed-style formula", () => {
    const yards = 17;
    const stations = 17;
    const landfills = 4;
    const layout = measureEodReportLayout({
      yardCount: yards,
      stationCount: stations,
      landfillCount: landfills,
    });
    const old = legacyHeight(yards, stations, landfills);
    expect(layout.height).toBeLessThan(old);
    expect(layout.height).toBeLessThan(old - 150);
    expect(layout.width).toBe(EOD_IMAGE_LAYOUT.width);
    expect(layout.lfRows).toBe(Math.ceil(4 / landfillColumnCount()));
    expect(layout.lfH).toBe(layout.lfRows * EOD_IMAGE_LAYOUT.lfRowH);
    // Footer band is small — no tall blank bottom reserved beyond footerH + pad.
    expect(EOD_IMAGE_LAYOUT.footerH + EOD_IMAGE_LAYOUT.pad).toBeLessThanOrEqual(48);
  });

  it("grows with more landfill rows and yards", () => {
    const small = measureEodReportLayout({ yardCount: 2, stationCount: 2, landfillCount: 1 });
    const big = measureEodReportLayout({ yardCount: 20, stationCount: 20, landfillCount: 9 });
    expect(big.height).toBeGreaterThan(small.height);
    expect(big.gridH).toBeGreaterThan(small.gridH);
    expect(big.lfRows).toBe(Math.ceil(9 / landfillColumnCount()));
  });
});
