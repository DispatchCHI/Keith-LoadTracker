import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { chicagoToday, formatCreatedStamp, formatMonthDayYear, isValidISODate } from "../lib/chicagoDate";
import {
  DRIVER_NOTE_MAX_LENGTH,
  filterDriverNotes,
  notesForDriver,
  type DriverNote,
  type DriverNoteTarget,
} from "../lib/driverNotes";
import { useDriverNotes } from "../store/DriverNotesContext";

type DriverNotesPopoutProps = {
  driver: DriverNoteTarget;
  onClose: () => void;
};

/** Small centered pop-out: one driver's dated notes, newest first, with search. */
export function DriverNotesPopout({ driver, onClose }: DriverNotesPopoutProps) {
  const { store, cloud, cloudError, addNote, updateNote, removeNote } = useDriverNotes();
  const [noteDate, setNoteDate] = useState(() => chicagoToday());
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const notes = useMemo(() => notesForDriver(store, driver), [store, driver]);
  const shown = useMemo(() => filterDriverNotes(notes, query), [notes, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Desk mouse: jump straight to typing. Phones: don't pop the keyboard over the list.
  useEffect(() => {
    if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches) {
      textRef.current?.focus();
    }
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setText("");
    setNoteDate(chicagoToday());
    setFormError(null);
  };

  const startEdit = (note: DriverNote) => {
    setConfirmDeleteId(null);
    setEditingId(note.id);
    setNoteDate(note.noteDate);
    setText(note.note);
    setFormError(null);
    textRef.current?.focus();
  };

  const onSubmit = async () => {
    const body = text.trim();
    if (!body) {
      setFormError("Type a note first.");
      return;
    }
    if (!isValidISODate(noteDate)) {
      setFormError("Pick a date.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateNote(editingId, { noteDate, note: body });
      } else {
        await addNote(driver, noteDate, body);
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="confirm-overlay drv-notes-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Notes for ${driver.name}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="drv-notes-pop">
        <header className="drv-notes-head">
          <div className="drv-notes-who">
            <p className="eyebrow">Driver notes</p>
            <p className="drv-notes-name">
              {driver.truckNumber ? <span className="drv-pay-emp">{driver.truckNumber}</span> : null}{" "}
              {driver.name}
            </p>
            <p className="drv-notes-sub">
              {notes.length} {notes.length === 1 ? "note" : "notes"}
              {cloud ? " · synced" : " · this device"}
            </p>
          </div>
          <button type="button" className="drv-notes-close" aria-label="Close notes" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        {cloudError ? (
          <p className="drv-notes-error" role="alert">
            {cloudError}
          </p>
        ) : null}

        <form
          className="drv-notes-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <div className="drv-notes-form-row">
            <input
              className="text-input drv-notes-date"
              type="date"
              value={noteDate}
              onChange={(event) => setNoteDate(event.target.value)}
              aria-label="Note date"
            />
            {editingId ? <span className="drv-notes-editing">Editing note</span> : null}
          </div>
          <textarea
            ref={textRef}
            className="text-input drv-notes-text"
            value={text}
            maxLength={DRIVER_NOTE_MAX_LENGTH}
            rows={3}
            placeholder={`Note about ${driver.name}…`}
            onChange={(event) => {
              setText(event.target.value);
              if (formError) setFormError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void onSubmit();
              }
            }}
            aria-label="Note text"
          />
          {formError ? <p className="drv-notes-error">{formError}</p> : null}
          <div className="drv-notes-actions">
            {editingId ? (
              <button type="button" className="text-btn" onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
            <button type="submit" className="text-btn amber" disabled={saving || !text.trim()}>
              {saving ? "Saving…" : editingId ? "Save note" : "Add note"}
            </button>
          </div>
        </form>

        {notes.length ? (
          <label className="drv-notes-search">
            <Search size={13} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notes (text, date, who)"
              aria-label={`Search notes for ${driver.name}`}
            />
          </label>
        ) : null}

        <ul className="drv-notes-list" aria-label={`Notes for ${driver.name}`}>
          {!notes.length ? <li className="drv-notes-empty">No notes yet.</li> : null}
          {notes.length && !shown.length ? (
            <li className="drv-notes-empty">No notes match “{query.trim()}”.</li>
          ) : null}
          {shown.map((note) => (
            <li
              key={note.id}
              className={note.id === editingId ? "drv-note-item is-editing" : "drv-note-item"}
            >
              <div className="drv-note-meta">
                <span className="drv-note-date">{formatMonthDayYear(note.noteDate)}</span>
                <span className="drv-note-by">
                  {note.author ? note.author : ""}
                  {note.author ? " · " : ""}
                  {formatCreatedStamp(note.createdAt)}
                </span>
                {confirmDeleteId === note.id ? (
                  <span className="drv-note-confirm">
                    Delete?
                    <button
                      type="button"
                      className="text-btn danger"
                      onClick={() => {
                        setConfirmDeleteId(null);
                        if (editingId === note.id) resetForm();
                        void removeNote(note.id);
                      }}
                    >
                      Yes
                    </button>
                    <button type="button" className="text-btn" onClick={() => setConfirmDeleteId(null)}>
                      No
                    </button>
                  </span>
                ) : (
                  <span className="drv-note-tools">
                    <button
                      type="button"
                      className="drv-note-tool"
                      aria-label={`Edit note from ${formatMonthDayYear(note.noteDate)}`}
                      onClick={() => startEdit(note)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="drv-note-tool"
                      aria-label={`Delete note from ${formatMonthDayYear(note.noteDate)}`}
                      onClick={() => setConfirmDeleteId(note.id)}
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
              <p className="drv-note-text">{note.note}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
