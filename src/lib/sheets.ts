import { isTauriRuntime } from "./layout";
import {
  BURNHAM_OOT_PAIRS,
  ROCKFORD_OOT_PAIRS,
  SINGLE_COL_OOT_PAIRS,
  combineOotNames,
  parseBaseHeadcount,
  parseCallOffCsv,
  parseCsv,
  parseOotNames,
  type CallOffRow,
  type OotPair,
} from "./driverAvailability";

export const DEFAULT_ROSTER_SHEET_ID = "1mdNWIsz7LZauHCccQBB7QzjR-Wo9pukGn8HrmODnPpw";
export const DEFAULT_CALLOFF_SHEET_ID = "1FnKGIuWfKCPvcaSwchnIpQjdezHKWC5O23jECPcJzyM";
export const ROSTER_TAB = "Burnham";
export const ROSTER_CELL = "L13";
export const ROSTER_GRID_RANGE = "A:I";

/**
 * Weekday yard tabs on the same roster workbook.
 * Live titles (gviz): Burnham, Rockford, Pontiac, ARC Drivers, Zion.
 * Trailing "!" names fall back to Burnham and must not be used.
 */
export const OOT_YARDS = [
  {
    slug: "burnham",
    tab: "Burnham",
    range: "A:I",
    pairs: BURNHAM_OOT_PAIRS,
    label: "Burnham",
  },
  {
    slug: "rockford",
    tab: "Rockford",
    range: "A:F",
    pairs: ROCKFORD_OOT_PAIRS,
    label: "Rockford",
  },
  {
    slug: "pontiac",
    tab: "Pontiac",
    range: "A:C",
    pairs: SINGLE_COL_OOT_PAIRS,
    label: "Pontiac",
  },
  {
    slug: "arc",
    tab: "ARC Drivers",
    range: "A:C",
    pairs: SINGLE_COL_OOT_PAIRS,
    label: "ARC",
  },
  {
    slug: "zion",
    tab: "Zion",
    range: "A:C",
    pairs: SINGLE_COL_OOT_PAIRS,
    label: "Zion",
  },
] as const satisfies readonly {
  slug: string;
  tab: string;
  range: string;
  pairs: readonly OotPair[];
  label: string;
}[];

export const SATURDAY_CELLS = [
  { slug: "burnham", tab: "Sat-Burnham", range: "I4" },
  { slug: "rockford", tab: "Sat-Rockford", range: "I4" },
  { slug: "pontiac", tab: "Sat-Pontiac", range: "H3" },
  { slug: "arc", tab: "Sat-Arc", range: "H3" },
  { slug: "zion", tab: "Sat-Zion", range: "H3" },
] as const;

const CACHE_KEY = "chitrader.load-tracker.drivers.v1";

export type DriverSnapshot = {
  baseAvailable: number;
  saturdayAvailable: number;
  offs: CallOffRow[];
  ootNames: string[];
  fetchedAt: string;
  source: "live" | "cache";
};

type Cached = {
  version: 1 | 2 | 3;
  baseAvailable: number;
  saturdayAvailable?: number;
  offs: CallOffRow[];
  ootNames?: string[];
  fetchedAt: string;
};

function rosterId(): string {
  return import.meta.env.VITE_ROSTER_SHEET_ID || DEFAULT_ROSTER_SHEET_ID;
}

function calloffId(): string {
  return import.meta.env.VITE_CALLOFF_SHEET_ID || DEFAULT_CALLOFF_SHEET_ID;
}

