// Sparklines (table cells) and time-series charts (uPlot) for CPU / memory.
// One measure per chart: CPU and memory never share an axis.
import { useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import type { Point } from '../lib/types';
import { bytes, pct, time } from '../lib/format';

export function Sparkline({
  points,
  field,
  color,
  width = 88,
  height = 24,
  max,
}: {
  points: Point[];
  field: 'cpu' | 'mem';
  color: string;
  width?: number;
  height?: number;
  max?: number;
}) {
  const recent = points.slice(-60);
  if (recent.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const vals = recent.map((p) => p[field]);
  // CPU is anchored at 0%; memory uses its own range so small changes stay visible.
  let lo = field === 'cpu' ? 0 : Math.min(...vals);
  let hi = Math.max(max ?? 0, ...vals, field === 'cpu' ? 5 : 0);
  if (hi - lo < (field === 'cpu' ? 1 : hi * 0.02 || 1)) {
    const mid = (hi + lo) / 2;
    lo = mid - (field === 'cpu' ? 0.5 : mid * 0.02 || 1);
    hi = mid + (field === 'cpu' ? 0.5 : mid * 0.02 || 1);
    if (field === 'cpu') lo = Math.max(0, lo);
  }
  const step = width / (recent.length - 1);
  const y = (v: number) => height - 2 - ((v - lo) / (hi - lo)) * (height - 4);
  const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={color} opacity={0.08} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Re-render charts when the theme changes.
function useThemeKey() {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const bump = () => setKey((k) => k + 1);
    mq.addEventListener('change', bump);
    const obs = new MutationObserver(bump);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', bump);
      obs.disconnect();
    };
  }, []);
  return key;
}

export function TimeChart({
  title,
  points,
  field,
  colorVar,
  height = 180,
}: {
  title: string;
  points: Point[];
  field: 'cpu' | 'mem';
  colorVar: string;
  height?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const [hover, setHover] = useState<{ t: number; v: number } | null>(null);
  const themeKey = useThemeKey();
  const fmt = field === 'cpu' ? (v: number) => pct(v) : (v: number) => bytes(v);

  const data = useMemo<uPlot.AlignedData>(
    () => [points.map((p) => p.t / 1000), points.map((p) => p[field])],
    [points, field],
  );

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const color = cssVar(colorVar);
    const axis = { stroke: cssVar('--muted'), grid: { stroke: cssVar('--grid'), width: 1 }, ticks: { show: false }, font: '11px system-ui' };
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height,
      padding: [8, 8, 0, 0],
      cursor: { y: false, points: { size: 8, fill: color, stroke: cssVar('--surface'), width: 2 } },
      legend: { show: false },
      scales: { x: { time: true }, y: { range: (_u, _min, max) => [0, Math.max(field === 'cpu' ? 10 : 1024 * 1024 * 10, max * 1.15)] } },
      axes: [
        { ...axis, space: 80, values: (_u, vals) => vals.map((v) => new Date(v * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })) },
        { ...axis, size: 60, values: (_u, vals) => vals.map((v) => (field === 'cpu' ? `${v}%` : bytes(v, 0))) },
      ],
      series: [
        {},
        {
          label: title,
          stroke: color,
          width: 2,
          fill: color + '1f',
          points: { show: false },
        },
      ],
      hooks: {
        setCursor: [
          (u) => {
            const i = u.cursor.idx;
            if (i == null) return setHover(null);
            setHover({ t: (u.data[0][i] as number) * 1000, v: u.data[1][i] as number });
          },
        ],
      },
    };
    plot.current = new uPlot(opts, data, el);
    const ro = new ResizeObserver(() => plot.current?.setSize({ width: el.clientWidth, height }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
    // data is applied by the effect below; rebuild only on theme/shape changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey, field, colorVar, height, title]);

  useEffect(() => {
    plot.current?.setData(data);
  }, [data]);

  const latest = points.at(-1)?.[field];
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-medium text-ink-2">{title}</h3>
        <div className="text-right text-xs text-muted tabular">
          {hover ? (
            <>
              <span className="text-[13px] font-semibold text-ink">{fmt(hover.v)}</span> · {time(hover.t)}
            </>
          ) : (
            <>
              <span className="text-[13px] font-semibold text-ink">{latest != null ? fmt(latest) : '—'}</span> now
            </>
          )}
        </div>
      </div>
      <div ref={wrap} className="w-full" style={{ height }} role="img" aria-label={`${title} over the last ${points.length} samples`} />
    </div>
  );
}
