import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { attachCloudRefresh, attachCrewTableRealtime } from "../lib/cloudRefresh";
import { DISPATCH_POLL_TABS, pollWhenTabs } from "../lib/cloudRefreshTabs";
import {
  addVacationDay,
  boardForYear,
  ensureDispatchVacationSeed,
  removeVacation,
  seedBoard,
  setCrewStart,
  setCrewWeeks,
  setSaturdayDuty,
  setSaturdayNote,
  type DispatchBoard,
  type DispatchPerson,
  type DispatchStore,
  type SaturdayDuty,
} from "../lib/saturdayCrew";
import {
  fetchDispatchBoards,
  mergeDispatchStores,
  readDispatchStore,
  upsertDispatchBoard,
  writeDispatchStore,
} from "../lib/saturdayCrewCloud";
import { useAuth } from "./AuthContext";

type DispatchBoardContextValue = {
  boardFor: (year: number) => DispatchBoard;
  addDay: (year: number, person: DispatchPerson, date: string) => void;
  removeDay: (year: number, id: string) => void;
  setDuty: (year: number, date: string, duty: SaturdayDuty) => void;
  setNote: (year: number, date: string, note: string) => void;
  setWeeks: (year: number, person: DispatchPerson, weeks: number) => void;
  setStartDate: (year: number, person: DispatchPerson, startDate: string | null) => void;
};

const DispatchBoardContext = createContext<DispatchBoardContextValue | null>(null);

export function SaturdayCrewProvider({ children }: { children: ReactNode }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [store, setStore] = useState<DispatchStore>(() =>
    ensureDispatchVacationSeed(readDispatchStore()),
  );
  const storeRef = useRef(store);
  storeRef.current = store;
  const missingRef = useRef(false);
  const refreshTailRef = useRef(Promise.resolve());
  const uploadTailRef = useRef(Promise.resolve());
  const seedUploadedRef = useRef(false);

  const persist = useCallback((next: DispatchStore) => {
    storeRef.current = next;
    writeDispatchStore(next);
    setStore(next);
  }, []);

  // Persist one-time vacation seed so cloud sync can pick it up.
  useEffect(() => {
    if (seedUploadedRef.current) return;
    seedUploadedRef.current = true;
    const seeded = ensureDispatchVacationSeed(storeRef.current);
    if (seeded !== storeRef.current) persist(seeded);
    else writeDispatchStore(storeRef.current);
  }, [persist]);

  const saveBoard = useCallback(
    (board: DispatchBoard) => {
      const stamped = { ...board, updatedAt: new Date().toISOString() };
      const next: DispatchStore = {
        version: 1,
        years: { ...storeRef.current.years, [String(stamped.year)]: stamped },
      };
      persist(next);
      if (!cloud || missingRef.current) return;
      const userId = user?.id ?? null;
      uploadTailRef.current = uploadTailRef.current.then(async () => {
        if (missingRef.current) return;
        const status = await upsertDispatchBoard(stamped, userId);
        if (status === "missing") missingRef.current = true;
      });
    },
    [cloud, persist, user?.id],
  );

  const refreshInner = useCallback(async () => {
    if (!cloud || missingRef.current) return;
    const pulled = await fetchDispatchBoards();
    if (!pulled.ok) {
      if (pulled.missing) missingRef.current = true;
      return;
    }
    const merged = mergeDispatchStores(storeRef.current, pulled.boards);
    const seeded = ensureDispatchVacationSeed(merged.next);
    persist(seeded);
    const uploads =
      seeded === merged.next
        ? merged.uploads
        : Object.values(seeded.years).filter((board) => {
            const remote = pulled.boards.find((row) => row.year === board.year);
            return !remote || board.updatedAt > remote.updatedAt;
          });
    for (const board of uploads) {
      const status = await upsertDispatchBoard(board, user?.id ?? null);
      if (status === "missing") {
        missingRef.current = true;
        return;
      }
    }
  }, [cloud, persist, user?.id]);

  const refresh = useCallback(() => {
    const run = refreshTailRef.current.then(refreshInner, refreshInner);
    refreshTailRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, [refreshInner]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!cloud) return;
    const stopPoll = attachCloudRefresh(() => {
      void refresh();
    }, { shouldPoll: pollWhenTabs(DISPATCH_POLL_TABS) });
    const stopRealtime = attachCrewTableRealtime("dispatch-board", ["dispatch_board"], () => {
      void refresh();
    });
    return () => {
      stopPoll();
      stopRealtime();
    };
  }, [cloud, refresh]);

  const value = useMemo<DispatchBoardContextValue>(
    () => ({
      boardFor: (year) => boardForYear(store, year),
      addDay: (year, person, date) => {
        const current = boardForYear(storeRef.current, year);
        const next = addVacationDay(current, person, date);
        if (next !== current) saveBoard(next);
      },
      removeDay: (year, id) => {
        const current = boardForYear(storeRef.current, year);
        const next = removeVacation(current, id);
        if (next !== current) saveBoard(next);
      },
      setDuty: (year, date, duty) => {
        const current = boardForYear(storeRef.current, year);
        const next = setSaturdayDuty(current, date, duty);
        if (next !== current) saveBoard(next);
      },
      setNote: (year, date, note) => {
        const current = boardForYear(storeRef.current, year);
        const next = setSaturdayNote(current, date, note);
        if (next !== current) saveBoard(next);
      },
      setWeeks: (year, person, weeks) => {
        const current = boardForYear(storeRef.current, year);
        const next = setCrewWeeks(current, person, weeks);
        if (next !== current) saveBoard(next);
      },
      setStartDate: (year, person, startDate) => {
        const keys = new Set(Object.keys(storeRef.current.years));
        keys.add(String(year));
        // Also touch active vacation bank years so hire dates land there.
        keys.add("2025");
        keys.add("2026");
        const boards = [...keys].flatMap((key) => {
          const current = storeRef.current.years[key] ?? seedBoard(Number(key));
          const next = setCrewStart(current, person, startDate);
          return next === current ? [] : [next];
        });
        for (const board of boards) saveBoard(board);
      },
    }),
    [saveBoard, store],
  );

  return (
    <DispatchBoardContext.Provider value={value}>{children}</DispatchBoardContext.Provider>
  );
}

export function useSaturdayCrew(): DispatchBoardContextValue {
  const ctx = useContext(DispatchBoardContext);
  if (!ctx) throw new Error("useSaturdayCrew requires SaturdayCrewProvider");
  return ctx;
}
