/**
 * 1.1.57: dispatcher-arranged Log Load pickup chips.
 * Four columns of stationOrderKey values, saved locally and shared as the
 * crew row. Display labels are never rewritten — keys only decide position.
 */

import {
  PICKUP_GRID_COLLAPSED_ROWS,
  PICKUP_GRID_OVERFLOW_FIRST,
  layoutPickupGrid,
} from "./pickupChipOrder";
import { stationOrderKey } from "./transferStationOrder";

export const PICKUP_CHIP_COLUMNS = 4;

export const PICKUP_CHIP_LAYOUT_KEY = "chitrader.load-tracker.pickup-chip-layout.v1";
export const PICKUP_CHIP_LAYOUT_META_KEY = "chitrader.load-tracker.pickup-chip-layout.meta.v1";

/** Fired after localStorage changes (this desk or a cloud pull). */
export const PICKUP_CHIP_LAYOUT_EVENT = "klt-pickup-chip-layout";

/** Fired after a dispatcher save so the crew sync pushes immediately. */
export const PICKUP_CHIP_LAYOUT_FLUSH_EVENT = "klt-pickup-chip-layout-flush";

export type PickupChipColumns = string[][];

type StoredLayout = {
  columns: PickupChipColumns;
  updatedAt: string;
};

let cachedRaw: string | null | undefined;
let cached: StoredLayout | null = null;

function emptyColumns(): PickupChipColumns {
  return [[], [], [], []];
}

function notifyLayout(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PICKUP_CHIP_LAYOUT_EVENT));
}

function readMeta(): string {
  try {
    const raw = localStorage.getItem(PICKUP_CHIP_LAYOUT_META_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { updatedAt?: unknown };
    return typeof parsed.updatedAt === "string" ? parsed.updatedAt : "";
  } catch {
    return "";
  }
}

/** Four columns of normalized keys. First column to mention a key wins. */
export function normalizeLayoutColumns(raw: unknown): PickupChipColumns {
  const cols = emptyColumns();
  if (!Array.isArray(raw)) return cols;
  const seen = new Set<string>();
  for (let i = 0; i < PICKUP_CHIP_COLUMNS; i++) {
    const col = raw[i];
    if (!Array.isArray(col)) continue;
    for (const entry of col) {
      if (typeof entry !== "string") continue;
      const key = stationOrderKey(entry);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      cols[i]!.push(key);
    }
  }
  return cols;
}

export function pickupColumnsHaveKeys(columns: readonly (readonly string[])[] | null | undefined): boolean {
  return !!columns?.some((col) => col.length > 0);
}

function parseStored(raw: string | null): StoredLayout | null {
  if (!raw) return null;
  try {
    return { columns: normalizeLayoutColumns(JSON.parse(raw) as unknown), updatedAt: readMeta() };
  } catch {
    return null;
  }
}

function readToken(): string | null {
  try {
    const columns = localStorage.getItem(PICKUP_CHIP_LAYOUT_KEY);
    const meta = localStorage.getItem(PICKUP_CHIP_LAYOUT_META_KEY);
    if (columns == null && !meta) return null;
    return `${columns ?? ""}\u0000${meta ?? ""}`;
  } catch {
    return null;
  }
}

function readStored(): StoredLayout | null {
  const token = readToken();
  if (cachedRaw === token) return cached;
  cachedRaw = token;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PICKUP_CHIP_LAYOUT_KEY);
  } catch {
    raw = null;
  }
  cached = parseStored(raw);
  return cached;
}

function writeStored(columns: PickupChipColumns, updatedAt: string, flush: boolean): void {
  const normalized = normalizeLayoutColumns(columns);
  const payload = JSON.stringify(normalized);
  const meta = JSON.stringify({ updatedAt });
  const token = `${payload}\u0000${meta}`;
  if (cachedRaw === token) return;
  try {
    localStorage.setItem(PICKUP_CHIP_LAYOUT_KEY, payload);
  } catch {
    /* private mode */
  }
  try {
    localStorage.setItem(PICKUP_CHIP_LAYOUT_META_KEY, meta);
  } catch {
    /* private mode */
  }
  cachedRaw = token;
  cached = { columns: normalized, updatedAt };
  notifyLayout();
  if (flush) flushPickupChipLayout();
}

