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
import { attachCloudRefresh } from "../lib/cloudRefresh";
import { pollWhenTabs, TODAY_HOT_TABS } from "../lib/cloudRefreshTabs";
import {
  activeCounters,
  addCounter as addCounterPure,
  askingOn as askingOnPure,
  fetchCustomerTalliesFromCloud,
  readCustomerTalliesPersisted,
  reconcileCustomerTallies,
  removeCounter as removeCounterPure,
  setAsking as setAskingPure,
  upsertCountersToCloud,
  upsertDayTalliesToCloud,
  writeCustomerTalliesPersisted,
  type CustomerTalliesState,
  type TallyCounter,
} from "../lib/customerTallies";
import { useAuth } from "./AuthContext";

type CustomerTalliesContextValue = {
  state: CustomerTalliesState;
  counters: TallyCounter[];
  askingOn: (date: string, key: string) => number;
  setAsking: (date: string, key: string, asking: number) => Promise<void>;
  addCounter: (customer: string) => Promise<void>;
  removeCounter: (key: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const CustomerTalliesContext = createContext<CustomerTalliesContextValue | null>(null);

export function CustomerTalliesProvider({ children }: { children: ReactNode }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const userId = user?.id ?? null;
  const [state, setState] = useState<CustomerTalliesState>(() => readCustomerTalliesPersisted());
  const stateRef = useRef(state);
  stateRef.current = state;
  const refreshTailRef = useRef(Promise.resolve());

  const persist = useCallback((next: CustomerTalliesState) => {
    writeCustomerTalliesPersisted(next);
    stateRef.current = next;
    setState(next);
  }, []);

  const refreshInner = useCallback(async () => {
    if (!cloud) return;
    const remote = await fetchCustomerTalliesFromCloud();
    if (!remote.counters && !remote.tallies) return;
    const result = reconcileCustomerTallies(stateRef.current, remote);
    persist(result.next);
    if (remote.counters && result.countersToUpload.length) {
      await upsertCountersToCloud(result.countersToUpload, userId);
    }
    if (remote.tallies && result.talliesToUpload.length) {
      await upsertDayTalliesToCloud(result.talliesToUpload, userId);
    }
  }, [cloud, persist, userId]);

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
    return attachCloudRefresh(refresh, { shouldPoll: pollWhenTabs(TODAY_HOT_TABS) });
  }, [cloud, refresh]);

  const setAsking = useCallback(
    async (date: string, key: string, asking: number) => {
      const result = setAskingPure(stateRef.current, date, key, asking);
      if (!result.tally) return;
      persist(result.state);
      if (cloud) await upsertDayTalliesToCloud([result.tally], userId);
    },
    [cloud, persist, userId],
  );

  const addCounter = useCallback(
    async (customer: string) => {
      const result = addCounterPure(stateRef.current, customer);
      if (!result.counter) return;
      persist(result.state);
      if (cloud) await upsertCountersToCloud([result.counter], userId);
    },
    [cloud, persist, userId],
  );

  const removeCounter = useCallback(
    async (key: string) => {
      const result = removeCounterPure(stateRef.current, key);
      if (!result.counter) return;
      persist(result.state);
      if (cloud) await upsertCountersToCloud([result.counter], userId);
    },
    [cloud, persist, userId],
  );

  const counters = useMemo(() => activeCounters(state), [state]);
  const askingOn = useCallback(
    (date: string, key: string) => askingOnPure(state, date, key),
    [state],
  );

  const value = useMemo<CustomerTalliesContextValue>(
    () => ({ state, counters, askingOn, setAsking, addCounter, removeCounter, refresh }),
    [state, counters, askingOn, setAsking, addCounter, removeCounter, refresh],
  );

  return (
    <CustomerTalliesContext.Provider value={value}>{children}</CustomerTalliesContext.Provider>
  );
}

export function useCustomerTallies(): CustomerTalliesContextValue {
  const ctx = useContext(CustomerTalliesContext);
  if (!ctx) throw new Error("useCustomerTallies must be used within CustomerTalliesProvider");
  return ctx;
}
