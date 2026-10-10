/**
 * Saturday Worklist text + print layout for the Sat Roster tab.
 * Plain text only: the copy goes into the drivers' tablet messaging system.
 */
import { addDays, parseISODate, weekdayOfISO } from "./chicagoDate";
import { formatRosterLine, type DriverRosterEntry } from "./driverRoster";

export const DEFAULT_SAT_FOOTER = "Keep phones on case we cut list back";

export const WORKLIST_PREFIXES = ["", "Tentative", "Final"] as const;
export type WorklistPrefix = (typeof WORKLIST_PREFIXES)[number];

export function isWorklistPrefix(value: unknown): value is WorklistPrefix {
  return value === "" || value === "Tentative" || value === "Final";
}

/** The coming Saturday on the Chicago calendar (today when today is Saturday). */
export function comingSaturday(chicagoTodayIso: string): string {
  const dow = weekdayOfISO(chicagoTodayIso);
  return dow === 6 ? chicagoTodayIso : addDays(chicagoTodayIso, 6 - dow);
}

/** `2026-10-10` -> `10/10/26`. */
export function formatWorklistDate(iso: string): string {
  const { y, m, d } = parseISODate(iso);
  return `${m}/${d}/${String(y % 100).padStart(2, "0")}`;
}

function titleStem(prefix: WorklistPrefix): string {
  return prefix ? `${prefix} Saturday Worklist` : "Saturday Worklist";
}

export function worklistTitle(prefix: WorklistPrefix, place: string, saturday: string): string {
  return `${titleStem(prefix)} - ${place} - Sat ${formatWorklistDate(saturday)}`;
}

function cleanFooter(footer: string | null | undefined): string {
  return (footer ?? "").replace(/\r\n?/g, "\n").trim();
}

function rosterLines(entries: readonly Pick<DriverRosterEntry, "truckNumber" | "name">[]): string[] {
  return entries.map(formatRosterLine).filter(Boolean);
}

export type YardWorklistInput = {
  yardLabel: string;
  saturday: string;
  entries: readonly Pick<DriverRosterEntry, "truckNumber" | "name">[];
  footer: string;
  prefix?: WorklistPrefix;
};

/**
 * One yard:
 *   Saturday Worklist - Burnham - Sat 10/10/26
 *   (blank)
 *   1234 Driver Name   (one per line, list order)
 *   (blank)
 *   Total Drivers: 2
 *   (blank)
 *   Keep phones on case we cut list back
 */
export function formatYardWorklist(input: YardWorklistInput): string {
  const lines = rosterLines(input.entries);
  const out = [worklistTitle(input.prefix ?? "", input.yardLabel, input.saturday), ""];
  out.push(...(lines.length ? lines : ["(no drivers)"]));
  out.push("", `Total Drivers: ${lines.length}`);
  const footer = cleanFooter(input.footer);
  if (footer) out.push("", footer);
  return out.join("\n");
}

export type AllYardsWorklistInput = {
  saturday: string;
  yards: readonly {
    yardLabel: string;
    saturday?: string | null;
    entries: readonly Pick<DriverRosterEntry, "truckNumber" | "name">[];
  }[];
  footer: string;
  prefix?: WorklistPrefix;
};

function yardSectionHeader(
  yard: AllYardsWorklistInput["yards"][number],
  overall: string,
  count: number,
): string {
  const differentDay = yard.saturday && yard.saturday !== overall;
  const day = differentDay ? ` - Sat ${formatWorklistDate(yard.saturday!)}` : "";
  return `${yard.yardLabel}${day} - ${count} driver${count === 1 ? "" : "s"}`;
}

/**
 * Every yard in one message: one header, a section per yard (name + count,
 * then names), a grand total, and the footer once at the end.
 */
export function formatAllYardsWorklist(input: AllYardsWorklistInput): string {
  const out = [worklistTitle(input.prefix ?? "", "All Yards", input.saturday)];
  let total = 0;
  for (const yard of input.yards) {
    const lines = rosterLines(yard.entries);
    total += lines.length;
    out.push("", yardSectionHeader(yard, input.saturday, lines.length));
    out.push(...(lines.length ? lines : ["(no drivers)"]));
  }
  out.push("", `Total Drivers: ${total}`);
  const footer = cleanFooter(input.footer);
  if (footer) out.push("", footer);
  return out.join("\n");
}

/** Overall Saturday for an all-yards message: first yard with a planning date, else the coming Saturday. */
export function allYardsSaturday(
  yardSaturdays: readonly (string | null | undefined)[],
  fallback: string,
): string {
  return yardSaturdays.find((day): day is string => Boolean(day)) ?? fallback;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type PrintSection = {
  heading: string;
  entries: readonly Pick<DriverRosterEntry, "truckNumber" | "name">[];
};

/**
 * Standalone, black-on-white printable page. Names flow down multi-column
 * lists in roster order; each yard section avoids splitting across pages.
 */
export function buildWorklistPrintHtml(input: {
  title: string;
  sections: readonly PrintSection[];
  footer: string;
}): string {
  const total = input.sections.reduce((sum, section) => sum + rosterLines(section.entries).length, 0);
  const many = input.sections.length > 1;
  const sectionHtml = input.sections
    .map((section) => {
      const lines = section.entries
        .map((entry) => {
          const emp = entry.truckNumber?.trim() ?? "";
          const name = formatRosterLine({ truckNumber: null, name: entry.name });
          if (!name) return "";
          return `<li><span class="emp">${escapeHtml(emp)}</span><span class="name">${escapeHtml(name)}</span></li>`;
        })
        .filter(Boolean);
      const body = lines.length
        ? `<ol class="names">${lines.join("")}</ol>`
        : `<p class="none">(no drivers)</p>`;
      const count = lines.length;
      return `<section class="yard">${
        many ? `<h2>${escapeHtml(section.heading)} <span class="count">${count} driver${count === 1 ? "" : "s"}</span></h2>` : ""
      }${body}</section>`;
    })
    .join("");
  const footer = cleanFooter(input.footer);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(input.title)}</title>
<style>
  @page { margin: 0.5in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #000; }
  body { font: 12pt/1.3 Arial, Helvetica, sans-serif; padding: 0.25in; }
  h1 { font-size: 16pt; margin: 0 0 10pt; }
  h2 { font-size: 13pt; margin: 12pt 0 4pt; border-bottom: 1px solid #000; padding-bottom: 2pt; }
  h2 .count { font-weight: normal; font-size: 11pt; }
  .yard { break-inside: avoid; page-break-inside: avoid; }
  .names { list-style: none; margin: 0; padding: 0; columns: ${many ? 4 : 3}; column-gap: 18pt; font-size: ${many ? 10 : 12}pt; }
  .names li { break-inside: avoid; padding: 1pt 0; white-space: nowrap; }
  .emp { display: inline-block; min-width: 4.2em; font-variant-numeric: tabular-nums; }
  .none { margin: 0; font-style: italic; }
  .total { font-weight: bold; margin: 12pt 0 4pt; font-size: 13pt; }
  .footer { margin: 4pt 0 0; font-size: 12pt; white-space: pre-wrap; }
  @media print { body { padding: 0; } }
</style></head>
<body>
<h1>${escapeHtml(input.title)}</h1>
${sectionHtml}
<p class="total">Total Drivers: ${total}</p>
${footer ? `<p class="footer">${escapeHtml(footer)}</p>` : ""}
</body></html>`;
}