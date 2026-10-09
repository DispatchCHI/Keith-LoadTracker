import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { formatHeaderDate } from "../lib/chicagoDate";
import { attachCloudRefresh } from "../lib/cloudRefresh";
import { useAuth } from "../store/AuthContext";
import {
  STATION_CALL_HOURS,
  stationCallYards,
  addStationCallYard,
  removeStationCallYard,
  STATION_CORNER_NOTE_ID,
  boardForDate,
  commitStationCell,
  commitStationNote,
  fetchStationCallStoreFromCloud,
  fetchStationNotesFromCloud,
  loadStationNotes,
  mergeStationNoteStores,
  noteForStation,
  parseNumericCell,
  pushStationCallDay,
  pushStationNote,
  readLegacyNotesFromStationCallStorage,
  readStationCallStore,
  readStationNoteStore,
  reconcileStationCallCloud,
  reconcileStationNotesCloud,
  setStationClose,
  setStationHour,
  setStationNote,
  startForStation,
  stationCallNavTarget,
  stationCellFilled,
  writeStationCallStore,
  writeStationNoteStore,
  type StationCallCol,
  type StationCellValue,
  type StationHourKey,
  type StationNoteStore,
} from "../lib/stationCalls";
type NotePopMode = "peek" | "edit";

function allowHoverPeek(pointerType: string): boolean {
  if (pointerType !== "mouse" && pointerType !== "pen") return false;
  if (typeof window === "undefined") return false;
  // Phones: tap opens the editor. Hover media is none / pointer is coarse.
  if (window.matchMedia("(pointer: coarse)").matches) return false;
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) return true;
  // Desktop VMs and some remote sessions omit hover media; a mouse still peeks.
  return pointerType === "mouse" && navigator.maxTouchPoints === 0;
}

function focusStationCallCell(stationId: string, col: StationCallCol): boolean {
  const next = document.querySelector<HTMLInputElement>(
    `input.station-call-input[data-station="${CSS.escape(stationId)}"][data-col="${CSS.escape(col)}"]`,
  );
  if (!next) return false;
  next.focus();
  next.select();
  return true;
}

function CellInput({
  value,
  onCommit,
  ariaLabel,
  stationId,
  col,
}: {
  value: StationCellValue | null | undefined;
  onCommit: (next: StationCellValue | null) => void;
  ariaLabel: string;
  stationId: string;
  col: StationCallCol;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const parentShown = value === null || value === undefined ? "" : String(value);
  const shown = draft !== null ? draft : parentShown;
  const isZero = draft === null && parseNumericCell(value) === 0;
  const committedRef = useRef(false);

  // Drop the local draft once the parent store shows the same text. Clearing
  // draft in onBlur made 3pm (and every hour) flash blank / look reverted
  // while setStore was still flushing — worse when a cloud hydrate raced in.
  useEffect(() => {
    if (draft === null) return;
    if (draft === parentShown) setDraft(null);
  }, [draft, parentShown]);

  const commit = (raw?: string) => {
    if (committedRef.current) return;
    committedRef.current = true;
    const next = commitStationCell(raw ?? draft ?? shown);
    // Keep showing what we just saved until parentShown catches up.
    setDraft(next === null ? "" : String(next));
    onCommit(next);
  };

  const persistEmpty = () => {
    setDraft("");
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(null);
  };

  return (
    <input
      className={`station-call-input${isZero ? " is-zero" : ""}`}
      type="text"
      inputMode="text"
      autoComplete="off"
      spellCheck={false}
      aria-label={ariaLabel}
      data-station={stationId}
      data-col={col}
      value={shown}
      onChange={(e) => {
        committedRef.current = false;
        const next = e.target.value;
        setDraft(next);
        if (next.trim() === "") persistEmpty();
      }}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        // Honor Enter's commit guard. Resetting committedRef before commit()
        // forced a second setStore on every Enter, and that re-render stole
        // focus from the next row so Keith had to press Enter twice.
        if (!committedRef.current) commit();
        committedRef.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key === "Backspace" || e.key === "Delete") {
          const input = e.target as HTMLInputElement;
          const allSelected =
            input.selectionStart === 0 &&
            input.selectionEnd === input.value.length &&
            input.value.length > 0;
          if (allSelected) {
            e.preventDefault();
            committedRef.current = false;
            persistEmpty();
            return;
          }
        }
        const nav =
          e.key === "Enter" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight";
        if (!nav) return;
        e.preventDefault();
        commit();
        const target = stationCallNavTarget(stationId, col, e.key, e.shiftKey);
        if (!target) {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          return;
        }
        // Focus AFTER React applies setStore from commit(). Immediate focus
        // (9892712) lost the next cell when the parent re-render ran — Keith
        // still needed a second Enter. Blur still honors committedRef so the
        // deferred focus does not double-commit.
        requestAnimationFrame(() => {
          focusStationCallCell(target.stationId, target.col);
        });
      }}
    />
  );
}

