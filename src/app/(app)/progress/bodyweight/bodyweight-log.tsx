"use client";

import { useMemo, useState } from "react";
import { useProfile } from "@/lib/db/provider";
import { useBodyweightActions, useProgressData } from "@/lib/progress-data";
import { weightTrend } from "@/lib/progress";
import { toDisplayWeight, weightUnit } from "@/lib/units";
import { LineChart } from "@/components/charts";
import { BodyweightSheet } from "@/components/bodyweight-sheet";
import { Card, Empty, PageHeader, btn } from "@/components/ui/kit";

/** Every bodyweight entry: the full chart, then a list to fix or delete entries. */
export function BodyweightLog() {
  const data = useProgressData();
  const { profile } = useProfile();
  const { remove } = useBodyweightActions();
  const [editing, setEditing] = useState<{ date: string; lb: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const units = profile?.units ?? "lb";
  const u = weightUnit(units);
  const trend = useMemo(() => weightTrend(data?.weights ?? []), [data]);
  if (!data) return null;
  const byDate = new Map(data.weights.map((w) => [w.date, w.id]));
  const x = (d: string) => new Date(`${d}T12:00:00`).getTime();
  const fmt = (v: number) => `${toDisplayWeight(v, units).toFixed(1)} ${u}`;

  return (
    <main className="flex flex-col gap-4 pb-4">
      <PageHeader title="Bodyweight" back="/progress" />
      <button type="button" className={btn.primary} onClick={() => setAdding(true)}>+ Log weight</button>
      {trend.points.length > 1 && (
        <Card className="p-4">
          <LineChart
            ariaLabel="Bodyweight, all entries, with 7-day average"
            height={220}
            format={(v) => toDisplayWeight(v, units).toFixed(0)}
            series={[
              { name: "Daily", color: "var(--muted)", dots: trend.points.length <= 120 ? "all" : "none", width: 0, muted: true, points: trend.points.map((p) => ({ x: x(p.date), y: p.value, label: fmt(p.value) })) },
              { name: "7-day avg", color: "var(--chart-1)", dots: "end", points: trend.points.map((p) => ({ x: x(p.date), y: p.avg, label: fmt(p.avg) })) },
            ]}
          />
        </Card>
      )}
      {trend.points.length === 0 ? (
        <Empty>No weights logged yet.</Empty>
      ) : (
        <Card className="divide-y divide-line">
          {[...trend.points].reverse().map((p, i, arr) => {
            const prev = arr[i + 1];
            const diff = prev ? toDisplayWeight(p.value, units) - toDisplayWeight(prev.value, units) : null;
            return (
              <div key={p.date} className="flex min-h-14 items-center gap-3 pl-4">
                <button type="button" onClick={() => setEditing({ date: p.date, lb: p.value })} className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 text-left">
                  <span className="text-base font-semibold">{new Date(`${p.date}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                  <span className="flex items-baseline gap-2">
                    {diff !== null && Math.abs(diff) >= 0.05 && <span className="num text-xs font-bold text-muted">{diff > 0 ? "+" : "−"}{Math.abs(diff).toFixed(1)}</span>}
                    <span className="display num text-xl font-extrabold">{toDisplayWeight(p.value, units).toFixed(1)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${p.date}`}
                  onClick={() => {
                    const id = byDate.get(p.date);
                    if (id && confirm("Delete this entry?")) void remove(id);
                  }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-muted"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            );
          })}
        </Card>
      )}
      <BodyweightSheet open={adding} onClose={() => setAdding(false)} />
      <BodyweightSheet open={editing !== null} onClose={() => setEditing(null)} initial={editing ?? undefined} />
    </main>
  );
}
