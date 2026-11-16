"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useProfile } from "@/lib/db/provider";
import { useNow } from "@/lib/use-now";
import { useProgressData } from "@/lib/progress-data";
import { liftRecords, prEvents, topLifts, type LiftSession } from "@/lib/progress";
import { formatMax, formatWeight, toDisplayWeight, weightUnit } from "@/lib/units";
import { LineChart, Sparkline } from "@/components/charts";
import { Card, Chip, Empty, PageHeader, field } from "@/components/ui/kit";
import type { Units } from "@/lib/db/types";
import { prText, Trophy } from "../progress-screen";

const DAY = 86_400_000;

export function LiftScreen() {
  const id = useSearchParams().get("id");
  return id ? <LiftDetail id={id} /> : <AllLifts />;
}

type Metric = "e1rm" | "weight" | "volume" | "reps";
const RANGES = [
  { id: "3m", label: "3M", days: 91 },
  { id: "6m", label: "6M", days: 182 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "all", label: "All", days: Infinity },
] as const;

function LiftDetail({ id }: { id: string }) {
  const data = useProgressData();
  const { profile } = useProfile();
  const now = useNow(60_000);
  const units: Units = profile?.units ?? "lb";
  const [metric, setMetric] = useState<Metric | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("all");
  const list = useMemo(() => data?.sessions.get(id) ?? [], [data, id]);
  const prs = useMemo(() => (data ? prEvents(new Map([[id, list]])) : []), [data, id, list]);

  if (!data) return null;
  const ex = data.catalog.byId.get(id);
  const name = ex?.name ?? "Lift";
  if (!list.length) {
    return (
      <main className="flex flex-col gap-4">
        <PageHeader title={name} back="/progress" />
        <Empty>No finished sets of this exercise yet.</Empty>
      </main>
    );
  }

  const bodyweight = list.every((s) => s.topWeight === 0);
  const m: Metric = metric ?? (bodyweight ? "reps" : "e1rm");
  const rec = liftRecords(list);
  const u = weightUnit(units);
  const days = RANGES.find((r) => r.id === range)!.days;
  const shown = list.filter((s) => now - new Date(s.at).getTime() <= days * DAY);
  const value = (s: LiftSession) => (m === "e1rm" ? s.e1rm : m === "weight" ? s.topWeight : m === "volume" ? s.volume : s.bestReps);
  const label = (s: LiftSession) =>
    m === "reps" ? `${s.bestReps} reps` : m === "volume" ? `${Math.round(toDisplayWeight(s.volume, units)).toLocaleString()} ${u}` : m === "weight" ? `${formatWeight(s.topWeight, units)} ${u} × ${s.topReps}` : `${formatMax(s.e1rm, units)} ${u}`;
  const metrics: { id: Metric; label: string }[] = bodyweight
    ? [{ id: "reps", label: "Best set" }]
    : [{ id: "e1rm", label: "Est. max" }, { id: "weight", label: "Heaviest" }, { id: "volume", label: "Volume" }];

  return (
    <main className="flex flex-col gap-4 pb-4">
      <PageHeader title={name} back="/progress" right={<Link href={`/more/library/exercise?id=${encodeURIComponent(id)}`} className="display flex h-11 items-center px-2 text-base font-extrabold text-accent">How to</Link>} />

      <div className="grid grid-cols-2 gap-2">
        {bodyweight ? (
          <>
            <Record value={`${rec.reps?.value ?? 0}`} unit="reps" label="BEST SET" at={rec.reps?.at} />
            <Record value={String(list.length)} unit="" label="SESSIONS" at={list[list.length - 1].at} atLabel="last" />
          </>
        ) : (
          <>
            <Record value={formatMax(rec.e1rm?.value ?? 0, units)} unit={u} label="BEST EST. MAX" at={rec.e1rm?.at} />
            <Record value={formatWeight(rec.weight?.value ?? 0, units)} unit={u} label={`HEAVIEST × ${rec.weight?.reps ?? 0}`} at={rec.weight?.at} />
          </>
        )}
      </div>

      <Card className="flex flex-col gap-3 p-4">
        {metrics.length > 1 && (
          <div className="grid grid-cols-3 gap-2">
            {metrics.map((x) => <Chip key={x.id} active={m === x.id} onClick={() => setMetric(x.id)}>{x.label}</Chip>)}
          </div>
        )}
        {shown.length > 0 ? (
          <LineChart
            ariaLabel={`${name}: ${metrics.find((x) => x.id === m)?.label} per session`}
            format={(v) => (m === "reps" ? String(Math.round(v)) : formatWeight(v, units).replace(/\.\d+$/, ""))}
            series={[{ name: metrics.find((x) => x.id === m)!.label, color: "var(--chart-1)", dots: shown.length <= 24 ? "all" : "end", points: shown.map((s) => ({ x: new Date(s.at).getTime(), y: value(s), label: label(s) })) }]}
          />
        ) : (
          <p className="py-8 text-center text-sm font-medium text-muted">Nothing in this range.</p>
        )}
        <div className="grid grid-cols-4 gap-1.5">
          {RANGES.map((r) => <Chip key={r.id} active={range === r.id} onClick={() => setRange(r.id)}>{r.label}</Chip>)}
        </div>
        {m === "e1rm" && (
          <p className="text-xs font-medium text-muted">Estimated 1-rep max from your best set each session (weight × (1 + reps ÷ 30)). It&apos;s a trend line, not a test: it moves when you add weight or reps.</p>
        )}
      </Card>

      {prs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="display px-1 text-2xl font-extrabold">PRs</h2>
          <Card className="divide-y divide-line">
            {prs.slice(0, 8).map((p) => (
              <Link key={`${p.workoutId}-${p.kind}`} href={`/progress/session?id=${p.workoutId}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-card-2">
                <Trophy />
                <span className="min-w-0 flex-1 truncate text-base font-semibold">{prText(p, units)}</span>
                <span className="shrink-0 text-xs font-bold text-muted">{new Date(p.at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
              </Link>
            ))}
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="display px-1 text-2xl font-extrabold">Sessions</h2>
        <Card className="divide-y divide-line">
          {[...list].reverse().slice(0, 30).map((s) => (
            <Link key={s.workoutId} href={`/progress/session?id=${s.workoutId}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-card-2">
              <div className="w-12 shrink-0 text-center">
                <div className="text-xs font-bold text-muted">{new Date(s.at).toLocaleDateString([], { month: "short" }).toUpperCase()}</div>
                <div className="display num text-2xl leading-none font-extrabold">{new Date(s.at).getDate()}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-snug font-semibold">{setsText(s, units)}</div>
                {!bodyweight && <div className="text-xs font-medium text-muted">Est. max {formatMax(s.e1rm, units)} {u}</div>}
              </div>
            </Link>
          ))}
        </Card>
      </section>
    </main>
  );
}

/** "185×8, 185×8, 185×7 · +1 drop" */
function setsText(s: LiftSession, units: Units) {
  const work = s.sets.filter((x) => x.type === "working" && (x.reps ?? 0) > 0);
  const drops = s.sets.filter((x) => x.type === "drop").length;
  const txt = work.map((x) => (x.weight ? `${formatWeight(x.weight, units)}×${x.reps}` : `${x.reps} reps`)).join(", ");
  return `${txt || "Drop sets only"}${drops ? ` · +${drops} drop` : ""}`;
}

function Record({ value, unit, label, at, atLabel }: { value: string; unit: string; label: string; at?: string; atLabel?: string }) {
  return (
    <div className="flex flex-col rounded-2xl bg-card p-3">
      <span className="display text-4xl leading-none font-extrabold">
        {value}{unit && <span className="ml-1 text-lg text-muted">{unit}</span>}
      </span>
      <span className="mt-1 text-xs font-bold tracking-[0.1em] text-muted">{label}</span>
      {at && <span className="text-xs font-semibold text-muted">{atLabel ? `${atLabel} ` : ""}{new Date(at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>}
    </div>
  );
}

/** Every exercise you've logged, most-trained recently first, with search. */
function AllLifts() {
  const data = useProgressData();
  const { profile } = useProfile();
  const now = useNow(60_000);
  const [q, setQ] = useState("");
  const units: Units = profile?.units ?? "lb";
  const lifts = useMemo(() => (data ? topLifts(data.sessions, now, 1000) : []), [data, now]);
  if (!data) return null;
  const needle = q.trim().toLowerCase();
  const shown = lifts.filter((l) => !needle || (data.catalog.byId.get(l.exerciseId)?.name ?? "").toLowerCase().includes(needle));
  const u = weightUnit(units);
  return (
    <main className="flex flex-col gap-4 pb-4">
      <PageHeader title="Lifts" back="/progress" />
      {lifts.length > 8 && <input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your lifts" type="search" />}
      {shown.length === 0 ? (
        <Empty>{lifts.length ? "No lifts match." : "Finish a workout and your lifts show up here."}</Empty>
      ) : (
        <Card className="divide-y divide-line">
          {shown.map((l) => (
            <Link key={l.exerciseId} href={`/progress/lift?id=${encodeURIComponent(l.exerciseId)}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-card-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-bold">{data.catalog.byId.get(l.exerciseId)?.name ?? l.exerciseId}</div>
                <div className="truncate text-sm font-medium text-muted">
                  {l.sessions} {l.sessions === 1 ? "session" : "sessions"} · last {new Date(l.lastAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                </div>
              </div>
              <Sparkline values={l.trend} />
              <span className="display w-20 shrink-0 text-right text-2xl font-extrabold">
                {l.bodyweight ? l.current : formatMax(l.current, units)}
                <span className="ml-0.5 text-sm text-muted">{l.bodyweight ? "reps" : u}</span>
              </span>
            </Link>
          ))}
        </Card>
      )}
    </main>
  );
}
