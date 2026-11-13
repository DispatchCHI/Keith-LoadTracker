import { useEffect, useState } from "react";
import { sanitizeTruck, sanitizeTruckListInput } from "../lib/truck";

export type TruckNameChoice = {
  id: string;
  label: string;
};

type TruckEntryProps = {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  autoFocus?: boolean;
  hint?: string;
  driverPreview?: string;
  /** When true, commas separate multiple trucks (Log Load only). */
  allowMulti?: boolean;
  error?: string | null;
  /** Log Load: matching drivers when the field has letters. Empty for a truck number. */
  nameChoices?: readonly TruckNameChoice[];
  onNamePick?: (id: string) => void;
};

export function TruckEntry({
  value,
  onChange,
  onSubmit,
  submitLabel = "Find",
  autoFocus = false,
  hint = "Type the unit number or broker code.",
  driverPreview,
  allowMulti = false,
  error = null,
  nameChoices = [],
  onNamePick,
}: TruckEntryProps) {
  const [highlight, setHighlight] = useState(0);
  const [namesDismissed, setNamesDismissed] = useState(false);
  useEffect(() => {
    setHighlight(0);
    setNamesDismissed(false);
  }, [value]);
  const choices = namesDismissed ? [] : nameChoices;
  const activeIndex =
    choices.length === 0 ? 0 : Math.min(highlight, choices.length - 1);
  const pickActive = () => {
    const pick = choices[activeIndex];
    if (pick) onNamePick?.(pick.id);
  };

  return (
    <div className="truck-entry">
      <label className="truck-kb-label">
        Truck
        <span className="truck-kb-field">
        <input
          className="truck-kb-input"
          value={value}
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={choices.length > 0}
          aria-controls={choices.length > 0 ? "truck-name-list" : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            choices.length > 0 ? `truck-name-${choices[activeIndex]?.id}` : undefined
          }
          placeholder={
            onNamePick
              ? allowMulti
                ? "e.g. 207 or a driver name"
                : "e.g. 418 or a driver name"
              : allowMulti
                ? "e.g. 207 or 207, 214"
                : "e.g. 418 or VZ"
          }
          aria-label={
            allowMulti
              ? onNamePick
                ? "Truck number or driver name"
                : "Truck or broker codes, comma-separated"
              : "Truck or broker code"
          }
          onChange={(e) =>
            onChange(
              allowMulti
                ? sanitizeTruckListInput(e.target.value)
                : sanitizeTruck(e.target.value),
            )
          }
          onKeyDown={(e) => {
            if (
              choices.length > 0 &&
              (e.key === "ArrowDown" ||
                e.key === "ArrowUp" ||
                e.key === "Enter" ||
                e.key === "Escape")
            ) {
              e.preventDefault();
              if (e.key === "ArrowDown") {
                setHighlight((h) => Math.min(h + 1, choices.length - 1));
              } else if (e.key === "ArrowUp") {
                setHighlight((h) => Math.max(0, h - 1));
              } else if (e.key === "Escape") {
                setNamesDismissed(true);
              } else {
                pickActive();
              }
              return;
            }
            if (e.key === "Enter" && value) onSubmit();
          }}
        />
        {choices.length > 0 ? (
          <ul className="truck-name-list" id="truck-name-list" role="listbox">
            {choices.map((choice, index) => (
              <li key={choice.id}>
                <button
                  type="button"
                  id={`truck-name-${choice.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? "truck-name-opt is-active" : "truck-name-opt"}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onNamePick?.(choice.id)}
                >
                  {choice.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        </span>
      </label>
      {error ? (
        <p className="field-hint tight" role="alert" style={{ color: "var(--amber)" }}>
          {error}
        </p>
      ) : driverPreview ? (
        <p className="truck-driver-preview" aria-live="polite">
          {driverPreview}
        </p>
      ) : (
        <p className="field-hint tight">
          {choices.length > 0 ? hint : `${hint} Enter to continue.`}
        </p>
      )}
      <button
        type="button"
        className="btn-primary"
        disabled={!value}
        onClick={() => {
          if (choices.length > 0) pickActive();
          else onSubmit();
        }}
      >
        {submitLabel}
      </button>
    </div>
  );
}
