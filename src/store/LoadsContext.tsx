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
import type { Load } from "../types";
import { loadToRow, rowToLoad, type LoadRow } from "../lib/cloud";
import { loadsToCsv } from "../lib/commodity";
import {
  enqueueDelete,
  enqueueUpsert,
  pendingIds,
  readQueue,
  writeQueue,
} from "../lib/queue";
import { buildSeedLoads } from "../lib/seed";
import { getSupabase, isCloudConfigured } from "../lib/supabase";
import {
  allLoads,
  clearSeeded,
  loadsForDate,
  readStore,
  removeLoad,
  upsertLoad,
  writeStore,
  type Persisted,
} from "../lib/storage";
import { useAuth } from "./AuthContext";

export type SyncStatus = "local" | "live" | "syncing" | "offline" | "error";

type LoadsContextValue = {
  loads: Load[];
  loadsOn: (date: string) => Load[];
  saveLoad: (load: Load) => void;
  deleteLoad: (id: string) => void;
  clearSampleLoads: () => void;
  hasSampleLoads: boolean;
  exportCsv: (date: string) => void;
  findById: (id: string) => Load | undefined;
  syncStatus: SyncStatus;
  queuedCount: number;
  localPendingCount: number;
  uploadLocalLoads: () => Promise<number>;
};

const CACHE_KEY = "chitrader.load-tracker.cloud-cache.v1";

const LoadsContext = createContext<LoadsContextValue | null>(null);

function sortLoads(loads: Load[]): Load[] {
  return [...loads].sort((a, b) => {
    const byUpdated = b.updatedAt.localeCompare(a.updatedAt);
    if (byUpdated !== 0) return byUpdated;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function snapshotFromLoads(loads: Load[]): Persisted {
  const loadsByDate: Record<string, Load[]> = {};
  for (const load of loads) {
    const bucket = loadsByDate[load.date] ?? [];
    bucket.push(load);
    loadsByDate[load.date] = bucket;
  }
  return { version: 1, loadsByDate };
}

function readCloudCache(): Persisted {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { version: 1, loadsByDate: {} };
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed?.version !== 1 || typeof parsed.loadsByDate !== "object") {
      return { version: 1, loadsByDate: {} };
    }
    return parsed;
  } catch {
    return { version: 1, loadsByDate: {} };
  }
}

function writeCloudCache(store: Persisted): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(store));
}

function bootstrapLocal(): Persisted {
  const existing = readStore();
  const hasAny = Object.keys(existing.loadsByDate).length > 0;
  if (hasAny) return existing;
  const seeded = buildSeedLoads();
  let next = existing;
  for (const load of seeded) next = upsertLoad(next, load);
  writeStore(next);
  return next;
}