function StationNameCell({
  stationId,
  label,
  note,
  open,
  onPeek,
  onEdit,
  onClose,
  onCommit,
  onRemove,
  suppressPortal = false,
}: {
  stationId: string;
  label: string;
  note: string | null | undefined;
  open: NotePopMode | null;
  onPeek: () => void;
  onEdit: () => void;
  onClose: () => void;
  onCommit: (next: string | null) => void;
  onRemove?: () => void;
  /** Yard Desk draws the note beside the grid, so this cell does not float a popover. */
  suppressPortal?: boolean;
}) {
  const filled = stationCellFilled(note);
  const shown = filled ? note : "";
  const [draft, setDraft] = useState(shown);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const cancelHide = () => {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const schedulePeekHide = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      if (open === "peek") onClose();
    }, 180);
  };

  const beginEdit = () => {
    cancelHide();
    if (open !== "edit") setDraft(shown);
    onEdit();
  };

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 16);
    const estimated = open === "edit" ? 188 : 96;
    let left = r.right + 6;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    let top = r.top;
    if (top + estimated > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - estimated - 8);
    }
    setPos({ top, left });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place, shown]);

  useEffect(() => {
    if (open !== "edit") return;
    const id = window.requestAnimationFrame(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open || suppressPortal) return;
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node | null;
      if (node && btnRef.current?.contains(node)) return;
      if (node && popRef.current?.contains(node)) return;
      if (open === "edit") onCommit(commitStationNote(draft));
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (open === "edit") onCommit(commitStationNote(draft));
      onClose();
    };
    const onScrollOrResize = () => {
      if (open === "peek") {
        onClose();
        return;
      }
      place();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, suppressPortal, draft, onClose, onCommit, place]);

  useEffect(() => () => cancelHide(), []);

  const pop =
    open && !suppressPortal && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popRef}
            className={`station-call-note-pop${open === "edit" ? " is-edit" : " is-peek"}`}
            role={open === "edit" ? "dialog" : "tooltip"}
            aria-label={`${label} note`}
            style={{ top: pos.top, left: pos.left }}
            onPointerEnter={() => {
              cancelHide();
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== "mouse") return;
              if (open === "peek") schedulePeekHide();
            }}
            onClick={() => {
              if (open === "peek") beginEdit();
            }}
          >
            <p className="station-call-note-pop-title">{label}</p>
            {open === "edit" ? (
              <>
                <textarea
                  ref={areaRef}
                  className="station-call-note-input"
                  value={draft}
                  rows={4}
                  placeholder="Add a note…"
                  aria-label={`${label} note text`}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") {
                      e.preventDefault();
                      onCommit(commitStationNote(draft));
                      onClose();
                    }
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      onCommit(commitStationNote(draft));
                      onClose();
                    }
                  }}
                />
                <div className="station-call-note-pop-actions">
                  <button
                    type="button"
                    className="station-call-note-done"
                    onClick={() => {
                      onCommit(commitStationNote(draft));
                      onClose();
                    }}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <p className="station-call-note-peek">{shown}</p>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <th scope="row" className={filled && label ? "has-station-note" : undefined}>
      <div className="station-call-row-label">
        {onRemove ? (
          <button
            type="button"
            className="station-call-remove"
            aria-label={`Remove ${label}`}
            title="Remove row"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }}
          >
            ×
          </button>
        ) : null}
        <button
          ref={btnRef}
          type="button"
          className={`station-call-name${filled && label ? " has-note" : ""}`}
          data-station={stationId}
          aria-haspopup="dialog"
          aria-expanded={open === "edit"}
          aria-label={filled ? `${label}, has note` : `${label}, add note`}
          onPointerEnter={(event) => {
            if (!allowHoverPeek(event.pointerType)) return;
            if (!filled) return;
            if (open === "edit") return;
            cancelHide();
            onPeek();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "mouse") return;
            if (open === "peek") schedulePeekHide();
          }}
          onClick={beginEdit}
        >
          {label}
        </button>
      </div>
      {pop}
    </th>
  );
}

