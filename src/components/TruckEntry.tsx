import { sanitizeTruck, sanitizeTruckListInput } from "../lib/truck";

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
}: TruckEntryProps) {
  return (
    <div className="truck-entry">
      <label className="truck-kb-label">
        Truck
        <input
          className="truck-kb-input"
          value={value}
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder={allowMulti ? "e.g. 207 or 207, 214" : "e.g. 418 or VZ"}
          aria-label={
            allowMulti
              ? "Truck or broker codes, comma-separated"
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
            if (e.key === "Enter" && value) onSubmit();
          }}
        />
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
        <p className="field-hint tight">{hint} Enter to continue.</p>
      )}
      <button
        type="button"
        className="btn-primary"
        disabled={!value}
        onClick={onSubmit}
      >
        {submitLabel}
      </button>
    </div>
  );
}
