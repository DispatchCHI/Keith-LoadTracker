import { useEffect, useState, type ReactNode } from "react";
import { useDispatchTallies } from "../store/DispatchTalliesContext";

function TallyStepper({
  label,
  value,
  onSet,
  onStepDown,
  onStepUp,
}: {
  label: string;
  value: number;
  onSet: (n: number) => void;
  onStepDown: () => void;
  onStepUp: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n >= 0) onSet(Math.floor(n));
    else setDraft(String(value));
    setEditing(false);
  };

  return (
    <div className="tally-chip-main">
      <button
        type="button"
        className="tally-step"
        onClick={onStepDown}
        aria-label={`Subtract one from ${label}`}
      >
        −
      </button>
      {editing ? (
        <input
          className="tally-chip-input"
          type="number"
          inputMode="numeric"
          min={0}
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(String(value));
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="tally-chip-value"
          onClick={() => setEditing(true)}
          aria-label={`Set ${label}`}
        >
          {value}
        </button>
      )}
      <button
        type="button"
        className="tally-step"
        onClick={onStepUp}
        aria-label={`Add one to ${label}`}
      >
        +
      </button>
    </div>
  );
}

export function TallyChip({
  label,
  value,
  sub,
  onSet,
  onStepDown,
  onStepUp,
  onRemove,
}: {
  label: string;
  value: number;
  sub?: string;
  onSet: (n: number) => void;
  onStepDown: () => void;
  onStepUp: () => void;
  /** Added counters only: small × that asks before removing the card. */
  onRemove?: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <div className="tally-chip">
      {onRemove ? (
        <div className="tally-chip-head">
          <span className="tally-chip-label">{label}</span>
          <button
            type="button"
            className="tally-chip-remove"
            aria-label={`Remove ${label} counter`}
            title="Remove counter"
            onClick={() => setConfirmRemove(true)}
          >
            ×
          </button>
        </div>
      ) : (
        <span className="tally-chip-label">{label}</span>
      )}
      {confirmRemove && onRemove ? (
        <div className="tally-chip-confirm" role="alert">
          <span>Remove this counter from Today on all desks?</span>
          <div className="tally-chip-confirm-btns">
            <button type="button" className="btn-ghost" onClick={() => setConfirmRemove(false)}>
              Keep
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setConfirmRemove(false);
                onRemove();
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : null}
      <TallyStepper
        label={label}
        value={value}
        onSet={onSet}
        onStepDown={onStepDown}
        onStepUp={onStepUp}
      />
      {sub ? <span className="tally-chip-sub">{sub}</span> : null}
    </div>
  );
}

function BataviaTallyChip({
  preload,
  asking,
  sub,
  onSetPreload,
  onStepDownPreload,
  onStepUpPreload,
  onSetAsking,
  onStepDownAsking,
  onStepUpAsking,
}: {
  preload: number;
  asking: number;
  sub: string;
  onSetPreload: (n: number) => void;
  onStepDownPreload: () => void;
  onStepUpPreload: () => void;
  onSetAsking: (n: number) => void;
  onStepDownAsking: () => void;
  onStepUpAsking: () => void;
}) {
  return (
    <div className="tally-chip tally-chip-dual">
      <span className="tally-chip-label">Batavia</span>
      <div className="tally-dual-rows">
        <div className="tally-dual-row">
          <span className="tally-dual-label">Preloads</span>
          <TallyStepper
            label="Batavia Preloads"
            value={preload}
            onSet={onSetPreload}
            onStepDown={onStepDownPreload}
            onStepUp={onStepUpPreload}
          />
        </div>
        <div className="tally-dual-row">
          <span className="tally-dual-label">Asking</span>
          <TallyStepper
            label="Asking"
            value={asking}
            onSet={onSetAsking}
            onStepDown={onStepDownAsking}
            onStepUp={onStepUpAsking}
          />
        </div>
      </div>
      <span className="tally-chip-sub">{sub}</span>
    </div>
  );
}

export function DispatchTalliesRow({
  date,
  bataviaDispatchedToday,
  evanstonDispatchedToday,
  hookerDispatchedToday,
  children,
}: {
  date: string;
  bataviaDispatchedToday: number;
  evanstonDispatchedToday: number;
  hookerDispatchedToday: number;
  /** Extra customer counters + the "Add counter" button, after Hooker Street. */
  children?: ReactNode;
}) {
  const {
    talliesOn,
    setBataviaPreload,
    decrementBataviaPreload,
    setBataviaAsking,
    setEvanstonAsking,
    setHookerAsking,
  } = useDispatchTallies();
  const tallies = talliesOn(date);

  return (
    <div className="tally-chip-row">
      <BataviaTallyChip
        preload={tallies.bataviaPreload}
        asking={tallies.bataviaAsking}
        sub={`${bataviaDispatchedToday} dispatched today`}
        onSetPreload={(n) => void setBataviaPreload(date, n)}
        onStepDownPreload={() => void decrementBataviaPreload(date)}
        onStepUpPreload={() => void setBataviaPreload(date, tallies.bataviaPreload + 1)}
        onSetAsking={(n) => void setBataviaAsking(date, n)}
        onStepDownAsking={() => void setBataviaAsking(date, Math.max(0, tallies.bataviaAsking - 1))}
        onStepUpAsking={() => void setBataviaAsking(date, tallies.bataviaAsking + 1)}
      />
      <TallyChip
        label="Evanston Asking"
        value={tallies.evanstonAsking}
        sub={`${evanstonDispatchedToday} dispatched today`}
        onSet={(n) => void setEvanstonAsking(date, n)}
        onStepDown={() => void setEvanstonAsking(date, Math.max(0, tallies.evanstonAsking - 1))}
        onStepUp={() => void setEvanstonAsking(date, tallies.evanstonAsking + 1)}
      />
      <TallyChip
        label="Hooker Street"
        value={tallies.hookerAsking}
        sub={`${hookerDispatchedToday} dispatched today`}
        onSet={(n) => void setHookerAsking(date, n)}
        onStepDown={() => void setHookerAsking(date, Math.max(0, tallies.hookerAsking - 1))}
        onStepUp={() => void setHookerAsking(date, tallies.hookerAsking + 1)}
      />
      {children}
    </div>
  );
}