function YardHourNoteButton({
  stationId,
  label,
  note,
  open,
  onPeek,
  onEdit,
  onClose,
  onCommit,
  className,
}: {
  stationId: string;
  label: string;
  note: string | null | undefined;
  open: NotePopMode | null;
  onPeek: () => void;
  onEdit: () => void;
  onClose: () => void;
  onCommit: (next: string | null) => void;
  className: string;
}) {
  const filled = stationCellFilled(note);
  const shown = filled ? note : "";
  const [draft, setDraft] = useState(shown);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const cancelHide = () => {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const schedulePeekHide = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      if (open === "peek") onClose();
    }, 180);
  };

  const beginEdit = () => {
    cancelHide();
    if (open !== "edit") setDraft(shown);
    onEdit();
  };

  const place = useCallback(() => {
    const anchor = btnRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const pop = popRef.current;
    const width = pop?.offsetWidth || 160;
    const height = pop?.offsetHeight || 40;
    let left = rect.right + 8;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, rect.left - width - 8);
    }
    let top = rect.top;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - height - 8);
    }
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place, shown]);

  useEffect(() => {
    if (open !== "edit") return;
    const id = window.requestAnimationFrame(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node | null;
      if (node && btnRef.current?.contains(node)) return;
      if (node && popRef.current?.contains(node)) return;
      if (open === "edit") onCommit(commitStationNote(draft));
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (open === "edit") onCommit(commitStationNote(draft));
      onClose();
    };
    const onScrollOrResize = () => {
      if (open === "peek") {
        onClose();
        return;
      }
      place();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, draft, onClose, onCommit, place]);

  useEffect(() => () => cancelHide(), []);

  const pop =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popRef}
            className={`yard-hour-note-pop${open === "edit" ? " is-edit" : " is-peek"}`}
            role={open === "edit" ? "dialog" : "tooltip"}
            aria-label={`${label} note`}
            style={{ top: pos.top, left: pos.left }}
            onPointerEnter={() => {
              cancelHide();
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== "mouse") return;
              if (open === "peek") schedulePeekHide();
            }}
            onClick={() => {
              if (open === "peek") beginEdit();
            }}
          >
            <p className="yard-hour-note-pop-title">{label}</p>
            {open === "edit" ? (
              <>
                <textarea
                  ref={areaRef}
                  className="yard-hour-note-input"
                  value={draft}
                  rows={3}
                  placeholder="Add a note…"
                  aria-label={`${label} note text`}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") {
                      event.preventDefault();
                      onCommit(commitStationNote(draft));
                      onClose();
                    }
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      onCommit(commitStationNote(draft));
                      onClose();
                    }
                  }}
                />
                <div className="yard-hour-note-pop-actions">
                  <button
                    type="button"
                    className="yard-hour-note-done"
                    onClick={() => {
                      onCommit(commitStationNote(draft));
                      onClose();
                    }}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <p className="yard-hour-note-peek">{shown}</p>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        data-station={stationId}
        aria-haspopup="dialog"
        aria-expanded={open === "edit"}
        aria-label={filled ? `${label}, has note` : `${label}, add note`}
        onPointerEnter={(event) => {
          if (!allowHoverPeek(event.pointerType)) return;
          if (!filled) return;
          if (open === "edit") return;
          cancelHide();
          onPeek();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          if (open === "peek") schedulePeekHide();
        }}
        onClick={beginEdit}
      >
        {label}
      </button>
      {pop}
    </>
  );
}

