"use client";

import { useEffect, useId, useRef, useState } from "react";

/*
  Small hand-built SVG charts for the Progress tab (no chart library: keeps the app light and offline).
  Marks follow one spec: 2px lines, ≥8px dots with a 2px surface ring, columns ≤24px with 4px rounded
  tops, hairline solid gridlines, text in text colors (never the series color). Touch or hover shows a
  crosshair/tooltip; every value is also listed somewhere without it (labels, lists, or tables).
  Colors: --chart-1 (lifting, cobalt) and --chart-2 (cardio, teal), validated against the dark card.
*/

/** Renders at the container's real width, so text never scales. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Clean axis ticks: 3–5 round numbers covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.05);
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

const fmtTick = (v: number) => (Math.abs(v) >= 10_000 ? `${Math.round(v / 1000)}K` : v.toLocaleString(undefined, { maximumFractionDigits: 1 }));

export type LinePoint = { x: number; y: number; label?: string };
export type LineSeries = { name: string; points: LinePoint[]; color: string; dots?: "all" | "end" | "none"; width?: number; muted?: boolean };

/**
 * A time-series line chart with one y-axis. Drag or hover to move the crosshair; the tooltip lists every
 * series at the nearest date.
 */
export function LineChart({
  series, height = 200, format = (v) => fmtTick(v), xLabel = defaultXLabel, ariaLabel,
}: {
  series: LineSeries[];
  height?: number;
  format?: (v: number) => string;
  xLabel?: (t: number) => string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points);
  const xs = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
  const pad = { l: 44, r: 14, t: 12, b: 26 };
  const ticks = niceTicks(Math.min(...all.map((p) => p.y)), Math.max(...all.map((p) => p.y)));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const x0 = xs[0] ?? 0;
  const x1 = xs[xs.length - 1] ?? 1;
  const w = Math.max(0, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;
  const sx = (x: number) => pad.l + (x1 === x0 ? w / 2 : ((x - x0) / (x1 - x0)) * w);
  const sy = (y: number) => pad.t + h - ((y - yMin) / (yMax - yMin || 1)) * h;
  const xTicks = pickXTicks(xs, w);

  const nearest = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const px = clientX - r.left;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(sx(xs[i]) - px) < Math.abs(sx(xs[best]) - px)) best = i;
    return xs.length ? best : null;
  };
  const ax = active !== null ? xs[active] : null;
  const rows = ax === null ? [] : series.map((s) => ({ s, p: s.points.find((p) => p.x === ax) })).filter((r) => r.p);
  const tipLeft = ax === null ? 0 : Math.min(Math.max(sx(ax) - 70, 0), Math.max(0, width - 140));

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          className="touch-pan-y"
          onPointerDown={(e) => setActive(nearest(e.clientX, e.currentTarget))}
          onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons) && setActive(nearest(e.clientX, e.currentTarget))}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={pad.l - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="num fill-muted text-[11px] font-semibold">{format(t)}</text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            // The first and last labels hug the plot edges so they're never cut off.
            <text
              key={t} x={sx(t)} y={height - 6}
              textAnchor={xTicks.length > 1 && i === 0 ? "start" : xTicks.length > 1 && i === xTicks.length - 1 ? "end" : "middle"}
              className="fill-muted text-[11px] font-semibold"
            >
              {xLabel(t)}
            </text>
          ))}
          {ax !== null && <line x1={sx(ax)} x2={sx(ax)} y1={pad.t} y2={pad.t + h} stroke="var(--muted)" strokeOpacity={0.5} strokeWidth={1} />}
          {series.map((s) => {
            const pts = [...s.points].sort((a, b) => a.x - b.x);
            const d = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
            const dots = s.dots === "all" ? pts : s.dots === "none" ? [] : pts.slice(-1);
            return (
              <g key={s.name}>
                {pts.length > 1 && s.width !== 0 && (
                  <path d={d} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeLinejoin="round" strokeLinecap="round" opacity={s.muted ? 0.45 : 1} />
                )}
                {(pts.length === 1 ? pts : dots).map((p) => (
                  <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={s.muted ? 3 : 4} fill={s.color} stroke="var(--card)" strokeWidth={2} opacity={s.muted ? 0.6 : 1} />
                ))}
                {ax !== null && pts.some((p) => p.x === ax) && !s.muted && (
                  <circle cx={sx(ax)} cy={sy(pts.find((p) => p.x === ax)!.y)} r={5} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                )}
              </g>
            );
          })}
        </svg>
      )}
      {ax !== null && rows.length > 0 && (
        <div className="pointer-events-none absolute top-0 w-[140px] rounded-xl border border-line bg-card-2 px-3 py-2 shadow-lg" style={{ left: tipLeft }}>
          <div className="text-xs font-bold text-muted">{tooltipDate(ax)}</div>
          {rows.map(({ s, p }) => (
            <div key={s.name} className="flex items-center gap-2">
              <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="num text-sm font-extrabold text-ink">{p!.label ?? format(p!.y)}</span>
              {series.length > 1 && <span className="truncate text-xs font-semibold text-muted">{s.name}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const defaultXLabel = (t: number) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
const tooltipDate = (t: number) => new Date(t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

/** Up to ~4 date labels that don't collide. */
function pickXTicks(xs: number[], width: number) {
  if (xs.length <= 1) return xs;
  const n = Math.max(2, Math.min(4, Math.floor(width / 80)));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(xs[Math.round((i * (xs.length - 1)) / (n - 1))]);
  return [...new Set(out)];
}

/** A tiny trend line for list rows: the latest point gets the dot. */
export function Sparkline({ values, width = 72, height = 28, color = "var(--chart-1)" }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sx = (i: number) => 4 + (i / (values.length - 1)) * (width - 8);
  const sy = (v: number) => (max === min ? height / 2 : 4 + (1 - (v - min) / (max - min)) * (height - 8));
  const d = values.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} aria-hidden="true" className="shrink-0">
      <path d={d} fill="none" stroke="var(--muted)" strokeOpacity={0.55} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(values.length - 1)} cy={sy(values[values.length - 1])} r={3.5} fill={color} stroke="var(--card)" strokeWidth={2} />
    </svg>
  );
}

export type Column = { key: string; label: string; value: number; display: string; current?: boolean };

/**
 * Columns from one baseline (weekly totals). The current period is in the series color, earlier ones a
 * step quieter; tap a column for its value. The latest value is printed on its cap.
 */
export function ColumnChart({ columns, height = 150, color = "var(--chart-1)", ariaLabel, format = fmtTick }: {
  columns: Column[]; height?: number; color?: string; ariaLabel: string; format?: (v: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<string | null>(null);
  const pad = { l: 36, r: 6, t: 20, b: 24 };
  const max = Math.max(1, ...columns.map((c) => c.value));
  const ticks = niceTicks(0, max, 3);
  const top = ticks[ticks.length - 1];
  const w = Math.max(0, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;
  const slot = columns.length ? w / columns.length : w;
  const bw = Math.min(24, slot - 6);
  const sy = (v: number) => pad.t + h - (v / top) * h;
  const clip = useId();
  const act = columns.find((c) => c.key === active);
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={pad.l - 6} y={sy(t)} dy="0.32em" textAnchor="end" className="num fill-muted text-[11px] font-semibold">{format(t)}</text>
            </g>
          ))}
          {columns.map((c, i) => {
            const cx = pad.l + slot * i + slot / 2;
            const y = sy(c.value);
            const bh = pad.t + h - y;
            const last = i === columns.length - 1;
            return (
              <g key={c.key} onPointerDown={() => setActive(c.key)} onPointerEnter={(e) => e.pointerType === "mouse" && setActive(c.key)}>
                <rect x={cx - slot / 2} y={pad.t} width={slot} height={h + pad.b} fill="transparent" />
                {bh > 0 && (
                  <>
                    <clipPath id={`${clip}-${i}`}><rect x={cx - bw / 2} y={y} width={bw} height={bh} /></clipPath>
                    <rect
                      x={cx - bw / 2} y={y} width={bw} height={bh + 4} rx={4} clipPath={`url(#${clip}-${i})`}
                      fill={color} opacity={c.current || active === c.key ? 1 : 0.55}
                    />
                  </>
                )}
                <text x={cx} y={height - 7} textAnchor="middle" className={`text-[11px] font-semibold ${c.current ? "fill-ink" : "fill-muted"}`}>{c.label}</text>
                {last && c.value > 0 && active === null && (
                  <text x={cx} y={y - 6} textAnchor="middle" className="num fill-ink text-[11px] font-extrabold">{c.display}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {act && (
        <div
          className="pointer-events-none absolute top-0 rounded-xl border border-line bg-card-2 px-3 py-1.5 shadow-lg"
          style={{ left: Math.min(Math.max(pad.l + slot * columns.indexOf(act) + slot / 2 - 60, 0), Math.max(0, width - 120)), width: 120 }}
        >
          <div className="num text-sm font-extrabold text-ink">{act.display}</div>
          <div className="text-xs font-semibold text-muted">{act.label === "Now" ? "This week" : `Week of ${act.label}`}</div>
        </div>
      )}
    </div>
  );
}

/**
 * Horizontal bars against a target range (weekly sets per muscle). The range is a faint band; the bar
 * is the series color, or warning orange only when far over the top of the range.
 */
export function RangeBar({ value, range, max }: { value: number; range: [number, number]; max: number }) {
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="relative h-3 w-full rounded-full bg-card-2" aria-hidden="true">
      <div className="absolute inset-y-0 rounded-full bg-accent/15" style={{ left: pct(range[0]), width: `calc(${pct(range[1])} - ${pct(range[0])})` }} />
      {value > 0 && (
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `max(12px, ${pct(value)})`, background: value > range[1] * 1.25 ? "var(--warn)" : "var(--chart-1)" }}
        />
      )}
    </div>
  );
}