/** Active custom order, or null when the desk is on the default grid. */
export function readPickupChipLayout(): PickupChipColumns | null {
  const stored = readStored();
  if (!stored || !pickupColumnsHaveKeys(stored.columns)) return null;
  return stored.columns;
}

export function readPickupChipLayoutUpdatedAt(): string {
  return readStored()?.updatedAt || readMeta();
}

/** Columns to push, including an explicit empty reset. */
export function readPickupChipLayoutForPush(): PickupChipColumns {
  return readStored()?.columns ?? emptyColumns();
}

export function subscribePickupChipLayout(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key !== PICKUP_CHIP_LAYOUT_KEY && event.key !== PICKUP_CHIP_LAYOUT_META_KEY) return;
    cachedRaw = undefined;
    listener();
  };
  window.addEventListener(PICKUP_CHIP_LAYOUT_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PICKUP_CHIP_LAYOUT_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getPickupChipLayoutSnapshot(): PickupChipColumns | null {
  return readPickupChipLayout();
}

/** Replace the local order from a cloud row. Does not push. */
export function applyPickupChipLayoutRemote(incoming: unknown, updatedAt: string): PickupChipColumns {
  const columns = normalizeLayoutColumns(incoming);
  writeStored(columns, updatedAt || new Date().toISOString(), false);
  return columns;
}

/** Persist a full 4-column order and ask the crew sync to push. */
export function savePickupChipLayout(columns: readonly (readonly string[])[]): PickupChipColumns {
  const normalized = normalizeLayoutColumns(columns);
  writeStored(normalized, new Date().toISOString(), true);
  return normalized;
}

/** Clear the custom order and push that reset to the other desks. */
export function resetPickupChipLayout(): void {
  writeStored(emptyColumns(), new Date().toISOString(), true);
}

export function flushPickupChipLayout(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PICKUP_CHIP_LAYOUT_FLUSH_EVENT));
}

function takeMatches<T>(pool: T[], key: string, nameOf: (item: T) => string): T[] {
  const hits: T[] = [];
  for (let i = 0; i < pool.length; ) {
    if (stationOrderKey(nameOf(pool[i]!)) === key) hits.push(...pool.splice(i, 1));
    else i++;
  }
  return hits;
}

/**
 * New pickups (not in the saved order) follow the default overflow rule:
 * preferred overflow names first, then A–Z, split across columns 3 and 4.
 */
function orderLeftovers<T>(pool: T[], nameOf: (item: T) => string): T[] {
  const first: T[] = [];
  for (const name of PICKUP_GRID_OVERFLOW_FIRST) {
    first.push(...takeMatches(pool, stationOrderKey(name), nameOf));
  }
  const rest = pool.sort((a, b) => nameOf(a).localeCompare(nameOf(b), "en"));
  return [...first, ...rest];
}

/**
 * Default grid when no custom order is saved. Otherwise place each live pickup
 * in its saved column/slot. Missing keys leave no blank chip. Pickups the
 * saved order has never seen are appended with the overflow balance.
 */
export function layoutPickupGridWithOrder<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  saved: readonly (readonly string[])[] | null,
): T[][] {
  if (!pickupColumnsHaveKeys(saved)) return layoutPickupGrid(items, nameOf);
  const pool = [...items];
  const placed: T[][] = emptyColumns().map(() => [] as T[]);
  const columns = normalizeLayoutColumns(saved);
  for (let col = 0; col < PICKUP_CHIP_COLUMNS; col++) {
    for (const key of columns[col]!) placed[col]!.push(...takeMatches(pool, key, nameOf));
  }
  const leftovers = orderLeftovers(pool, nameOf);
  const split = Math.ceil(leftovers.length / 2);
  placed[2]!.push(...leftovers.slice(0, split));
  placed[3]!.push(...leftovers.slice(split));
  return placed;
}

