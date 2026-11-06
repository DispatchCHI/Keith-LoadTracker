import type { CSSProperties, PointerEvent } from "react";

type ChipProps = {
  label: string;
  selected?: boolean;
  invalid?: boolean;
  muted?: boolean;
  onClick?: () => void;
  /** Tint shown while not selected (1.1.50 owner colors). */
  tone?: CSSProperties;
  className?: string;
  /** data-* attributes (pickup grid drag targets). */
  attrs?: Record<string, string>;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel?: (event: PointerEvent<HTMLButtonElement>) => void;
};

export function Chip({
  label,
  selected = false,
  invalid = false,
  muted = false,
  onClick,
  tone,
  className = "",
  attrs,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: ChipProps) {
  const classes = [
    "chip",
    selected ? "chip-selected" : "",
    invalid ? "chip-invalid" : "",
    muted ? "chip-muted" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      aria-pressed={selected}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={selected || invalid || muted ? undefined : tone}
      {...attrs}
    >
      {invalid ? <s>{label}</s> : label}
    </button>
  );
}
