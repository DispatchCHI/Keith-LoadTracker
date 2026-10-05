import {
  normalizeBoard,
  type DispatchBoard,
  type DispatchStore,
} from "./saturdayCrew";
import { isIsoAfter, pickNewerByUpdatedAt } from "./isoTime";
import { safeSetItem } from "./localStorageSafe";
import { getSupabase } from "./supabase";

const STORAGE_KEY = "chitrader.load-tracker.dispatch-board.v1";

export function emptyDispatchStore(): DispatchStore {
  return { version: 1, years: {} };
}

export function readDispatchStore(): DispatchStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDispatchStore();
    const parsed = JSON.parse(raw) as DispatchStore;
    if (!parsed || parsed.version !== 1 || !parsed.years || typeof parsed.years !== "object") {
      return emptyDispatchStore();
    }
    const years: DispatchStore["years"] = {};
    for (const [key, value] of Object.entries(parsed.years)) {
      const year = Number(key);
      const board = normalizeBoard(value, year);
      if (board) years[key] = board;
    }
    return { version: 1, years };
  } catch {
    return emptyDispatchStore();
  }
}

export function writeDispatchStore(store: DispatchStore): void {
  safeSetItem(STORAGE_KEY, JSON.stringify(store));
}

type CloudRow = {
  year: number;
  board: unknown;
  updated_at: string;
};

export type DispatchCloudPull =
  | { ok: true; boards: DispatchBoard[] }
  | { ok: false; missing: boolean };

function missingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    text.includes("42p01") ||
    text.includes("pgrst205") ||
    text.includes("does not exist") ||
    text.includes("schema cache")
  );
}

export async function fetchDispatchBoards(): Promise<DispatchCloudPull> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, missing: false };
  const { data, error } = await supabase
    .from("dispatch_board")
    .select("year, board, updated_at");
  if (error) return { ok: false, missing: missingTable(error) };
  const boards: DispatchBoard[] = [];
  for (const row of (data ?? []) as CloudRow[]) {
    const board = normalizeBoard(row.board, row.year);
    if (!board) continue;
    boards.push({ ...board, updatedAt: row.updated_at || board.updatedAt });
  }
  return { ok: true, boards };
}

export async function upsertDispatchBoard(
  board: DispatchBoard,
  userId: string | null,
): Promise<"ok" | "missing" | "error"> {
  const supabase = getSupabase();
  if (!supabase) return "error";
  const { error } = await supabase.from("dispatch_board").upsert(
    {
      year: board.year,
      board,
      updated_at: board.updatedAt,
      updated_by: userId,
    },
    { onConflict: "year" },
  );
  if (!error) return "ok";
  return missingTable(error) ? "missing" : "error";
}

/**
 * Last-writer-wins per year. Compare parsed instants (not raw strings) so a
 * PostgREST `+00:00` echo of a client `Z` stamp cannot look older and bounce
 * forever through Realtime.
 */
export function mergeDispatchStores(
  local: DispatchStore,
  remote: DispatchBoard[],
): { next: DispatchStore; uploads: DispatchBoard[] } {
  const years = { ...local.years };
  const uploads: DispatchBoard[] = [];
  const remoteYears = new Set<string>();
  for (const board of remote) {
    const key = String(board.year);
    remoteYears.add(key);
    const current = years[key];
    years[key] = current ? pickNewerByUpdatedAt(current, board) : board;
  }
  for (const [key, board] of Object.entries(years)) {
    if (!remoteYears.has(key)) {
      uploads.push(board);
      continue;
    }
    const remoteBoard = remote.find((item) => String(item.year) === key);
    if (remoteBoard && isIsoAfter(board.updatedAt, remoteBoard.updatedAt)) {
      uploads.push(board);
    }
  }
  return { next: { version: 1, years }, uploads };
}