function yardHourHead(label: string): string {
  if (label.endsWith("am")) return `${label.slice(0, -2)}AM`;
  if (label.endsWith("pm")) return `${label.slice(0, -2)}PM`;
  return label.toUpperCase();
}

function stationNoteLabel(
  id: string,
  yards: readonly { id: string; label: string }[],
): string {
  if (id === STATION_CORNER_NOTE_ID) return "Day";
  return yards.find((yard) => yard.id === id)?.label ?? "Station";
}

function StationNoteAside({
  label,
  note,
  editing,
  onEdit,
  onCommit,
  onClose,
}: {
  label: string;
  note: string | null;
  editing: boolean;
  onEdit: () => void;
  onCommit: (next: string | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(note ?? "");

  useEffect(() => {
    if (!editing) setDraft(note ?? "");
  }, [editing, note]);

  const finish = (raw: string) => {
    onCommit(commitStationNote(raw));
    onClose();
  };

  return (
    <div className="station-note-aside">
      <span className="station-note-aside-kicker">{label} note</span>
      {editing ? (
        <textarea
          className="station-note-aside-input"
          value={draft}
          rows={2}
          aria-label={`${label} note text`}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => finish(draft)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              finish(draft);
            }
          }}
        />
      ) : (
        <button type="button" className="station-note-aside-text" onClick={onEdit}>
          {stationCellFilled(note) ? note : "Add a note"}
        </button>
      )}
    </div>
  );
}

