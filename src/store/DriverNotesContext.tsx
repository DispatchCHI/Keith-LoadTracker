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
import { DRIVER_NOTES_POLL_TABS, pollWhenTabs } from "../lib/cloudRefreshTabs";
import {
  createDriverNote,
  deleteDriverNoteRows,
  editDriverNote,
  fetchDriverNotesFromCloud,
  readDriverNotesPersisted,
  reconcileDriverNotesCloud,
  upsertDriverNoteRows,
  writeDriverNotesPersisted,
  type DriverNote,
  type DriverNoteTarget,
  type DriverNotesStore,
} from "../lib/driverNotes";
import { useAuth } from "./AuthContext";

type DriverNotesContextValue = {
  store: DriverNotesStore;
  cloud: boolean;
  /** Last cloud error (e.g. table not created yet). Null when the last call worked. */
  cloudError: string | null;
  refresh: () => Promise<void>;
  addNote: (driver: DriverNoteTarget, noteDate: string, note: string) => Promise<DriverNote | null>;
  updateNote: (id: string, patch: { noteDate?: string; note?: string }) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
};

const DriverNotesContext = createContext<DriverNotesContextValue | null>(null);

export function DriverNotesProvider({ children }: { children: ReactNode }) {
  const { configured, session, user, displayName } = useAuth();
  const cloud = configured && !!session;
  const [store, setStore] = useState<DriverNotesStore>(() => readDriverNotesPersisted().entries);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;
  const deletedRef = useRef<Set<string>>(new Set(readDriverNotesPersisted().deletedIds));
  const seenRef = useRef<Set<string>>(new Set(readDriverNotesPersisted().seenRemoteIds));
  const epochRef = useRef(0);
  const refreshTailRef = useRef(Promise.resolve());

  const persistLocal = useCallback((next: DriverNotesStore) => {
    for (const id of deletedRef.current) delete next[id];
    writeDriverNotesPersisted({
      version: 1,
      entries: next,
      deletedIds: [...deletedRef.current],
      seenRemoteIds: [...seenRef.current],
    });
    storeRef.current = next;
    setStore(next);
  }, []);

  const refreshInner = useCallback(async () => {
    if (!cloud) return;
    const epoch = epochRef.current;
    const pulled = await fetchDriverNotesFromCloud();
    if (!pulled.store) {
      if (pulled.error) setCloudError(pulled.error);
      return;
    }
    if (epoch !== epochRef.current) return;
    const result = reconcileDriverNotesCloud({
      local: storeRef.current,
      remote: pulled.store,
      deletedIds: deletedRef.current,
      seenRemoteIds: seenRef.current,
    });
    let error: string | null = null;
    if (result.toUpload.length) {
      error = await upsertDriverNoteRows(result.toUpload, user?.id ?? null);
    }
    if (result.toDeleteRemote.length) {
      error = (await deleteDriverNoteRows(result.toDeleteRemote)) ?? error;
    }
    if (epoch !== epochRef.current) return;
    deletedRef.current = new Set(result.deletedIds);
    seenRef.current = new Set(result.seenRemoteIds);
    setCloudError(error);
    persistLocal({ ...result.next });
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
    const stopPoll = attachCloudRefresh(refresh, {
      shouldPoll: pollWhenTabs(DRIVER_NOTES_POLL_TABS),
    });
    const stopLive = attachCrewTableRealtime("driver-notes-crew", ["driver_notes"], refresh);
    return () => {
      stopPoll();
      stopLive();
    };
  }, [cloud, refresh]);

  const addNote = useCallback(
    async (driver: DriverNoteTarget, noteDate: string, note: string) => {
      const created = createDriverNote({
        driver,
        noteDate,
        note,
        author: displayName || null,
        createdBy: user?.id ?? null,
      });
      if (!created) return null;
      epochRef.current += 1;
      persistLocal({ ...storeRef.current, [created.id]: created });
      if (cloud) setCloudError(await upsertDriverNoteRows([created], user?.id ?? null));
      return created;
    },
    [cloud, displayName, persistLocal, user?.id],
  );

  const updateNote = useCallback(
    async (id: string, patch: { noteDate?: string; note?: string }) => {
      const result = editDriverNote(storeRef.current, id, patch);
      if (!result.note) return;
      epochRef.current += 1;
      persistLocal(result.store);
      if (cloud) setCloudError(await upsertDriverNoteRows([result.note], user?.id ?? null));
    },
    [cloud, persistLocal, user?.id],
  );

  const removeNote = useCallback(
    async (id: string) => {
      if (!storeRef.current[id]) return;
      epochRef.current += 1;
      deletedRef.current.add(id);
      const next = { ...storeRef.current };
      delete next[id];
      persistLocal(next);
      if (cloud) setCloudError(await deleteDriverNoteRows([id]));
    },
    [cloud, persistLocal],
  );

  const value = useMemo<DriverNotesContextValue>(
    () => ({ store, cloud, cloudError, refresh, addNote, updateNote, removeNote }),
    [store, cloud, cloudError, refresh, addNote, updateNote, removeNote],
  );

  return <DriverNotesContext.Provider value={value}>{children}</DriverNotesContext.Provider>;
}

export function useDriverNotes(): DriverNotesContextValue {
  const ctx = useContext(DriverNotesContext);
  if (!ctx) throw new Error("useDriverNotes must be used inside DriverNotesProvider");
  return ctx;
}
