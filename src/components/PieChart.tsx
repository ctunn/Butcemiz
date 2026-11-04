import type { Slice } from '../lib/stats';

interface Props { slices: Slice[]; size?: number; center?: { label: string; value: string; sub?: string }; selected?: string | null; onSelect?: (id: string | null) => void }

function arc(cx: number, cy: number, r: number, ir: number, a0: number, a1: number) {
  const p = (r: number, a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(r, a0), [x1, y1] = p(r, a1), [x2, y2] = p(ir, a1), [x3, y3] = p(ir, a0);
  return `M${x0} ${y0}A${r} ${r} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${ir} ${ir} 0 ${large} 0 ${x3} ${y3}Z`;
}

/** Truncate a label so it stays inside the donut hole. */
function fit(s: string, max: number) { return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s; }

/** Donut chart drawn in SVG; tap a slice to highlight it. */
export function PieChart({ slices, size = 200, center, selected, onSelect }: Props) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = size / 2, ir = r * 0.62, cx = r, cy = r;
  let a = 0;
  const gap = slices.length > 1 ? 0.012 : 0;
  return (
    <svg className="pie" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={center ? `${center.label} ${center.value}` : 'chart'}>
      {total <= 0 && <circle cx={cx} cy={cy} r={(r + ir) / 2} fill="none" stroke="var(--line)" strokeWidth={r - ir} />}
      {total > 0 && slices.length === 1 && (
        <circle cx={cx} cy={cy} r={(r + ir) / 2} fill="none" stroke={slices[0].color} strokeWidth={r - ir} onClick={() => onSelect?.(selected === slices[0].id ? null : slices[0].id)} />
      )}
      {total > 0 && slices.length > 1 && slices.map((s) => {
        const a0 = a, a1 = a + (s.value / total) * Math.PI * 2;
        a = a1;
        if (a1 - a0 < 0.002) return null;
        const dim = selected && selected !== s.id;
        const grow = selected === s.id ? 5 : 0;
        return (
          <path key={s.id} d={arc(cx, cy, r - 6 + grow, ir, a0 + gap / 2, a1 - gap / 2)} fill={s.color} opacity={dim ? 0.28 : 1}
            style={{ cursor: 'pointer', transition: 'opacity .2s' }} onClick={() => onSelect?.(selected === s.id ? null : s.id)}>
            <title>{`${s.label}: ${(s.pct * 100).toFixed(1)}%`}</title>
          </path>
        );
      })}
      {center && (
        <g pointerEvents="none">
          <text x={cx} y={cy - (center.sub ? 18 : 10)} textAnchor="middle" className="pie-label">{fit(center.label, Math.floor(ir / 3.8))}</text>
          <text x={cx} y={cy + (center.sub ? 6 : 14)} textAnchor="middle" className="pie-value" style={{ fontSize: center.value.length > 10 ? 17 : center.value.length > 8 ? 19 : 21 }}>{center.value}</text>
          {center.sub && <text x={cx} y={cy + 28} textAnchor="middle" className="pie-sub">{center.sub}</text>}
        </g>
      )}
    </svg>
  );
}
