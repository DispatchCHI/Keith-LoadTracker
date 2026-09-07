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
import { getSupabase } from "../lib/supabase";
import {
  addSpecialtySlot,
  boardForDate,
  consumeSpecialtyOpens,
  countSpecialtyOpens,
  notifySpecialtyBoardChanged,
  readSpecialtyStore,
  removeSpecialtySlot,
  writeSpecialtyStore,
  type SpecialtySlot,
  type SpecialtyStore,
} from "../lib/specialtyBoard";
import { useAuth } from "./AuthContext";

type SpecialtyRow = {
  id: string;
  date: string;
  station_id: string;
  destination: string;
  created_at: string;
};

type SpecialtyContextValue = {
  store: SpecialtyStore;
  boardOn: (date: string) => SpecialtySlot[];
  addOpen: (date: string, stationId: string, destination: string) => Promise<void>;
  removeOpen: (
    date: string,
    stationId: string,
    destination?: string,
  ) => Promise<void>;
  consumeOpens: (
    date: string,
    stationId: string,
    destination: string,
    count: number,
  ) => Promise<number>;
  opensFor: (date: string, stationId: string, destination: string) => number;
  refresh: () => Promise<void>;
  cloud: boolean;
};

const SpecialtyContext = createContext<SpecialtyContextValue | null>(null);

function rowsToStore(rows: SpecialtyRow[]): SpecialtyStore {
  const store: SpecialtyStore = {};
  for (const row of rows) {
    const date = row.date;
    const slot: SpecialtySlot = {
      id: row.id,
      stationId: row.station_id,
      destination: row.destination,
      createdAt: row.created_at,
    };
    if (!store[date]) store[date] = [];
    store[date].push(slot);
  }
  return store;
}

/** Union slots by id per date (later arg wins on same id). */
export function mergeSpecialtyStores(
  a: SpecialtyStore,
  b: SpecialtyStore,
): SpecialtyStore {
  const dates = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: SpecialtyStore = {};
  for (const date of dates) {
    const byId = new Map<string, SpecialtySlot>();
    for (const s of a[date] ?? []) byId.set(s.id, s);
    for (const s of b[date] ?? []) byId.set(s.id, s);
    out[date] = [...byId.values()];
  }
  return out;
}