export function StationCallsCard({
  date,
  noteAside = false,
}: {
  date: string;
  /** Show the station note beside the grid header. Classic Today leaves this off. */
  noteAside?: boolean;
}) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [store, setStore] = useState(() => readStationCallStore());
  const [notes, setNotes] = useState<StationNoteStore>(() => loadStationNotes());
  const [extraTick, setExtraTick] = useState(0);
  const yards = useMemo(() => {
    void extraTick;
    return stationCallYards();
  }, [extraTick]);
  const board = useMemo(() => boardForDate(store, date), [store, date]);
  const [noteOpen, setNoteOpen] = useState<{
    date: string;
    id: string;
    mode: NotePopMode;
  } | null>(null);
  const activeNote = noteOpen?.date === date ? noteOpen : null;

  useEffect(() => {
    if (!cloud) return;
    let alive = true;

    const hydrate = async () => {
      const [remoteDays, remoteNotes] = await Promise.all([
        fetchStationCallStoreFromCloud(),
        fetchStationNotesFromCloud(),
      ]);
      if (!alive) return;

      // Re-read AFTER the await. A snapshot taken before the fetch discarded
      // hour edits Keith made while cloud was in flight — 3pm was the usual
      // victim because that is the column he fills at end of day when focus
      // / interval refresh fires.
      const localDays = readStationCallStore();
      const localNotes = readStationNoteStore();
      const localLegacy = readLegacyNotesFromStationCallStorage();

      if (remoteDays) {
        const { merged, toPush } = reconcileStationCallCloud(localDays, remoteDays.days);
        for (const { date: d, board } of toPush) {
          await pushStationCallDay(d, board, user?.id ?? null);
        }
        writeStationCallStore(merged);
        if (alive) setStore(merged);
      }

      const legacy = mergeStationNoteStores(localLegacy, remoteDays?.legacyNotes ?? {});
      if (remoteNotes) {
        const { merged, toPush } = reconcileStationNotesCloud(
          localNotes,
          remoteNotes,
          legacy,
        );
        for (const { stationId, row } of toPush) {
          await pushStationNote(stationId, row, user?.id ?? null);
        }
        writeStationNoteStore(merged);
        if (alive) setNotes(merged);
      } else {
        const seeded = reconcileStationNotesCloud(localNotes, {}, legacy).merged;
        writeStationNoteStore(seeded);
        if (alive) setNotes(seeded);
      }
    };

    void hydrate();

    const stopRefresh = attachCloudRefresh(hydrate);
    return () => {
      alive = false;
      stopRefresh();
    };
  }, [cloud, user?.id]);

  const persistDays = useCallback(
    (next: ReturnType<typeof readStationCallStore>) => {
      writeStationCallStore(next);
      setStore(next);
      if (cloud) {
        void pushStationCallDay(date, boardForDate(next, date), user?.id ?? null);
      }
    },
    [cloud, date, user?.id],
  );

  const persistNotes = useCallback(
    (next: StationNoteStore, stationId: string) => {
      writeStationNoteStore(next);
      setNotes(next);
      const row = next[stationId];
      if (cloud && row) {
        void pushStationNote(stationId, row, user?.id ?? null);
      }
    },
    [cloud, user?.id],
  );

  const onHour = useCallback(
    (stationId: string, hour: StationHourKey, value: StationCellValue | null) => {
      // Always merge onto localStorage — a closed-over `store` lost sibling
      // hour cells when Enter advanced down the 3pm column before React re-rendered.
      persistDays(setStationHour(readStationCallStore(), date, stationId, hour, value));
    },
    [persistDays, date],
  );

  const onClose = useCallback(
    (stationId: string, value: StationCellValue | null) => {
      persistDays(setStationClose(readStationCallStore(), date, stationId, value));
    },
    [persistDays, date],
  );

  const onNote = useCallback(
    (stationId: string, value: string | null) => {
      const prev = noteForStation(notes, stationId);
      if (prev === value) return;
      if (!stationCellFilled(prev) && !stationCellFilled(value)) return;
      persistNotes(setStationNote(notes, stationId, value), stationId);
    },
    [persistNotes, notes],
  );

  const aside = useMemo(() => {
    if (!noteAside) return null;
    if (activeNote) {
      return {
        id: activeNote.id,
        label: stationNoteLabel(activeNote.id, yards),
        note: noteForStation(notes, activeNote.id),
        editing: activeNote.mode === "edit",
      };
    }
    for (const yard of yards) {
      const note = noteForStation(notes, yard.id);
      if (stationCellFilled(note)) {
        return { id: yard.id, label: yard.label, note, editing: false as const };
      }
    }
    const corner = noteForStation(notes, STATION_CORNER_NOTE_ID);
    if (stationCellFilled(corner)) {
      return {
        id: STATION_CORNER_NOTE_ID,
        label: "Day",
        note: corner,
        editing: false as const,
      };
    }
    const first = yards[0];
    if (!first) return null;
    return { id: first.id, label: first.label, note: null, editing: false as const };
  }, [noteAside, activeNote, yards, notes]);

  if (noteAside) {
    return (
      <section className="yard-hour">
        <div className="yard-hour-top">
          <h2>Load count by hour</h2>
          <p>
            Stations down the side, hours across. Start is the prior day’s Close. Cells stay
            blank until a call.
          </p>
        </div>
        <div className="yard-hour-body">
          <div className="yard-hour-sheet">
            <table className="yard-hour-table">
              <thead>
                <tr>
                  <th>
                    <YardHourNoteButton
                      stationId={STATION_CORNER_NOTE_ID}
                      label="Station"
                      className="yard-hour-station-head"
                      note={noteForStation(notes, STATION_CORNER_NOTE_ID)}
                      open={activeNote?.id === STATION_CORNER_NOTE_ID ? activeNote.mode : null}
                      onPeek={() =>
                        setNoteOpen((cur) =>
                          cur?.date === date && cur.mode === "edit"
                            ? cur
                            : { date, id: STATION_CORNER_NOTE_ID, mode: "peek" },
                        )
                      }
                      onEdit={() =>
                        setNoteOpen({ date, id: STATION_CORNER_NOTE_ID, mode: "edit" })
                      }
                      onClose={() =>
                        setNoteOpen((cur) =>
                          cur?.date === date && cur.id === STATION_CORNER_NOTE_ID ? null : cur,
                        )
                      }
                      onCommit={(next) => onNote(STATION_CORNER_NOTE_ID, next)}
                    />
                  </th>
                  <th>Start</th>
                  {STATION_CALL_HOURS.map((hour) => (
                    <th key={hour.key}>{yardHourHead(hour.label)}</th>
                  ))}
                  <th>Close</th>
                </tr>
              </thead>
              <tbody>
                {yards.map((yard) => {
                  const row = board[yard.id] ?? { hours: {}, close: null };
                  const start = startForStation(store, date, yard.id);
                  const note = noteForStation(notes, yard.id);
                  const noted = stationCellFilled(note);
                  return (
                    <tr key={yard.id} className={noted ? "has-note" : undefined}>
                      <th scope="row">
                        <YardHourNoteButton
                          stationId={yard.id}
                          label={yard.label}
                          className="yard-hour-name"
                          note={note}
                          open={activeNote?.id === yard.id ? activeNote.mode : null}
                          onPeek={() =>
                            setNoteOpen((cur) =>
                              cur?.date === date && cur.mode === "edit"
                                ? cur
                                : { date, id: yard.id, mode: "peek" },
                            )
                          }
                          onEdit={() => setNoteOpen({ date, id: yard.id, mode: "edit" })}
                          onClose={() =>
                            setNoteOpen((cur) =>
                              cur?.date === date && cur.id === yard.id ? null : cur,
                            )
                          }
                          onCommit={(next) => onNote(yard.id, next)}
                        />
                        <button
                          type="button"
                          className="yard-hour-remove"
                          aria-label={`Remove ${yard.label}`}
                          onClick={() => {
                            if (!window.confirm(`Remove ${yard.label} from Load Count By Hour?`)) {
                              return;
                            }
                            if (removeStationCallYard(yard.id)) setExtraTick((n) => n + 1);
                          }}
                        >
                          ×
                        </button>
                      </th>
                      <td className="is-start">
                        <span className={`station-call-start${start === 0 ? " is-zero" : ""}`}>
                          {start}
                        </span>
                      </td>
                      {STATION_CALL_HOURS.map((hour) => (
                        <td key={hour.key}>
                          <CellInput
                            value={row.hours[hour.key]}
                            stationId={yard.id}
                            col={hour.key}
                            ariaLabel={`${yard.label} ${hour.label}`}
                            onCommit={(next) => onHour(yard.id, hour.key, next)}
                          />
                        </td>
                      ))}
                      <td>
                        <CellInput
                          value={row.close}
                          stationId={yard.id}
                          col="close"
                          ariaLabel={`${yard.label} Close`}
                          onCommit={(next) => onClose(yard.id, next)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button
              type="button"
              className="yard-hour-add"
              onClick={() => {
                const newLabel = window.prompt("Customer / station name");
                if (!newLabel) return;
                const yard = addStationCallYard(newLabel);
                if (!yard) {
                  window.alert("That name is already on the list.");
                  return;
                }
                setExtraTick((n) => n + 1);
              }}
            >
              Add row
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <article className="station-calls-card">
      <div className={noteAside ? "station-calls-head station-calls-head-aside" : "station-calls-head"}>
        <div>
          <p className="section-title">{noteAside ? "Load count by hour" : "Load Count By Hour"}</p>
          <p className="station-calls-sub">
            {noteAside
              ? "Stations down the side, hours across. Start is the prior day’s Close. Cells stay blank until a call."
              : `${formatHeaderDate(date)} · Start from prior Close · hour cells blank until you call${cloud ? " · synced" : " · this device only"} · hover or tap a station name for a note`}
          </p>
        </div>
        {aside ? (
          <StationNoteAside
            key={`${aside.id}-${aside.editing ? "edit" : "show"}`}
            label={aside.label}
            note={aside.note}
            editing={aside.editing}
            onEdit={() => setNoteOpen({ date, id: aside.id, mode: "edit" })}
            onCommit={(next) => onNote(aside.id, next)}
            onClose={() =>
              setNoteOpen((cur) => (cur?.date === date && cur.id === aside.id ? null : cur))
            }
          />
        ) : null}
      </div>
      <div className="station-calls-scroll">
        <table className="station-calls-table">
          <thead>
            <tr>
              <StationNameCell
                stationId={STATION_CORNER_NOTE_ID}
                label=""
                note={noteForStation(notes, STATION_CORNER_NOTE_ID)}
                suppressPortal={noteAside}
                open={activeNote?.id === STATION_CORNER_NOTE_ID ? activeNote.mode : null}
                onPeek={() =>
                  setNoteOpen((cur) =>
                    cur?.date === date && cur.mode === "edit"
                      ? cur
                      : { date, id: STATION_CORNER_NOTE_ID, mode: "peek" },
                  )
                }
                onEdit={() => setNoteOpen({ date, id: STATION_CORNER_NOTE_ID, mode: "edit" })}
                onClose={() =>
                  setNoteOpen((cur) =>
                    cur?.date === date && cur.id === STATION_CORNER_NOTE_ID ? null : cur,
                  )
                }
                onCommit={(next) => onNote(STATION_CORNER_NOTE_ID, next)}
              />
              <th>Start</th>
              {STATION_CALL_HOURS.map((h) => (
                <th key={h.key}>{h.label}</th>
              ))}
              <th>Close</th>
            </tr>
          </thead>
          <tbody>
            {yards.map((yard) => {
              const row = board[yard.id] ?? { hours: {}, close: null };
              const start = startForStation(store, date, yard.id);
              const note = noteForStation(notes, yard.id);
              return (
                <tr key={yard.id}>
                  <StationNameCell
                    stationId={yard.id}
                    label={yard.label}
                    note={note}
                    suppressPortal={noteAside}
                    open={activeNote?.id === yard.id ? activeNote.mode : null}
                    onPeek={() =>
                      setNoteOpen((cur) =>
                        cur?.date === date && cur.mode === "edit"
                          ? cur
                          : { date, id: yard.id, mode: "peek" },
                      )
                    }
                    onEdit={() => setNoteOpen({ date, id: yard.id, mode: "edit" })}
                    onClose={() =>
                      setNoteOpen((cur) =>
                        cur?.date === date && cur.id === yard.id ? null : cur,
                      )
                    }
                    onCommit={(next) => onNote(yard.id, next)}
                    onRemove={() => {
                      if (!window.confirm(`Remove ${yard.label} from Load Count By Hour?`)) return;
                      if (removeStationCallYard(yard.id)) setExtraTick((n) => n + 1);
                    }}
                  />
                  <td>
                    <span className={`station-call-start${start === 0 ? " is-zero" : ""}`}>
                      {start}
                    </span>
                  </td>
                  {STATION_CALL_HOURS.map((h) => (
                    <td key={h.key}>
                      <CellInput
                        value={row.hours[h.key]}
                        stationId={yard.id}
                        col={h.key}
                        ariaLabel={`${yard.label} ${h.label}`}
                        onCommit={(next) => onHour(yard.id, h.key, next)}
                      />
                    </td>
                  ))}
                  <td>
                    <CellInput
                      value={row.close}
                      stationId={yard.id}
                      col="close"
                      ariaLabel={`${yard.label} Close`}
                      onCommit={(next) => onClose(yard.id, next)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="station-calls-add-btn"
        onClick={() => {
          const newLabel = window.prompt("Customer / station name");
          if (!newLabel) return;
          const yard = addStationCallYard(newLabel);
          if (!yard) {
            window.alert("That name is already on the list.");
            return;
          }
          setExtraTick((n) => n + 1);
        }}
      >
        + Add Row
      </button>
    </article>
  );
}