export function LoadsProvider({ children }: { children: ReactNode }) {
  const { configured, session, user, displayName } = useAuth();
  const cloud = configured && Boolean(session);
  const [store, setStore] = useState<Persisted>(() =>
    isCloudConfigured() ? readCloudCache() : bootstrapLocal(),
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    isCloudConfigured() ? "syncing" : "local",
  );
  const [queuedCount, setQueuedCount] = useState(() => readQueue().length);
  const flushing = useRef(false);
  const storeRef = useRef(store);

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  const persistLocal = useCallback((next: Persisted) => {
    writeStore(next);
    setStore(next);
  }, []);

  const persistCloudCache = useCallback((next: Persisted) => {
    writeCloudCache(next);
    setStore(next);
  }, []);

  const flushQueue = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !session || flushing.current) return;
    if (!navigator.onLine) {
      setSyncStatus("offline");
      return;
    }
    flushing.current = true;
    setSyncStatus("syncing");
    try {
      for (;;) {
        const ops = readQueue();
        if (!ops.length) break;
        const op = ops[0];
        if (op.kind === "upsert") {
          const { error } = await supabase
            .from("loads")
            .upsert(loadToRow(op.load, user?.id ?? null));
          if (error) throw error;
        } else {
          const { error } = await supabase.from("loads").delete().eq("id", op.loadId);
          if (error) throw error;
        }
        const rest = readQueue().filter((item) => item.opId !== op.opId);
        writeQueue(rest);
        setQueuedCount(rest.length);
      }
      setSyncStatus("live");
    } catch {
      setSyncStatus(navigator.onLine ? "error" : "offline");
    } finally {
      flushing.current = false;
    }
  }, [session, user]);

  const refreshFromCloud = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !session) return;
    const { data, error } = await supabase
      .from("loads")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      setSyncStatus(navigator.onLine ? "error" : "offline");
      return;
    }
    const remote = (data as LoadRow[]).map(rowToLoad);
    const pending = pendingIds();
    let next = snapshotFromLoads(remote);
    const local = storeRef.current;
    for (const load of allLoads(local)) {
      if (pending.has(load.id)) next = upsertLoad(next, load);
    }
    persistCloudCache(next);
    await flushQueue();
  }, [flushQueue, persistCloudCache, session]);

  useEffect(() => {
    if (!cloud) {
      if (!configured) {
        setStore(bootstrapLocal());
        setSyncStatus("local");
      }
      return;
    }
    void refreshFromCloud();
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel("loads-crew")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loads" },
        (payload) => {
          const pending = pendingIds();
          setStore((prev) => {
            if (payload.eventType === "DELETE") {
              const row = payload.old as Partial<LoadRow>;
              if (!row.id || pending.has(row.id)) return prev;
              const next = removeLoad(prev, row.id);
              writeCloudCache(next);
              return next;
            }
            const row = payload.new as LoadRow;
            if (!row?.id || pending.has(row.id)) return prev;
            const incoming = rowToLoad(row);
            const existing = allLoads(prev).find((item) => item.id === incoming.id);
            if (existing && existing.updatedAt > incoming.updatedAt) return prev;
            const next = upsertLoad(prev, incoming);
            writeCloudCache(next);
            return next;
          });
        },
      )
      .subscribe();

    const onOnline = () => void flushQueue().then(() => refreshFromCloud());
    const onOffline = () => setSyncStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (!navigator.onLine) setSyncStatus("offline");

    return () => {
      void supabase.removeChannel(channel);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [cloud, configured, flushQueue, refreshFromCloud]);

  const saveLoad = useCallback(
    (load: Load) => {
      const stamped: Load = {
        ...load,
        seeded: false,
        updatedAt: new Date().toISOString(),
        createdBy: load.createdBy ?? user?.id,
        displayName: load.displayName ?? (cloud ? displayName : undefined),
      };
      if (cloud) {
        const next = upsertLoad(storeRef.current, stamped);
        persistCloudCache(next);
        setQueuedCount(enqueueUpsert(stamped).length);
        void flushQueue();
        return;
      }
      persistLocal(upsertLoad(storeRef.current, stamped));
    },
    [cloud, displayName, flushQueue, persistCloudCache, persistLocal, user?.id],
  );

  const deleteLoad = useCallback(
    (id: string) => {
      if (cloud) {
        const next = removeLoad(storeRef.current, id);
        persistCloudCache(next);
        setQueuedCount(enqueueDelete(id).length);
        void flushQueue();
        return;
      }
      persistLocal(removeLoad(storeRef.current, id));
    },
    [cloud, flushQueue, persistCloudCache, persistLocal],
  );

  const clearSampleLoads = useCallback(() => {
    persistLocal(clearSeeded(storeRef.current));
  }, [persistLocal]);

  const uploadLocalLoads = useCallback(async () => {
    const local = allLoads(readStore()).filter((load) => !load.seeded);
    for (const load of local) {
      saveLoad({
        ...load,
        displayName: load.displayName ?? displayName,
        createdBy: load.createdBy ?? user?.id,
      });
    }
    return local.length;
  }, [displayName, saveLoad, user?.id]);

  const localPendingCount = useMemo(() => {
    if (!cloud) return 0;
    const cloudIds = new Set(allLoads(store).map((load) => load.id));
    return allLoads(readStore()).filter((load) => !load.seeded && !cloudIds.has(load.id))
      .length;
  }, [cloud, store]);

  const value = useMemo<LoadsContextValue>(() => {
    const loads = sortLoads(allLoads(store));
    return {
      loads,
      loadsOn: (date: string) => sortLoads(loadsForDate(store, date)),
      saveLoad,
      deleteLoad,
      clearSampleLoads,
      hasSampleLoads: !cloud && loads.some((load) => load.seeded),
      exportCsv: (date: string) => {
        const dayLoads = sortLoads(loadsForDate(store, date));
        const csv = loadsToCsv(dayLoads);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `load-tracker-${date}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },
      findById: (id: string) => allLoads(store).find((load) => load.id === id),
      syncStatus: cloud ? syncStatus : "local",
      queuedCount,
      localPendingCount,
      uploadLocalLoads,
    };
  }, [
    clearSampleLoads,
    cloud,
    deleteLoad,
    localPendingCount,
    queuedCount,
    saveLoad,
    store,
    syncStatus,
    uploadLocalLoads,
  ]);

  return <LoadsContext.Provider value={value}>{children}</LoadsContext.Provider>;
}

export function useLoads(): LoadsContextValue {
  const ctx = useContext(LoadsContext);
  if (!ctx) throw new Error("useLoads must be used within LoadsProvider");
  return ctx;
}
