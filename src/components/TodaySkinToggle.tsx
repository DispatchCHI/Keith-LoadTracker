import type { TodaySkin } from "../lib/todaySkin";
import "../screens/yard-desk.css";

export function TodaySkinToggle({
  skin,
  onToggle,
}: {
  skin: TodaySkin;
  onToggle: () => void;
}) {
  const yard = skin === "yard";
  return (
    <button
      type="button"
      className="today-skin-toggle"
      aria-pressed={yard}
      onClick={onToggle}
    >
      {yard ? "Today" : "Yard Desk"}
    </button>
  );
}
