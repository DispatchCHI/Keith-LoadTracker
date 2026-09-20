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
import {
  fetchDayNotesFromCloud,
  noteOn,
  readDayNotesPersisted,
  reconcileDayNotesCloud,
  upsertDayNote,
  upsertDayNoteRows,
  writeDayNotesPersisted,
  type DayNotesPersisted,
  type DayNotesStore,
} from "../lib/dayNotes";
import { attachCloudRefresh } from "../lib/cloudRefresh";
import { getSupabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

type DayNotesContextValue = {
  store: DayNotesStore;
  cloud: boolean;
  noteOn: (date: string) => string;
  saveNote: (date: string, note: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const DayNotesContext = createContext<DayNotesContextValue | null>(null);

export function DayNotesProvider({ children }: { children: ReactNode }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [store, setStore] = useState<DayNotesStore>(
    () => readDayNotesPersisted().byDate,
  );
  const storeRef = useRef(store);
  storeRef.current = store;
  const seenRemoteRef = useRef<Set<string>>(
    new Set(readDayNotesPersisted().seenRemoteDates ?? []),
  );
  const uploadingRef = useRef(false);
  const refreshTailRef = useRef(Promise.resolve());

  const persistLocal = useCallback((next: DayNotesStore, seen?: Iterable<string>) => {
    if (seen) seenRemoteRef.current = new Set(seen);
    const snapshot: DayNotesPersisted = {
      version: 1,
      byDate: next,
      seenRemoteDates: [...seenRemoteRef.current],
    };
    writeDayNotesPersisted(snapshot);
    storeRef.current = next;
    setStore(next);
  }, []);

  const refreshInner = useCallback(async () => {
    if (!cloud) return;
    const pulled = await fetchDayNotesFromCloud();
    if (!pulled.store) return;
    const result = reconcileDayNotesCloud({
      local: storeRef.current,
      remote: pulled.store,
      seenRemoteDates: seenRemoteRef.current,
    });
    if (result.toUpload.length && !uploadingRef.current) {
      uploadingRef.current = true;
      try {
        await upsertDayNoteRows(result.toUpload, user?.id ?? null);
      } finally {
        uploadingRef.current = false;
      }
    }
    persistLocal(result.next, result.seenRemoteDates);
  }, [cloud, persistLocal, user?.id]);

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
    const supabase = getSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel("day-notes-crew")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "day_notes" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cloud, refresh]);

  useEffect(() => {
    if (!cloud) return;
    return attachCloudRefresh(() => {
      void refresh();
    });
  }, [cloud, refresh]);

  const saveNote = useCallback(
    async (date: string, note: string) => {
      const next = upsertDayNote(storeRef.current, date, note);
      persistLocal(next);
      if (!cloud) return;
      const row = next[date];
      if (!row) return;
      await upsertDayNoteRows([row], user?.id ?? null);
    },
    [cloud, persistLocal, user?.id],
  );

  const value = useMemo<DayNotesContextValue>(
    () => ({
      store,
      cloud,
      noteOn: (date: string) => noteOn(store, date),
      saveNote,
      refresh,
    }),
    [store, cloud, saveNote, refresh],
  );

  return (
    <DayNotesContext.Provider value={value}>{children}</DayNotesContext.Provider>
  );
}

export function useDayNotes(): DayNotesContextValue {
  const ctx = useContext(DayNotesContext);
  if (!ctx) throw new Error("useDayNotes requires DayNotesProvider");
  return ctx;
}
