import type { PieSlice } from "../lib/analytics";

const CX = 100;
const CY = 100;
const R_OUT = 78;
const R_IN = 46;

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function donutPath(start: number, end: number): string {
  const sweep = end - start;
  if (sweep >= 359.99) {
    const [ox, oy] = polar(CX, CY, R_OUT, 0);
    const [ox2, oy2] = polar(CX, CY, R_OUT, 180);
    const [ix, iy] = polar(CX, CY, R_IN, 0);
    const [ix2, iy2] = polar(CX, CY, R_IN, 180);
    return [
      `M ${ox} ${oy}`,
      `A ${R_OUT} ${R_OUT} 0 1 1 ${ox2} ${oy2}`,
      `A ${R_OUT} ${R_OUT} 0 1 1 ${ox} ${oy}`,
      `L ${ix} ${iy}`,
      `A ${R_IN} ${R_IN} 0 1 0 ${ix2} ${iy2}`,
      `A ${R_IN} ${R_IN} 0 1 0 ${ix} ${iy}`,
      "Z",
    ].join(" ");
  }
  const [ox1, oy1] = polar(CX, CY, R_OUT, start);
  const [ox2, oy2] = polar(CX, CY, R_OUT, end);
  const [ix2, iy2] = polar(CX, CY, R_IN, end);
  const [ix1, iy1] = polar(CX, CY, R_IN, start);
  const large = sweep > 180 ? 1 : 0;
  return [
    `M ${ox1} ${oy1}`,
    `A ${R_OUT} ${R_OUT} 0 ${large} 1 ${ox2} ${oy2}`,
    `L ${ix2} ${iy2}`,
    `A ${R_IN} ${R_IN} 0 ${large} 0 ${ix1} ${iy1}`,
    "Z",
  ].join(" ");
}

function shortLabel(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.length > 10 ? `${first.slice(0, 9)}…` : first;
}

export function StationPie({
  slices,
  total,
}: {
  slices: PieSlice[];
  total: number;
}) {
  if (slices.length === 0 || total === 0) return null;

  let cursor = 0;
  const drawn = slices.map((slice) => {
    const sweep = (slice.pct / 100) * 360;
    const start = cursor;
    const end = cursor + sweep;
    cursor = end;
    const mid = start + sweep / 2;
    const [lx, ly] = polar(CX, CY, (R_OUT + R_IN) / 2, mid);
    return { slice, start, end, mid, lx, ly, sweep };
  });

  return (
    <div className="station-pie">
      <svg
        className="station-pie-svg"
        viewBox="0 0 200 200"
        role="img"
        aria-label="Year-to-date loads by transfer station"
      >
        {drawn.map(({ slice, start, end, lx, ly, sweep }) => (
          <g key={slice.key}>
            <path
              d={donutPath(start, end)}
              fill={slice.color}
              stroke="#14161b"
              strokeWidth="1.5"
            >
              <title>
                {slice.label}: {slice.count} ({slice.pct}%)
              </title>
            </path>
            {sweep >= 36 ? (
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                className="station-pie-on"
              >
                <tspan x={lx} dy="-0.35em">
                  {shortLabel(slice.label)}
                </tspan>
                <tspan x={lx} dy="1.15em">
                  {slice.pct}%
                </tspan>
              </text>
            ) : null}
          </g>
        ))}
        <text
          x={CX}
          y={CY - 8}
          textAnchor="middle"
          className="station-pie-center-label"
        >
          YTD
        </text>
        <text
          x={CX}
          y={CY + 12}
          textAnchor="middle"
          className="station-pie-center-value"
        >
          {total}
        </text>
      </svg>

      <ul className="station-pie-legend">
        {slices.map((slice) => (
          <li key={slice.key}>
            <span
              className="station-pie-swatch"
              style={{ background: slice.color }}
              aria-hidden
            />
            <span className="station-pie-name">{slice.label}</span>
            <span className="station-pie-meta">
              {slice.count} · {slice.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
