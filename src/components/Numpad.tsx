import { Delete, CornerDownLeft } from "lucide-react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

type NumpadProps = {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  maxLength?: number;
};

export function Numpad({
  value,
  onChange,
  onSubmit,
  submitLabel = "Find",
  maxLength = 6,
}: NumpadProps) {
  const push = (digit: string) => {
    if (value.length >= maxLength) return;
    onChange(value + digit);
  };

  const backspace = () => onChange(value.slice(0, -1));

  return (
    <div className="numpad">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="numpad-key"
          onClick={() => push(key)}
        >
          {key}
        </button>
      ))}
      <button
        type="button"
        className="numpad-key numpad-ghost"
        onClick={backspace}
        aria-label="Backspace"
      >
        <Delete size={26} strokeWidth={2} />
      </button>
      <button type="button" className="numpad-key" onClick={() => push("0")}>
        0
      </button>
      <button
        type="button"
        className="numpad-key numpad-go"
        onClick={onSubmit}
        disabled={!value}
      >
        <span>{submitLabel}</span>
        <CornerDownLeft size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}