function googleCsvUrl(sheetId: string, query: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&${query}`;
}
/** Vite `/sheets/*` proxy only exists in `vite dev` / `vite preview`. */
function useSheetProxy(): boolean {
  return !isTauriRuntime() && import.meta.env.DEV;
}


export function rosterFetchUrl(): string {
  const q = `sheet=${encodeURIComponent(ROSTER_TAB)}&range=${ROSTER_CELL}`;
  if (useSheetProxy()) return "/sheets/roster";
  return googleCsvUrl(rosterId(), q);
}

export function rosterGridFetchUrl(): string {
  const q = `sheet=${encodeURIComponent(ROSTER_TAB)}&range=${encodeURIComponent(ROSTER_GRID_RANGE)}`;
  if (useSheetProxy()) return "/sheets/roster-grid";
  return googleCsvUrl(rosterId(), q);
}

export function ootYardFetchUrl(slug: string, tab: string, range: string): string {
  if (useSheetProxy()) return `/sheets/oot/${slug}`;
  return googleCsvUrl(
    rosterId(),
    `sheet=${encodeURIComponent(tab)}&range=${encodeURIComponent(range)}`,
  );
}

export function calloffFetchUrl(): string {
  if (useSheetProxy()) return "/sheets/offs";
  return googleCsvUrl(calloffId(), "gid=0");
}

export function saturdayFetchUrl(slug: string, tab: string, range: string): string {
  if (useSheetProxy()) return `/sheets/sat/${slug}`;
  return googleCsvUrl(rosterId(), `sheet=${encodeURIComponent(tab)}&range=${range}`);
}

export function readDriverCache(): DriverSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (typeof parsed?.baseAvailable !== "number") return null;
    if (!Array.isArray(parsed.offs)) return null;
    return {
      baseAvailable: parsed.baseAvailable,
      saturdayAvailable:
        typeof parsed.saturdayAvailable === "number" ? parsed.saturdayAvailable : 0,
      offs: parsed.offs,
      ootNames: Array.isArray(parsed.ootNames) ? parsed.ootNames : [],
      fetchedAt: parsed.fetchedAt,
      source: "cache",
    };
  } catch {
    return null;
  }
}

function writeDriverCache(snap: Omit<DriverSnapshot, "source">): void {
  const payload: Cached = {
    version: 3,
    baseAvailable: snap.baseAvailable,
    saturdayAvailable: snap.saturdayAvailable,
    offs: snap.offs,
    ootNames: snap.ootNames,
    fetchedAt: snap.fetchedAt,
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sheets HTTP ${res.status}`);
  const text = await res.text();
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<!") || trimmed.toLowerCase().startsWith("<html")) {
    throw new Error("Sheets proxy returned HTML instead of CSV");
  }
  return text;
}

function extractHeadcount(csv: string, label: string): number {
  const table = parseCsv(csv);
  const blob = table.flat().join(" ");
  const n = parseBaseHeadcount(blob);
  if (n === null) throw new Error(`${label} is not a number`);
  return n;
}

export async function fetchDriverSnapshot(): Promise<DriverSnapshot> {
  const satFetches = SATURDAY_CELLS.map((cell) =>
    fetchText(saturdayFetchUrl(cell.slug, cell.tab, cell.range)).then((csv) =>
      extractHeadcount(csv, `${cell.tab}!${cell.range}`),
    ),
  );
  const ootFetches = OOT_YARDS.map((yard) =>
    fetchText(ootYardFetchUrl(yard.slug, yard.tab, yard.range)).then((csv) =>
      parseOotNames(csv, yard.pairs),
    ),
  );
  const [rosterCsv, offsCsv, ootGroups, ...satCounts] = await Promise.all([
    fetchText(rosterFetchUrl()),
    fetchText(calloffFetchUrl()),
    Promise.all(ootFetches),
    ...satFetches,
  ]);
  const saturdayAvailable = satCounts.reduce((sum, n) => sum + n, 0);
  const snap: DriverSnapshot = {
    baseAvailable: extractHeadcount(rosterCsv, "Burnham!L13"),
    saturdayAvailable,
    offs: parseCallOffCsv(offsCsv),
    ootNames: combineOotNames(ootGroups),
    fetchedAt: new Date().toISOString(),
    source: "live",
  };
  writeDriverCache(snap);
  return snap;
}
