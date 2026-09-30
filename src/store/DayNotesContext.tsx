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
  acknowledgeDayNote,
  applySavedDayNote,
  fetchDayNotesFromCloud,
  noteOn,
  notesButtonAffordance,
  pushDayNoteReadHash,
  readDayNotesPersisted,
  reconcileDayNotesCloud,
  upsertDayNoteRows,
  writeDayNotesPersisted,
  type DayNotesPersisted,
  type DayNotesStore,
  type NotesButtonAffordance,
} from "../lib/dayNotes";
import { attachCloudRefresh } from "../lib/cloudRefresh";
import { pollWhenTabs, TODAY_HOT_TABS } from "../lib/cloudRefreshTabs";
import { useAuth } from "./AuthContext";

type DayNotesContextValue = {
  store: DayNotesStore;
  cloud: boolean;
  noteOn: (date: string) => string;
  notesAffordance: (date: string) => NotesButtonAffordance;
  /** Call when the Notes popup opens this day. Shared across desks via read_hash. */
  markNotesRead: (date: string) => void;
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
  const readHashSupportedRef = useRef(true);

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
    readHashSupportedRef.current = pulled.readHashSupported;
    const result = reconcileDayNotesCloud({
      local: storeRef.current,
      remote: pulled.store,
      seenRemoteDates: seenRemoteRef.current,
    });
    if (result.toUpload.length && !uploadingRef.current) {
      uploadingRef.current = true;
      try {
        const wrote = await upsertDayNoteRows(result.toUpload, user?.id ?? null, {
          includeReadHash: readHashSupportedRef.current,
        });
        if (!wrote.readHashSupported) readHashSupportedRef.current = false;
      } finally {
        uploadingRef.current = false;
      }
    }
    if (readHashSupportedRef.current) {
      for (const push of result.readHashPushes) {
        const status = await pushDayNoteReadHash(push.date, push.readHash);
        if (status === "missing-column") {
          readHashSupportedRef.current = false;
          break;
        }
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
    return attachCloudRefresh(() => {
      void refresh();
    }, { shouldPoll: pollWhenTabs(TODAY_HOT_TABS) });
  }, [cloud, refresh]);

  const markNotesRead = useCallback(
    (date: string) => {
      const next = acknowledgeDayNote(storeRef.current, date);
      if (next === storeRef.current) return;
      persistLocal(next);
      if (!cloud || !readHashSupportedRef.current) return;
      const row = next[date];
      if (!row) return;
      void pushDayNoteReadHash(date, row.readHash).then((status) => {
        if (status === "missing-column") readHashSupportedRef.current = false;
      });
    },
    [cloud, persistLocal],
  );

  const saveNote = useCallback(
    async (date: string, note: string) => {
      const next = applySavedDayNote(storeRef.current, date, note);
      persistLocal(next);
      if (!cloud) return;
      const row = next[date];
      if (!row) return;
      const wrote = await upsertDayNoteRows([row], user?.id ?? null, {
        includeReadHash: readHashSupportedRef.current,
      });
      if (!wrote.readHashSupported) readHashSupportedRef.current = false;
    },
    [cloud, persistLocal, user?.id],
  );

  const value = useMemo<DayNotesContextValue>(
    () => ({
      store,
      cloud,
      noteOn: (date: string) => noteOn(store, date),
      notesAffordance: (date: string) =>
        notesButtonAffordance(noteOn(store, date), store[date]?.readHash),
      markNotesRead,
      saveNote,
      refresh,
    }),
    [store, cloud, markNotesRead, saveNote, refresh],
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
