import type { CSSProperties } from "react";

type ChipProps = {
  label: string;
  selected?: boolean;
  invalid?: boolean;
  muted?: boolean;
  onClick?: () => void;
  /** Tint shown while not selected (1.1.50 owner colors). */
  tone?: CSSProperties;
};

export function Chip({
  label,
  selected = false,
  invalid = false,
  muted = false,
  onClick,
  tone,
}: ChipProps) {
  const classes = [
    "chip",
    selected ? "chip-selected" : "",
    invalid ? "chip-invalid" : "",
    muted ? "chip-muted" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      aria-pressed={selected}
      onClick={onClick}
      style={selected || invalid || muted ? undefined : tone}
    >
      {invalid ? <s>{label}</s> : label}
    </button>
  );
}
