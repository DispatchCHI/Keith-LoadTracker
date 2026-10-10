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
import { fetchAllPaged, pagedErrorMessage } from "../lib/cloud";
import { attachCloudRefresh, scheduleCloudRefresh } from "../lib/cloudRefresh";
import { CUSTOMER_LANES_POLL_TABS, pollWhenTabs } from "../lib/cloudRefreshTabs";
import {
  CUSTOMER_BRANDS_EVENT,
  CUSTOMER_BRANDS_FLUSH_EVENT,
  clearCustomerBrandOverride,
  flushCustomerBrandOverrides,
} from "../lib/customerBrands";
import {
  pullAndMergeCustomerBrandOverrides,
  pushCustomerBrandOverridesIfLocalNewer,
} from "../lib/customerBrandOverridesCloud";
import {
  CUSTOMER_LANES_TABLE,
  customerLaneToRow,
  mergeSeededLanes,
  normalizePlaceName,
  readCustomerLanePersisted,
  reconcileCustomerLanes,
  removeCustomerByName,
  removeCustomerLane,
  renameCustomerLanes,
  rowToCustomerLane,
  upsertCustomerLane,
  writeCustomerLanePersisted,
  type CustomerLane,
  type CustomerLaneInput,
  type CustomerLanePersisted,
  type CustomerLaneRow,
  type CustomerLaneStore,
  type RenameCustomerStatus,
} from "../lib/customerLanes";
import {
  clearLaneTombstones,
  fetchLaneTombstones,
  pushLaneTombstones,
} from "../lib/customerLaneTombstonesCloud";
import { getSupabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

type CustomerLanesContextValue = {
  store: CustomerLaneStore;
  /** Bumps when brand overrides change so logo UI re-reads localStorage. */
  brandsRevision: number;
  cloud: boolean;
  saveLane: (input: CustomerLaneInput) => Promise<CustomerLane | null>;
  deleteLane: (id: string) => Promise<void>;
  deleteCustomer: (name: string) => Promise<void>;
  renameCustomer: (fromName: string, toName: string) => RenameCustomerStatus;
  refresh: () => Promise<void>;
};

const CustomerLanesContext = createContext<CustomerLanesContextValue | null>(null);

export function CustomerLanesProvider({ children }: { children: ReactNode }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [brandsRevision, setBrandsRevision] = useState(0);
  const deletedCustomersRef = useRef<Set<string>>(
    new Set(readCustomerLanePersisted().deletedCustomerNames),
  );
  const deletedLanesRef = useRef<Set<string>>(
    new Set(readCustomerLanePersisted().deletedLaneIds),
  );
  const deletedLaneAtRef = useRef<Record<string, string>>(
    readCustomerLanePersisted().deletedLaneAt ?? {},
  );
  const [store, setStore] = useState<CustomerLaneStore>(() => {
    const persisted = readCustomerLanePersisted();
    deletedCustomersRef.current = new Set(persisted.deletedCustomerNames);
    deletedLanesRef.current = new Set(persisted.deletedLaneIds);
    // Always merge catalog seed upgrades (e.g. Medill stub → real routes) so
    // Log Load chips/defaults work before the first cloud refresh.
    // Empty lanes (even with seededAt / tombstones) must re-seed — otherwise
    // offline Log Load has no customer chips and Save stays disabled.
    // Deleted lane ids stay gone — seed must not put Willow Ranch back.
    if (Object.keys(persisted.lanes).length) {
      const seeded = mergeSeededLanes(
        { lanes: persisted.lanes },
        undefined,
        deletedCustomersRef.current,
        deletedLanesRef.current,
      );
      if (Object.keys(seeded.lanes).length !== Object.keys(persisted.lanes).length) {
        writeCustomerLanePersisted({
          ...persisted,
          lanes: seeded.lanes,
          seededAt: persisted.seededAt ?? new Date().toISOString(),
        });
      }
      return seeded;
    }
    const seeded = mergeSeededLanes(
      { lanes: {} },
      undefined,
      deletedCustomersRef.current,
      deletedLanesRef.current,
    );
    writeCustomerLanePersisted({
      version: 1,
      lanes: seeded.lanes,
      seenRemoteIds: persisted.seenRemoteIds,
      seededAt: persisted.seededAt ?? new Date().toISOString(),
      deletedCustomerNames: [...deletedCustomersRef.current],
      deletedLaneIds: [...deletedLanesRef.current],
    });
    return seeded;
  });
  const storeRef = useRef(store);
  storeRef.current = store;
  const seenRef = useRef<Set<string>>(new Set(readCustomerLanePersisted().seenRemoteIds));
  const refreshTailRef = useRef(Promise.resolve());

  const persistLocal = useCallback((next: CustomerLaneStore) => {
    const snapshot: CustomerLanePersisted = {
      version: 1,
      lanes: next.lanes,
      seenRemoteIds: [...seenRef.current],
      seededAt: readCustomerLanePersisted().seededAt,
      deletedCustomerNames: [...deletedCustomersRef.current],
      deletedLaneIds: [...deletedLanesRef.current],
      deletedLaneAt: Object.fromEntries(
        Object.entries(deletedLaneAtRef.current).filter(([id]) => deletedLanesRef.current.has(id)),
      ),
    };
    writeCustomerLanePersisted(snapshot);
    storeRef.current = next;
    setStore(next);
  }, []);

  const syncBrandOverrides = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !session) return;
    await pullAndMergeCustomerBrandOverrides(supabase);
    await pushCustomerBrandOverridesIfLocalNewer(supabase, user?.id ?? null);
  }, [session, user?.id]);

  const pullRemote = useCallback(async (): Promise<CustomerLaneStore | null> => {
    const supabase = getSupabase();
    if (!supabase || !session) return null;
    const page = await fetchAllPaged<CustomerLaneRow>(async (from, to) => {
      const result = await supabase
        .from(CUSTOMER_LANES_TABLE)
        .select(
          "id, customer, destination, commodity, effective_date, tier1, tier2, tier3, tier4, tier5, created_at, updated_at",
        )
        .order("id", { ascending: true })
        .range(from, to);
      return { data: (result.data as CustomerLaneRow[] | null) ?? null, error: result.error };
    });
    if (page.error || !page.data) {
      console.warn("customer_lanes pull failed", pagedErrorMessage(page.error));
      return null;
    }
    const lanes: Record<string, CustomerLane> = {};
    for (const row of page.data) {
      const cleaned = rowToCustomerLane(row);
      if (cleaned) lanes[cleaned.id] = cleaned;
    }
    return { lanes };
  }, [session]);

  const cloudUpsert = useCallback(
    async (lanes: CustomerLane[]) => {
      const supabase = getSupabase();
      if (!supabase || !session || !lanes.length) return;
      const { error } = await supabase
        .from(CUSTOMER_LANES_TABLE)
        .upsert(lanes.map((lane) => customerLaneToRow(lane, user?.id ?? null)));
      if (error) console.warn("customer_lanes upsert failed", error.message);
    },
    [session, user?.id],
  );

  const cloudDelete = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from(CUSTOMER_LANES_TABLE).delete().in("id", ids);
    if (error) console.warn("customer_lanes delete failed", error.message);
  }, []);

  const refreshInner = useCallback(async () => {
    if (!cloud) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const remote = await pullRemote();
    if (!remote) {
      await syncBrandOverrides();
      return;
    }
    // Shared lane deletes. A failed read (not a missing table) means this desk
    // cannot know what other desks deleted: upload nothing this round.
    const tombPull = await fetchLaneTombstones(supabase);
    if (!tombPull.ok) {
      await syncBrandOverrides();
      return;
    }
    const reconciled = reconcileCustomerLanes({
      local: storeRef.current,
      remote,
      seenRemoteIds: seenRef.current,
      deletedCustomerNames: deletedCustomersRef.current,
      deletedLaneIds: deletedLanesRef.current,
      deletedLaneAt: deletedLaneAtRef.current,
      remoteTombstones: tombPull.tombstones,
    });
    deletedLanesRef.current = new Set(reconciled.deletedLaneIds);
    deletedLaneAtRef.current = reconciled.deletedLaneAt;
    for (const id of Object.keys(remote.lanes)) seenRef.current.add(id);
    const upload = reconciled.upload.filter((lane) => !deletedLanesRef.current.has(lane.id));
    const lanes = { ...reconciled.lanes };
    for (const id of deletedLanesRef.current) delete lanes[id];
    persistLocal({ lanes });
    if (upload.length) await cloudUpsert(upload);
    const deleteIds = [
      ...new Set([
        ...reconciled.deleteIds,
        ...upload.filter((lane) => deletedLanesRef.current.has(lane.id)).map((lane) => lane.id),
      ]),
    ];
    if (deleteIds.length) await cloudDelete(deleteIds);
    if (tombPull.tombstones) {
      await pushLaneTombstones(supabase, reconciled.tombstonesToPush, user?.id ?? null);
    }
    await syncBrandOverrides();
  }, [cloud, cloudDelete, cloudUpsert, persistLocal, pullRemote, syncBrandOverrides, user?.id]);

  const shareLaneDeletes = useCallback(
    (ids: string[]) => {
      const at = new Date().toISOString();
      const stamped: Record<string, string> = {};
      for (const id of ids) {
        deletedLanesRef.current.add(id);
        deletedLaneAtRef.current[id] = at;
        stamped[id] = at;
      }
      const supabase = getSupabase();
      if (cloud && supabase && ids.length) {
        void pushLaneTombstones(supabase, stamped, user?.id ?? null);
      }
    },
    [cloud, user?.id],
  );

  const refresh = useCallback(() => {
    const run = refreshTailRef.current.then(refreshInner, refreshInner);
    refreshTailRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, [refreshInner]);

  useEffect(() => {
    if (!cloud) return;
    scheduleCloudRefresh(() => {
      void refresh();
    });
  }, [cloud, refresh]);

  useEffect(() => {
    if (!cloud) return;
    return attachCloudRefresh(() => {
      void refresh();
    }, { shouldPoll: pollWhenTabs(CUSTOMER_LANES_POLL_TABS) });
  }, [cloud, refresh]);

  useEffect(() => {
    if (!cloud) return;
    const onFlush = () => {
      void syncBrandOverrides();
    };
    window.addEventListener(CUSTOMER_BRANDS_FLUSH_EVENT, onFlush);
    return () => window.removeEventListener(CUSTOMER_BRANDS_FLUSH_EVENT, onFlush);
  }, [cloud, syncBrandOverrides]);

  useEffect(() => {
    const onBrands = () => setBrandsRevision((n) => n + 1);
    window.addEventListener(CUSTOMER_BRANDS_EVENT, onBrands);
    return () => window.removeEventListener(CUSTOMER_BRANDS_EVENT, onBrands);
  }, []);

  const saveLane = useCallback(
    async (input: CustomerLaneInput) => {
      const result = upsertCustomerLane(storeRef.current, input);
      if (!result.lane) return null;
      const key = normalizePlaceName(result.lane.customer);
      if (key && deletedCustomersRef.current.has(key)) {
        deletedCustomersRef.current.delete(key);
      }
      const wasDeleted =
        deletedLanesRef.current.delete(result.lane.id) ||
        Boolean(deletedLaneAtRef.current[result.lane.id]);
      delete deletedLaneAtRef.current[result.lane.id];
      persistLocal(result.store);
      if (cloud) void cloudUpsert([result.lane]);
      const supabase = getSupabase();
      if (cloud && supabase && wasDeleted) void clearLaneTombstones(supabase, [result.lane.id]);
      return result.lane;
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const deleteLane = useCallback(
    async (id: string) => {
      const result = removeCustomerLane(storeRef.current, id);
      if (!result.removed) return;
      shareLaneDeletes([id]);
      persistLocal(result.store);
      if (cloud) void cloudDelete([id]);
    },
    [cloud, cloudDelete, persistLocal, shareLaneDeletes],
  );

  const deleteCustomer = useCallback(
    async (name: string) => {
      const result = removeCustomerByName(storeRef.current, name);
      const key = normalizePlaceName(name);
      if (key) deletedCustomersRef.current.add(key);
      // Share each removed lane's delete so a fresh desk does not seed them back.
      shareLaneDeletes(result.removedIds);
      clearCustomerBrandOverride(name);
      persistLocal(result.store);
      flushCustomerBrandOverrides();
      if (cloud && result.removedIds.length) void cloudDelete(result.removedIds);
    },
    [cloud, cloudDelete, persistLocal, shareLaneDeletes],
  );

  const renameCustomer = useCallback(
    (fromName: string, toName: string): RenameCustomerStatus => {
      const result = renameCustomerLanes(storeRef.current, fromName, toName);
      if (result.status !== "ok") return result.status;
      const key = normalizePlaceName(toName);
      if (key && deletedCustomersRef.current.has(key)) {
        deletedCustomersRef.current.delete(key);
      }
      persistLocal(result.store);
      if (cloud && result.lanes.length) void cloudUpsert(result.lanes);
      return "ok";
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const value = useMemo<CustomerLanesContextValue>(
    () => ({
      store,
      brandsRevision,
      cloud,
      saveLane,
      deleteLane,
      deleteCustomer,
      renameCustomer,
      refresh,
    }),
    [
      store,
      brandsRevision,
      cloud,
      saveLane,
      deleteLane,
      deleteCustomer,
      renameCustomer,
      refresh,
    ],
  );

  return (
    <CustomerLanesContext.Provider value={value}>{children}</CustomerLanesContext.Provider>
  );
}

export function useCustomerLanes() {
  const ctx = useContext(CustomerLanesContext);
  if (!ctx) throw new Error("useCustomerLanes must be used inside CustomerLanesProvider");
  return ctx;
}