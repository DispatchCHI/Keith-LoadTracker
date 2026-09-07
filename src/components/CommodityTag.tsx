import { commodityTone } from "../lib/commodity";

export function CommodityTag({
  commodity,
  note,
}: {
  commodity: string;
  note?: string;
}) {
  const tone = commodityTone(commodity);
  return (
    <span className="tag-wrap">
      <span
        className="tag"
        style={{
          background: tone.bg,
          color: tone.fg,
          borderColor: tone.border,
        }}
      >
        {commodity.replace(" (MSW)", "").replace(" (tanker)", "")}
      </span>
      {note ? <span className="tag-note">{note}</span> : null}
    </span>
  );
}
