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
import { chicagoToday } from "../lib/chicagoDate";
import {
  applyLiveSheet,
  lockEndedDays,
  lookupDay,
  mergeDayStores,
  projectFutureDay,
  ytdWorkingAverage,
  type DayStore,
  type LockedDay,
} from "../lib/driverDays";
import { fetchRemoteDays, pushDayStore } from "../lib/driverCloud";
import { readDayStore, writeDayStore } from "../lib/driverStore";
import { fetchDriverSnapshot, readDriverCache } from "../lib/sheets";
import { fullDayOffNames, type CallOffRow } from "../lib/driverAvailability";
import { useAuth } from "./AuthContext";

export type DriversStatus = "loading" | "live" | "cached" | "error";

type DriversContextValue = {
  status: DriversStatus;
  error: string | null;
  fetchedAt: string | null;
  baseAvailable: number | null;
  saturdayAvailable: number | null;
  offs: CallOffRow[];
  days: DayStore;
  ootNames: string[];
  availabilityOn: (date: string) => LockedDay | null;
  callOffNamesOn: (date: string) => string[];
  ytdAverage: (today: string) => number | null;
  refresh: () => Promise<void>;
};

const DriversContext = createContext<DriversContextValue | null>(null);

export function DriversProvider({ children }: { children: ReactNode }) {
  const { configured, session } = useAuth();
  const cached = readDriverCache();
  const [status, setStatus] = useState<DriversStatus>(cached ? "cached" : "loading");
  const [error, setError] = useState<string | null>(null);
  const [baseAvailable, setBase] = useState<number | null>(cached?.baseAvailable ?? null);
  const [saturdayAvailable, setSaturday] = useState<number | null>(cached?.saturdayAvailable ?? null);
  const [offs, setOffs] = useState<CallOffRow[]>(cached?.offs ?? []);
  const [fetchedAt, setFetchedAt] = useState<string | null>(cached?.fetchedAt ?? null);
  const [ootNames, setOotNames] = useState<string[]>(cached?.ootNames ?? []);
  const [days, setDays] = useState<DayStore>(() => {
    const current = readDayStore();
    const locked = lockEndedDays(current, chicagoToday(), new Date().toISOString());
    if (locked !== current) writeDayStore(locked);
    return locked;
  });
  const todayRef = useRef(chicagoToday());

  const persistDays = useCallback((next: DayStore) => {
    writeDayStore(next);
    setDays(next);
    if (configured && session) {
      void pushDayStore(next);
    }
  }, [configured, session]);

  const refresh = useCallback(async () => {
    setStatus((prev) => (prev === "live" || prev === "cached" ? prev : "loading"));
    setError(null);
    const today = chicagoToday();
    const now = new Date().toISOString();
    try {
      if (configured && session) {
        const remote = await fetchRemoteDays();
        if (remote) {
          const merged = mergeDayStores(readDayStore(), remote);
          writeDayStore(merged);
          setDays(merged);
        }
      }
      const snap = await fetchDriverSnapshot();
      setBase(snap.baseAvailable);
      setSaturday(snap.saturdayAvailable);
      setOffs(snap.offs);
      setOotNames(snap.ootNames);
      setFetchedAt(snap.fetchedAt);
      const next = applyLiveSheet(
        readDayStore(),
        {
          base: snap.baseAvailable,
          saturdayBase: snap.saturdayAvailable,
          offs: snap.offs,
          ootNames: snap.ootNames,
        },
        today,
        now,
      );
      persistDays(next);
      setStatus("live");
    } catch (err) {
      const cachedNow = readDriverCache();
      if (cachedNow) {
        setBase(cachedNow.baseAvailable);
        setSaturday(cachedNow.saturdayAvailable);
        setOffs(cachedNow.offs);
        setOotNames(cachedNow.ootNames);
        setFetchedAt(cachedNow.fetchedAt);
        const next = applyLiveSheet(
          readDayStore(),
          {
            base: cachedNow.baseAvailable,
            saturdayBase: cachedNow.saturdayAvailable,
            offs: cachedNow.offs,
            ootNames: cachedNow.ootNames,
          },
          today,
          now,
        );
        persistDays(next);
        setStatus("cached");
        setError("Could not refresh sheets â€” showing last pull / locked days.");
      } else if (Object.keys(readDayStore()).length) {
        setStatus("cached");
        setError("Could not refresh sheets â€” showing locked days.");
      } else {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Could not reach Google Sheets.");
      }
    }
  }, [configured, persistDays, session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const freezePastDays = () => {
      const today = chicagoToday();
      const now = new Date().toISOString();
      if (today !== todayRef.current) {
        todayRef.current = today;
        void refresh();
        return;
      }
      const current = readDayStore();
      const locked = lockEndedDays(current, today, now);
      if (locked === current) return;
      persistDays(locked);
    };

    const onVisible = () => {
      freezePastDays();
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    const id = window.setInterval(freezePastDays, 30_000);
    document.addEventListener("visibilitychange", onVisible);
    freezePastDays();
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [persistDays, refresh]);

  const availabilityOn = useCallback(
    (date: string): LockedDay | null => {
      const today = chicagoToday();
      if (date <= today) return lookupDay(days, date);
      if (baseAvailable === null) return null;
      return projectFutureDay(
        {
          base: baseAvailable,
          saturdayBase: saturdayAvailable ?? 0,
          offs,
        },
        date,
        today,
      );
    },
    [days, baseAvailable, saturdayAvailable, offs],
  );

  const callOffNamesOn = useCallback(
    (date: string): string[] => fullDayOffNames(offs, date),
    [offs],
  );

  const value = useMemo<DriversContextValue>(
    () => ({
      status,
      error,
      fetchedAt,
      baseAvailable,
      saturdayAvailable,
      offs,
      days,
      ootNames,
      availabilityOn,
      callOffNamesOn,
      ytdAverage: (today: string) => ytdWorkingAverage(days, today),
      refresh,
    }),
    [
      status,
      error,
      fetchedAt,
      baseAvailable,
      saturdayAvailable,
      offs,
      days,
      ootNames,
      availabilityOn,
      callOffNamesOn,
      refresh,
    ],
  );

  return <DriversContext.Provider value={value}>{children}</DriversContext.Provider>;
}

export function useDrivers(): DriversContextValue {
  const ctx = useContext(DriversContext);
  if (!ctx) throw new Error("useDrivers must be used inside DriversProvider");
  return ctx;
}



