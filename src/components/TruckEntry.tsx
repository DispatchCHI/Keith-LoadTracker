import { Numpad } from "./Numpad";

type TruckEntryProps = {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  autoFocus?: boolean;
  hint?: string;
};

function sanitizeTruck(raw: string, maxLength = 6): string {
  return raw.replace(/\D/g, "").slice(0, maxLength);
}

export function TruckEntry({
  value,
  onChange,
  onSubmit,
  submitLabel = "Find",
  autoFocus = false,
  hint = "Type the unit number or use the pad.",
}: TruckEntryProps) {
  return (
    <div className="truck-entry">
      <label className="truck-kb-label">
        Truck number
        <input
          className="truck-kb-input"
          value={value}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="e.g. 418"
          aria-label="Truck number"
          onChange={(e) => onChange(sanitizeTruck(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value) onSubmit();
          }}
        />
      </label>
      <p className="field-hint tight">{hint} Enter to continue.</p>
      <Numpad
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        submitLabel={submitLabel}
      />
    </div>
  );
}
