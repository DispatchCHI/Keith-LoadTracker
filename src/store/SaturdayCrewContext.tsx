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
  removeVacation,
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
};

const DispatchBoardContext = createContext<DispatchBoardContextValue | null>(null);

export function SaturdayCrewProvider({ children }: { children: ReactNode }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [store, setStore] = useState<DispatchStore>(() => readDispatchStore());
  const storeRef = useRef(store);
  storeRef.current = store;
  const missingRef = useRef(false);
  const refreshTailRef = useRef(Promise.resolve());
  const uploadTailRef = useRef(Promise.resolve());

  const persist = useCallback((next: DispatchStore) => {
    storeRef.current = next;
    writeDispatchStore(next);
    setStore(next);
  }, []);

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
    persist(merged.next);
    for (const board of merged.uploads) {
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