export function pickupColumnKeys<T>(
  columns: readonly (readonly T[])[],
  nameOf: (item: T) => string,
): PickupChipColumns {
  return normalizeLayoutColumns(columns.map((col) => col.map((item) => nameOf(item))));
}

/**
 * Move one key. `to.index` is the insert index in the column *before* the
 * source chip is removed (standard drag-and-drop slot). Hidden chips stay in
 * their column as long as the caller only inserts inside that column.
 */
function copyColumns(columns: readonly (readonly string[])[]): PickupChipColumns {
  const next = emptyColumns();
  for (let i = 0; i < PICKUP_CHIP_COLUMNS; i++) {
    const col = columns[i];
    next[i] = Array.isArray(col) ? col.filter((key): key is string => typeof key === "string" && key.length > 0) : [];
  }
  return next;
}

export function movePickupChip(
  columns: readonly (readonly string[])[],
  from: { col: number; index: number },
  to: { col: number; index: number },
): PickupChipColumns {
  // Copy as-is so the indexes match the grid on screen. Normalizing here would
  // collapse alias duplicates and shift those indexes before the splice.
  const next = copyColumns(columns);
  if (from.col < 0 || from.col >= PICKUP_CHIP_COLUMNS) return next;
  if (to.col < 0 || to.col >= PICKUP_CHIP_COLUMNS) return next;
  const source = next[from.col]!;
  if (from.index < 0 || from.index >= source.length) return next;
  const item = source.splice(from.index, 1)[0];
  if (!item) return next;
  let insertAt = to.index;
  if (from.col === to.col && from.index < to.index) insertAt -= 1;
  const dest = next[to.col]!;
  if (insertAt < 0) insertAt = 0;
  if (insertAt > dest.length) insertAt = dest.length;
  dest.splice(insertAt, 0, item);
  return next;
}

export function samePickupColumns(
  a: readonly (readonly string[])[],
  b: readonly (readonly string[])[],
): boolean {
  const left = normalizeLayoutColumns(a);
  const right = normalizeLayoutColumns(b);
  for (let i = 0; i < PICKUP_CHIP_COLUMNS; i++) {
    const colA = left[i]!;
    const colB = right[i]!;
    if (colA.length !== colB.length) return false;
    for (let j = 0; j < colA.length; j++) if (colA[j] !== colB[j]) return false;
  }
  return true;
}

/**
 * Insert index for a pointer over a column. `overIndex` is the full-column
 * index of the chip under the pointer, or null for the tail under the last
 * visible chip. Collapsed drops stay inside the visible prefix so chips below
 * row 5 are not flattened away.
 */
export function pickupDropIndex(opts: {
  columnLength: number;
  collapsed: boolean;
  overIndex: number | null;
  after: boolean;
}): number {
  const limit = opts.collapsed
    ? Math.min(PICKUP_GRID_COLLAPSED_ROWS, Math.max(0, opts.columnLength))
    : Math.max(0, opts.columnLength);
  if (opts.overIndex == null || opts.overIndex < 0 || opts.overIndex >= limit) return limit;
  const next = opts.overIndex + (opts.after ? 1 : 0);
  if (next < 0) return 0;
  if (next > limit) return limit;
  return next;
}

export type PickupChipRect = { index: number; top: number; height: number };

/** Where a chip lands given the pointer Y and the visible chip boxes. */
export function dropIndexFromRects(opts: {
  columnLength: number;
  collapsed: boolean;
  pointerY: number;
  chips: readonly PickupChipRect[];
}): number {
  for (const chip of opts.chips) {
    if (opts.pointerY < chip.top + chip.height / 2) {
      return pickupDropIndex({
        columnLength: opts.columnLength,
        collapsed: opts.collapsed,
        overIndex: chip.index,
        after: false,
      });
    }
  }
  return pickupDropIndex({
    columnLength: opts.columnLength,
    collapsed: opts.collapsed,
    overIndex: null,
    after: false,
  });
}
