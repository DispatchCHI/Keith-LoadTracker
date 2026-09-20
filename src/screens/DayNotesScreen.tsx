import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "../components/BrandMark";
import { chicagoToday, formatHeaderDate } from "../lib/chicagoDate";
import { useDayNotes } from "../store/DayNotesContext";

type DayNotesScreenProps = {
  date: string;
  onCancel: () => void;
};

export function DayNotesScreen({ date, onCancel }: DayNotesScreenProps) {
  const { noteOn, saveNote, cloud } = useDayNotes();
  const [draft, setDraft] = useState(() => noteOn(date));
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const notToday = date !== chicagoToday();

  useEffect(() => {
    setDraft(noteOn(date));
  }, [date, noteOn]);

  const onSave = async () => {
    setSaving(true);
    try {
      await saveNote(date, draft);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1200);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={
        notToday
          ? "screen overlay-screen overlay-not-today day-notes-screen"
          : "screen overlay-screen day-notes-screen"
      }
    >
      <header className="overlay-header">
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <BrandMark size="sm" />
        <div>
          <p className="eyebrow">Day notes</p>
          <h1 className="overlay-title">Notes</h1>
          <p className={notToday ? "overlay-sub overlay-not-today-banner" : "overlay-sub"}>
            {notToday ? `Not today — ${formatHeaderDate(date)}` : formatHeaderDate(date)}
            {cloud ? " · synced" : " · this device"}
          </p>
        </div>
      </header>

      <p className="field-hint">
        Notes stay with this calendar day only. They do not carry over to the next
        day.
      </p>

      <label className="day-notes-field">
        <span className="field-label">Notes</span>
        <textarea
          className="day-notes-textarea"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type notes for this day…"
          rows={12}
          autoFocus
        />
      </label>

      <div className="overlay-footer">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Close
        </button>
        <button
          type="button"
          className="btn-primary grow"
          disabled={saving}
          onClick={() => void onSave()}
        >
          {saving ? "Saving…" : savedFlash ? "Saved" : "Save notes"}
        </button>
      </div>
    </div>
  );
}