export function SpecialtyProvider({ children }: { children: ReactNode }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [store, setStore] = useState<SpecialtyStore>(() => readSpecialtyStore());
  const storeRef = useRef(store);
  storeRef.current = store;
  const uploadingRef = useRef(false);

  const persistLocal = useCallback((next: SpecialtyStore) => {
    writeSpecialtyStore(next);
    setStore(next);
    notifySpecialtyBoardChanged();
  }, []);

  const pullRemote = useCallback(async (): Promise<SpecialtyStore | null> => {
    const supabase = getSupabase();
    if (!supabase || !session) return null;
    const { data, error } = await supabase
      .from("specialty_opens")
      .select("id, date, station_id, destination, created_at");
    if (error || !data) {
      console.warn("specialty_opens pull failed", error?.message);
      return null;
    }
    return rowsToStore(data as SpecialtyRow[]);
  }, [session]);

  const uploadMissingLocal = useCallback(
    async (remote: SpecialtyStore, local: SpecialtyStore) => {
      const supabase = getSupabase();
      if (!supabase || !session || uploadingRef.current) {
        return mergeSpecialtyStores(local, remote);
      }
      uploadingRef.current = true;
      try {
        const remoteIds = new Set(
          Object.values(remote)
            .flat()
            .map((s) => s.id),
        );
        const inserts: {
          id: string;
          date: string;
          station_id: string;
          destination: string;
          created_at: string;
          created_by: string | null;
        }[] = [];
        for (const [date, slots] of Object.entries(local)) {
          for (const slot of slots) {
            if (remoteIds.has(slot.id)) continue;
            inserts.push({
              id: slot.id,
              date,
              station_id: slot.stationId,
              destination: slot.destination,
              created_at: slot.createdAt,
              created_by: user?.id ?? null,
            });
          }
        }

        if (!inserts.length) {
          // Nothing to upload — remote is authority (cross-device deletes apply).
          return remote;
        }

        const { error } = await supabase.from("specialty_opens").upsert(inserts);
        if (error) {
          console.warn("specialty upload failed", error.message);
          // Never persist empty remote alone after a failed upload.
          return mergeSpecialtyStores(local, remote);
        }

        const pulled = await pullRemote();
        if (!pulled) {
          return mergeSpecialtyStores(local, remote);
        }

        const pulledCount = Object.values(pulled).flat().length;
        if (pulledCount === 0 && inserts.length > 0) {
          // Pull came back empty but we still have local slots we tried to upload.
          return mergeSpecialtyStores(local, remote);
        }

        // Successful upload + non-empty pull: remote/pulled is authority.
        return pulled;
      } finally {
        uploadingRef.current = false;
      }
    },
    [pullRemote, session, user?.id],
  );

  const refresh = useCallback(async () => {
    if (!cloud) {
      persistLocal(readSpecialtyStore());
      return;
    }
    const remote = await pullRemote();
    // Pull failure: leave local store untouched.
    if (!remote) return;
    const local = readSpecialtyStore();
    const next = await uploadMissingLocal(remote, local);
    persistLocal(next);
  }, [cloud, persistLocal, pullRemote, uploadMissingLocal]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!cloud) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel("specialty-opens-crew")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "specialty_opens" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cloud, refresh]);

  const addOpen = useCallback(
    async (date: string, stationId: string, destination: string) => {
      const next = addSpecialtySlot(storeRef.current, date, stationId, destination);
      const added = boardForDate(next, date).at(-1);
      persistLocal(next);
      if (cloud && added) {
        const supabase = getSupabase();
        if (supabase) {
          const { error } = await supabase.from("specialty_opens").upsert({
            id: added.id,
            date,
            station_id: stationId,
            destination,
            created_at: added.createdAt,
            created_by: user?.id ?? null,
          });
          if (error) console.warn("specialty insert failed", error.message);
        }
      }
    },
    [cloud, persistLocal, user?.id],
  );

  const removeOpen = useCallback(
    async (date: string, stationId: string, destination?: string) => {
      const before = boardForDate(storeRef.current, date);
      let target: SpecialtySlot | undefined;
      if (destination) {
        for (let i = before.length - 1; i >= 0; i--) {
          if (
            before[i].stationId === stationId &&
            before[i].destination.trim().toLowerCase() ===
              destination.trim().toLowerCase()
          ) {
            target = before[i];
            break;
          }
        }
      }
      if (!target) {
        for (let i = before.length - 1; i >= 0; i--) {
          if (before[i].stationId === stationId) {
            target = before[i];
            break;
          }
        }
      }
      const next = removeSpecialtySlot(
        storeRef.current,
        date,
        stationId,
        destination,
      );
      persistLocal(next);
      if (cloud && target) {
        const supabase = getSupabase();
        if (supabase) {
          const { error } = await supabase
            .from("specialty_opens")
            .delete()
            .eq("id", target.id);
          if (error) console.warn("specialty delete failed", error.message);
        }
      }
    },
    [cloud, persistLocal],
  );

  const consumeOpens = useCallback(
    async (
      date: string,
      stationId: string,
      destination: string,
      count: number,
    ) => {
      const opens = countSpecialtyOpens(
        storeRef.current,
        date,
        stationId,
        destination,
      );
      const burn = Math.min(opens, Math.max(0, Math.floor(count)));
      if (burn === 0) return 0;
      const victims: string[] = [];
      const board = boardForDate(storeRef.current, date);
      const dest = destination.trim().toLowerCase();
      for (let i = board.length - 1; i >= 0 && victims.length < burn; i--) {
        if (
          board[i].stationId === stationId &&
          board[i].destination.trim().toLowerCase() === dest
        ) {
          victims.push(board[i].id);
        }
      }
      const next = consumeSpecialtyOpens(
        storeRef.current,
        date,
        stationId,
        destination,
        burn,
      );
      persistLocal(next);
      if (cloud && victims.length) {
        const supabase = getSupabase();
        if (supabase) {
          const { error } = await supabase
            .from("specialty_opens")
            .delete()
            .in("id", victims);
          if (error) console.warn("specialty consume failed", error.message);
        }
      }
      return burn;
    },
    [cloud, persistLocal],
  );

  const value = useMemo<SpecialtyContextValue>(
    () => ({
      store,
      boardOn: (date) => boardForDate(store, date),
      addOpen,
      removeOpen,
      consumeOpens,
      opensFor: (date, stationId, destination) =>
        countSpecialtyOpens(store, date, stationId, destination),
      refresh,
      cloud,
    }),
    [store, addOpen, removeOpen, consumeOpens, refresh, cloud],
  );

  return (
    <SpecialtyContext.Provider value={value}>{children}</SpecialtyContext.Provider>
  );
}

export function useSpecialty() {
  const ctx = useContext(SpecialtyContext);
  if (!ctx) throw new Error("useSpecialty must be used inside SpecialtyProvider");
  return ctx;
}
