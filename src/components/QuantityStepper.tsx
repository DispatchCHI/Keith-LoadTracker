import { Minus, Plus } from "lucide-react";
import { clampLoadQty, MAX_LOAD_QTY, MIN_LOAD_QTY } from "../lib/quantity";

type QuantityStepperProps = {
  value: number;
  onChange: (next: number) => void;
};

export function QuantityStepper({ value, onChange }: QuantityStepperProps) {
  const qty = clampLoadQty(value);
  return (
    <div className="qty-stepper">
      <span className="qty-label">Loads</span>
      <div className="qty-controls">
        <button
          type="button"
          className="qty-btn"
          aria-label="Fewer loads"
          disabled={qty <= MIN_LOAD_QTY}
          onClick={() => onChange(clampLoadQty(qty - 1))}
        >
          <Minus size={18} strokeWidth={2.6} />
        </button>
        <span className="qty-value" aria-live="polite">
          {qty}
        </span>
        <button
          type="button"
          className="qty-btn"
          aria-label="More loads"
          disabled={qty >= MAX_LOAD_QTY}
          onClick={() => onChange(clampLoadQty(qty + 1))}
        >
          <Plus size={18} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}
