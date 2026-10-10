import { describe, expect, it } from "vitest";
import { normalizeBoard } from "./saturdayCrew";
import {
  DEFAULT_SAT_FOOTER,
  allYardsSaturday,
  buildWorklistPrintHtml,
  comingSaturday,
  formatAllYardsWorklist,
  formatWorklistDate,
  formatYardWorklist,
  isPastPlanningSaturday,
  worklistTitle,
} from "./satWorklist";
import {
  defaultSatWorklistSettings,
  footerFromBoard,
  footerToBoard,
  mergeFooter,
  setPrefixForSaturday,
  SAT_WORKLIST_SETTINGS_YEAR,
} from "./satWorklistSettings";

const names = [
  { truckNumber: "1234", name: "Driver Name" },
  { truckNumber: "5678", name: "Another Driver" },
];

describe("Saturday Worklist text", () => {
  it("formats one yard exactly as copied", () => {
    expect(
      formatYardWorklist({
        yardLabel: "Burnham",
        saturday: "2026-10-10",
        entries: names,
        footer: DEFAULT_SAT_FOOTER,
      }),
    ).toBe(
      [
        "Saturday Worklist - Burnham - Sat 10/10/26",
        "",
        "1234 Driver Name",
        "5678 Another Driver",
        "",
        "Total Drivers: 2",
        "",
        "Keep phones on case we cut list back",
      ].join("\n"),
    );
  });

  it("adds the Tentative / Final prefix to the title", () => {
    expect(worklistTitle("Final", "Burnham", "2026-10-10")).toBe(
      "Final Saturday Worklist - Burnham - Sat 10/10/26",
    );
    const text = formatYardWorklist({
      yardLabel: "Zion",
      saturday: "2026-10-10",
      entries: [],
      footer: "",
      prefix: "Tentative",
    });
    expect(text).toBe(
      ["Tentative Saturday Worklist - Zion - Sat 10/10/26", "", "(no drivers)", "", "Total Drivers: 0"].join(
        "\n",
      ),
    );
  });

  it("keeps list order and skips blank names; no markdown", () => {
    const text = formatYardWorklist({
      yardLabel: "Rockford",
      saturday: "2026-10-10",
      entries: [names[1], { truckNumber: null, name: "No Emp" }, names[0]],
      footer: "Line one\r\nLine two",
    });
    expect(text.split("\n").slice(2, 5)).toEqual(["5678 Another Driver", "No Emp", "1234 Driver Name"]);
    expect(text.endsWith("Line one\nLine two")).toBe(true);
    expect(text).not.toMatch(/[*#_`]/);
  });

  it("formats all yards with one header, per-yard sections, grand total, footer once", () => {
    const text = formatAllYardsWorklist({
      saturday: "2026-10-10",
      footer: DEFAULT_SAT_FOOTER,
      prefix: "Final",
      yards: [
        { yardLabel: "Burnham", saturday: "2026-10-10", entries: names },
        { yardLabel: "Rockford", saturday: null, entries: [names[0]] },
        { yardLabel: "Pontiac", saturday: "2026-10-17", entries: [] },
      ],
    });
    expect(text).toBe(
      [
        "Final Saturday Worklist - All Yards - Sat 10/10/26",
        "",
        "Burnham - 2 drivers",
        "1234 Driver Name",
        "5678 Another Driver",
        "",
        "Rockford - 1 driver",
        "1234 Driver Name",
        "",
        "Pontiac - Sat 10/17/26 - 0 drivers",
        "(no drivers)",
        "",
        "Total Drivers: 3",
        "",
        "Keep phones on case we cut list back",
      ].join("\n"),
    );
    expect(text.match(/Keep phones/g)).toHaveLength(1);
  });

  it("dates: coming Saturday in Chicago calendar terms and M/D/YY", () => {
    expect(comingSaturday("2026-10-09")).toBe("2026-10-10"); // Fri
    expect(comingSaturday("2026-10-10")).toBe("2026-10-10"); // Sat
    expect(comingSaturday("2026-10-11")).toBe("2026-10-17"); // Sun
    expect(formatWorklistDate("2027-01-02")).toBe("1/2/27");
    expect(allYardsSaturday([null, "2026-10-17"], "2026-10-10")).toBe("2026-10-17");
    expect(allYardsSaturday([null, undefined], "2026-10-10")).toBe("2026-10-10");
  });

  it("print page: title + names + footer, no Total Drivers, no browser header/footer room", () => {
    const html = buildWorklistPrintHtml({
      title: "Saturday Worklist - Burnham - Sat 10/10/26",
      sections: [{ heading: "Burnham", entries: [{ truckNumber: "1", name: "A <b>&</b> B" }] }],
      footer: DEFAULT_SAT_FOOTER,
    });
    expect(html).toContain("A &lt;b&gt;&amp;&lt;/b&gt; B");
    expect(html).toContain("<h1>Saturday Worklist - Burnham - Sat 10/10/26</h1>");
    expect(html).toContain("Keep phones on case we cut list back");
    expect(html).not.toContain("Total Drivers");
    expect(html).toMatch(/@page \{ margin: 0; \}/);
    expect(html).toContain("<title>&#160;</title>");
    expect(html).not.toMatch(/<title>[^<]*Worklist/);
    expect(html).toContain('class="gap"');
  });

  it("all-yards print shows yard names without driver counts", () => {
    const html = buildWorklistPrintHtml({
      title: "Saturday Worklist - All Yards - Sat 10/10/26",
      sections: [
        { heading: "Burnham", entries: names },
        { heading: "Pontiac", entries: [] },
      ],
      footer: DEFAULT_SAT_FOOTER,
    });
    expect(html).toContain("<h2>Burnham</h2>");
    expect(html).toContain("<h2>Pontiac</h2>");
    expect(html).not.toMatch(/\d+ drivers?/);
    expect(html).not.toContain("Total Drivers");
    expect(html.match(/Keep phones/g)).toHaveLength(1);
  });

  it("copied text still carries Total Drivers", () => {
    const text = formatYardWorklist({ yardLabel: "Burnham", saturday: "2026-10-10", entries: names, footer: "" });
    expect(text).toContain("Total Drivers: 2");
  });

  it("flags a saved Planning Saturday before the coming Saturday", () => {
    expect(isPastPlanningSaturday("2026-09-19", "2026-10-09")).toBe(true);
    expect(isPastPlanningSaturday("2026-10-10", "2026-10-09")).toBe(false);
    expect(isPastPlanningSaturday("2026-10-10", "2026-10-10")).toBe(false);
    expect(isPastPlanningSaturday("2026-10-10", "2026-10-11")).toBe(true);
    expect(isPastPlanningSaturday(null, "2026-10-09")).toBe(false);
  });
});

describe("Saturday Worklist footer sync", () => {
  it("a never-edited desk takes the cloud footer and uploads nothing", () => {
    const result = mergeFooter(defaultSatWorklistSettings(), {
      footer: "Phones on",
      updatedAt: "2026-10-09T20:00:00+00:00",
    });
    expect(result.next.footer).toBe("Phones on");
    expect(result.upload).toBeNull();
  });

  it("a newer local edit wins on real instants", () => {
    const local = { ...defaultSatWorklistSettings(), footer: "Mine", footerUpdatedAt: "2026-10-09T21:00:00.000Z" };
    const result = mergeFooter(local, { footer: "Old", updatedAt: "2026-10-09T20:00:00.000000+00:00" });
    expect(result.next.footer).toBe("Mine");
    expect(result.upload).toEqual({ footer: "Mine", updatedAt: "2026-10-09T21:00:00.000Z" });
  });

  it("same instant in Z vs +00:00 does not re-upload", () => {
    const local = { ...defaultSatWorklistSettings(), footer: "Same", footerUpdatedAt: "2026-10-09T21:00:00.000Z" };
    const result = mergeFooter(local, { footer: "Same", updatedAt: "2026-10-09T21:00:00.000000+00:00" });
    expect(result.upload).toBeNull();
  });

  it("the settings row in dispatch_board is ignored by the dispatch board", () => {
    const board = footerToBoard({ footer: "X", updatedAt: "2026-10-09T21:00:00.000Z" });
    expect(normalizeBoard(board, SAT_WORKLIST_SETTINGS_YEAR)).toBeNull();
    expect(footerFromBoard(board)).toEqual({ footer: "X", updatedAt: "2026-10-09T21:00:00.000Z" });
    expect(footerFromBoard({ year: 2026, saturdays: [] })).toBeNull();
  });

  it("remembers the title prefix per Saturday", () => {
    let settings = setPrefixForSaturday(defaultSatWorklistSettings(), "2026-10-10", "Final");
    expect(settings.prefixBySaturday["2026-10-10"]).toBe("Final");
    settings = setPrefixForSaturday(settings, "2026-10-10", "");
    expect(settings.prefixBySaturday["2026-10-10"]).toBeUndefined();
  });
});