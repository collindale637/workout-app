"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useProfile } from "@/lib/db/provider";
import { useHistory } from "@/lib/history";
import { useNow } from "@/lib/use-now";
import { useProgressData } from "@/lib/progress-data";
import {
  activityCalendar, cardioByType, cardioWeeks, dateKey, daysPerWeek, prEvents, topLifts, weekStart, weekStreak,
  weeklySets, weeklyTarget, weightTrend, type CalendarDay, type PREvent,
} from "@/lib/progress";
import { cardioLabel } from "@/lib/cardio";
import { MUSCLE_GROUPS } from "@/lib/defaults";
import { distanceUnit, formatMax, formatWeight, toDisplayDistance, toDisplayWeight, weightUnit, formatTick } from "@/lib/units";
import { ColumnChart, LineChart, RangeBar, Sparkline } from "@/components/charts";
import { GymSwitcher } from "@/components/gym-switcher";
import { BodyweightSheet } from "@/components/bodyweight-sheet";
import { Card, Chip, btn } from "@/components/ui/kit";
import type { Units } from "@/lib/db/types";
import { useWeeklyTarget } from "@/lib/smart";
import { HistoryList } from "./history";

const DAY = 86_400_000;

export function ProgressScreen() {
  const data = useProgressData();
  const { profile } = useProfile();
  const now = useNow(60_000);
  const weeklyTarget = useWeeklyTarget(profile?.days_per_week);
  const units: Units = profile?.units ?? "lb";
  const [logging, setLogging] = useState(false);

  if (!data || !profile) return <Shell />;
  const empty = data.workouts.length === 0 && data.cardio.length === 0;

  return (
    <Shell>
      {empty && (
        <Card className="flex flex-col gap-2 p-5">
          <h2 className="display text-2xl font-extrabold">Your charts start here</h2>
          <p className="text-base font-medium text-muted">
            Finish a workout or log some cardio and this fills in: estimated maxes, PRs, sets per muscle, cardio totals and a calendar of the days you trained.
          </p>
          <Link href="/" className={`${btn.primary} mt-2`}>Go to Today</Link>
        </Card>
      )}
      {!empty && <ThisWeek data={data} goalDays={weeklyTarget} now={now} />}
      {!empty && <Consistency data={data} goalDays={weeklyTarget} now={now} />}
      {!empty && <RecentPRs data={data} units={units} now={now} />}
      {data.sessions.size > 0 && <Lifts data={data} units={units} now={now} />}
      {data.muscleSets.length > 0 && <MuscleVolume data={data} goal={profile.goal} now={now} />}
      {data.cardio.length > 0 && <Cardio data={data} units={units} now={now} />}
      <Bodyweight data={data} units={units} now={now} onLog={() => setLogging(true)} />
      <RecentHistory />
      <BodyweightSheet open={logging} onClose={() => setLogging(false)} />
    </Shell>
  );
}

type Data = NonNullable<ReturnType<typeof useProgressData>>;

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <main className="mt-2 flex flex-col gap-4 pb-4">
      <header className="flex h-11 items-center justify-between">
        <h1 className="display text-4xl font-extrabold">Progress</h1>
        <GymSwitcher />
      </header>
      {children}
    </main>
  );
}

function SectionTitle({ title, href, link }: { title: string; href?: string; link?: string }) {
  return (
    <div className="flex items-baseline justify-between px-1">
      <h2 className="display text-2xl font-extrabold">{title}</h2>
      {href && <Link href={href} className="display -my-2 flex h-11 items-center text-base font-extrabold tracking-[0.04em] text-accent">{link ?? "See all"}</Link>}
    </div>
  );
}

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="flex flex-col rounded-2xl bg-card p-3">
      <span className="display text-3xl leading-none font-extrabold">{value}</span>
      <span className="mt-1 text-xs font-bold tracking-[0.1em] text-muted">{label}</span>
      {sub && <span className="text-xs font-semibold text-muted">{sub}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ThisWeek({ data, goalDays, now }: { data: Data; goalDays: number; now: number }) {
  const startMs = weekStart(now).getTime();
  const stats = useMemo(() => {
    const start = new Date(startMs);
    const days = new Set<string>();
    for (const k of [...data.liftDays, ...data.cardioDays]) if (k >= dateKey(start)) days.add(k);
    const sets = data.muscleSets.filter((s) => s.type !== "warmup" && new Date(s.at) >= start).length;
    const cardioMin = data.cardio.filter((c) => new Date(c.at) >= start).reduce((a, c) => a + c.durationSec / 60, 0);
    return { days: days.size, sets, cardioMin: Math.round(cardioMin) };
  }, [data, startMs]);
  return (
    <section aria-label="This week" className="flex flex-col gap-2">
      <div className="flex justify-between px-1 text-xs font-bold tracking-[0.1em] text-muted">
        <span>THIS WEEK</span>
        <span>{stats.days >= goalDays ? "GOAL HIT ✓" : `${Math.max(0, goalDays - stats.days)} TO GO`}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={`${stats.days}/${goalDays}`} label="DAYS" />
        <Stat value={String(stats.sets)} label="HARD SETS" />
        <Stat value={String(stats.cardioMin)} label="CARDIO MIN" />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const WEEKS = 16;

function Consistency({ data, goalDays, now }: { data: Data; goalDays: number; now: number }) {
  const cal = useMemo(() => activityCalendar(data.liftDays, data.cardioDays, now, WEEKS), [data, now]);
  const perWeek = daysPerWeek(cal);
  const streak = weekStreak(perWeek, goalDays);
  const total = perWeek.reduce((a, b) => a + b, 0);
  const avg = total / WEEKS;
  const [showDays, setShowDays] = useState(false);
  const months = cal.map((w, i) => {
    const first = w.find((d) => d.date.getDate() === 1) ?? (i === 0 ? w[0] : null);
    return first ? first.date.toLocaleDateString([], { month: "short" }) : "";
  });

  return (
    <div role="button" tabIndex={0} aria-expanded={showDays} onClick={() => setShowDays((v) => !v)} className="cursor-pointer">
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="display text-2xl font-extrabold">Consistency</h2>
          <p className="text-sm font-medium text-muted">Last {WEEKS} weeks · {avg.toFixed(1)} days a week</p>
        </div>
        <div className="text-right">
          <div className="display text-3xl leading-none font-extrabold">{streak}</div>
          <div className="text-xs font-bold tracking-[0.1em] text-muted">{streak === 1 ? "WEEK" : "WEEKS"} AT {goalDays}+</div>
        </div>
      </div>
      <div className="flex gap-[3px]" role="img" aria-label={`Training calendar: ${total} days trained in the last ${WEEKS} weeks`}>
        <div className="flex flex-col gap-[3px] pt-4 pr-1">
          {["S", "M", "T", "W", "T", "F", "S"].map((l, i) => (
            <span key={i} className="flex aspect-square w-3 items-center text-[10px] font-bold text-muted">{i % 2 ? l : ""}</span>
          ))}
        </div>
        {cal.map((week, w) => (
          <div key={w} className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="h-3.5 overflow-visible text-[10px] font-bold whitespace-nowrap text-muted">{months[w]}</span>
            {week.map((d) => (
              <div
                key={d.key}
                aria-label={`${d.date.toLocaleDateString([], { month: "short", day: "numeric" })}: ${kindLabel(d)}`}
                className={`relative flex aspect-square w-full items-center justify-center rounded-[4px] ${
                  d.future ? "bg-transparent" : d.kind === "lift" || d.kind === "both" ? "bg-chart-1" : "bg-card-2"
                }`}
              >
                {(d.kind === "cardio" || d.kind === "both") && (
                  <span className={`h-[45%] w-[45%] rounded-full bg-chart-2 ${d.kind === "both" ? "ring-2 ring-card" : ""}`} />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      {showDays && (
        <ul className="divide-y divide-line">
          {cal.flat().filter((d) => !d.future && d.kind !== null).reverse().slice(0, 30).map((d) => (
            <li key={d.key} className="flex justify-between py-2 text-sm font-semibold">
              <span>{d.date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
              <span className="text-muted">{kindLabel(d)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-muted">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] bg-chart-1" />Lifting</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-2" />Cardio</span>
        </div>
        <span className="num">{showDays ? "Hide days" : `${total} days trained · tap for the list`}</span>
      </div>
    </Card>
    </div>
  );
}

const kindLabel = (d: CalendarDay) =>
  d.future ? "coming up" : d.kind === "both" ? "lifting + cardio" : d.kind === "lift" ? "lifting" : d.kind === "cardio" ? "cardio" : "rest";

// ---------------------------------------------------------------------------

export function prText(p: PREvent, units: Units) {
  const u = weightUnit(units);
  if (p.kind === "e1rm") return `Est. max ${formatMax(p.value, units)} ${u} (+${formatMax(Math.max(1, p.value - p.previous), units)})`;
  if (p.kind === "weight") return `Heaviest ${formatWeight(p.value, units)} ${u} × ${p.reps} (+${formatWeight(p.value - p.previous, units)})`;
  if (p.weight) return `${p.value} reps at ${formatWeight(p.weight, units)} ${u} (+${p.value - p.previous})`;
  return `${p.value} reps (+${p.value - p.previous})`;
}

function RecentPRs({ data, units, now }: { data: Data; units: Units; now: number }) {
  const prs = useMemo(() => prEvents(data.sessions).filter((p) => now - new Date(p.at).getTime() <= 30 * DAY), [data, now]);
  if (!prs.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Recent PRs" />
      <Card className="divide-y divide-line">
        {prs.slice(0, 5).map((p) => (
          <Link key={`${p.exerciseId}-${p.workoutId}-${p.kind}`} href={`/progress/lift?id=${encodeURIComponent(p.exerciseId)}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-card-2">
            <Trophy />
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-bold">{data.catalog.byId.get(p.exerciseId)?.name ?? p.exerciseId}</div>
              <div className="truncate text-sm font-medium text-muted">{prText(p, units)}</div>
            </div>
            <span className="shrink-0 text-xs font-bold text-muted">{shortDate(p.at)}</span>
          </Link>
        ))}
      </Card>
      {prs.length > 5 && <p className="px-1 text-sm font-medium text-muted">+{prs.length - 5} more this month</p>}
    </section>
  );
}

export function Trophy() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-accent" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
      </svg>
    </span>
  );
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

// ---------------------------------------------------------------------------

function Lifts({ data, units, now }: { data: Data; units: Units; now: number }) {
  const lifts = useMemo(() => topLifts(data.sessions, now, 6), [data, now]);
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Lifts" href="/progress/lift" link={`All ${data.sessions.size}`} />
      <Card className="divide-y divide-line">
        {lifts.map((l) => {
          const name = data.catalog.byId.get(l.exerciseId)?.name ?? l.exerciseId;
          const value = l.bodyweight ? `${l.current}` : formatMax(l.current, units);
          const unit = l.bodyweight ? "reps" : weightUnit(units);
          const change = l.change === null || Math.abs(l.change) < 0.5 ? null : l.bodyweight ? `${l.change > 0 ? "+" : ""}${l.change}` : `${l.change > 0 ? "+" : "−"}${formatMax(Math.abs(l.change), units)}`;
          return (
            <Link key={l.exerciseId} href={`/progress/lift?id=${encodeURIComponent(l.exerciseId)}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-card-2">
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-base leading-tight font-bold">{name}</div>
                <div className="truncate text-sm font-medium text-muted">
                  {l.bodyweight ? "Best" : "Max"} · {l.sessions} {l.sessions === 1 ? "session" : "sessions"}
                </div>
              </div>
              <Sparkline values={l.trend} />
              <div className="w-20 shrink-0 text-right">
                <div className="display text-2xl leading-none font-extrabold">
                  {value}<span className="ml-0.5 text-sm text-muted">{unit}</span>
                </div>
                <div className={`text-xs font-bold ${change && l.change! > 0 ? "text-good" : "text-muted"}`}>{change ?? "—"}</div>
              </div>
            </Link>
          );
        })}
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------

/** Muscles always listed (even at zero), so a gap in the week is visible. */
const MAIN_MUSCLES = new Set(["chest", "lats", "upper_back", "side_delts", "rear_delts", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "abs"]);

function MuscleVolume({ data, goal, now }: { data: Data; goal: Parameters<typeof weeklyTarget>[0]; now: number }) {
  const startMs = weekStart(now).getTime();
  // Early in the week there's often nothing yet: start on last week then.
  const thisWeekEmpty = useMemo(() => weeklySets(data.muscleSets, new Date(startMs)).size === 0, [data, startMs]);
  const [picked, setWhich] = useState<"this" | "last" | null>(null);
  const which = picked ?? (thisWeekEmpty ? "last" : "this");
  const counts = useMemo(
    () => weeklySets(data.muscleSets, which === "this" ? new Date(startMs) : weekStart(startMs - DAY)),
    [data, which, startMs],
  );
  const size = new Map(data.catalog.muscles.map((m) => [m.id, m.size_class]));
  const groups = MUSCLE_GROUPS.map((g) => ({
    label: g.label,
    rows: g.muscles.filter((m) => MAIN_MUSCLES.has(m) || (counts.get(m) ?? 0) > 0).map((m) => ({
      id: m, name: data.catalog.muscleName.get(m) ?? m, value: counts.get(m) ?? 0, range: weeklyTarget(goal, size.get(m) ?? "medium"),
    })),
  })).filter((g) => g.rows.length);
  const max = Math.max(24, ...[...counts.values()]);
  const dayOfWeek = new Date(now).getDay();

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Sets per muscle" />
      <Card className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <Chip active={which === "this"} onClick={() => setWhich("this")}>This week</Chip>
          <Chip active={which === "last"} onClick={() => setWhich("last")}>Last week</Chip>
        </div>
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-2">
            <span className="text-xs font-bold tracking-[0.1em] text-muted">{g.label.toUpperCase()}</span>
            {g.rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3">
                <span className="truncate text-sm font-semibold">{r.name}</span>
                <RangeBar value={r.value} range={r.range} max={max} />
                <span className={`num text-right text-sm font-extrabold ${r.value > r.range[1] * 1.25 ? "text-warn" : r.value ? "text-ink" : "text-muted"}`}>
                  {r.value > r.range[1] * 1.25 ? "⚠ " : ""}{Number.isInteger(r.value) ? r.value : r.value.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        ))}
        <p className="text-xs font-medium text-muted">
          Hard sets (warm-ups don&apos;t count); a muscle that only helps counts half. The faint band is a rough weekly target for your goal.
          {which === "this" && dayOfWeek < 6 ? " The week isn't over yet." : ""} Way over the band (⚠) can be more than you recover from.
        </p>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Cardio({ data, units, now }: { data: Data; units: Units; now: number }) {
  const weeks = useMemo(() => cardioWeeks(data.cardio, now, 8), [data, now]);
  const since = now - 28 * DAY;
  const types = useMemo(() => cardioByType(data.cardio, since), [data, since]);
  const month = types.reduce((a, t) => ({ min: a.min + t.minutes, dist: a.dist + t.distance, n: a.n + t.sessions }), { min: 0, dist: 0, n: 0 });
  const du = distanceUnit(units);
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Cardio" />
      <div className="grid grid-cols-3 gap-2">
        <Stat value={String(month.n)} label="SESSIONS" sub="last 4 weeks" />
        <Stat value={formatMinutes(month.min)} label="TIME" sub="last 4 weeks" />
        <Stat value={month.dist ? toDisplayDistance(month.dist, units).toFixed(1) : "—"} label={du.toUpperCase()} sub="last 4 weeks" />
      </div>
      <Card className="flex flex-col gap-2 p-4">
        <span className="text-xs font-bold tracking-[0.1em] text-muted">MINUTES PER WEEK</span>
        <ColumnChart
          ariaLabel="Cardio minutes per week, last 8 weeks"
          color="var(--chart-2)"
          columns={weeks.map((w, i) => ({
            key: dateKey(w.start), label: i === weeks.length - 1 ? "Now" : `${w.start.getMonth() + 1}/${w.start.getDate()}`,
            value: Math.round(w.minutes), display: `${Math.round(w.minutes)} min${w.sessions ? ` · ${w.sessions}×` : ""}`, current: i === weeks.length - 1,
          }))}
        />
        {types.length > 0 && (
          <ul className="flex flex-col divide-y divide-line">
            {types.map((t) => (
              <li key={t.type} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
                <span className="text-base font-semibold">{cardioLabel(t.type)}</span>
                <span className="num text-sm font-bold text-muted">
                  {t.sessions}× · {formatMinutes(t.minutes)}{t.distance ? ` · ${toDisplayDistance(t.distance, units).toFixed(1)} ${du}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

const formatMinutes = (min: number) => (min >= 90 ? `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}` : `${Math.round(min)}m`);

// ---------------------------------------------------------------------------

function Bodyweight({ data, units, now, onLog }: { data: Data; units: Units; now: number; onLog: () => void }) {
  const trend = useMemo(() => weightTrend(data.weights), [data]);
  const recent = trend.points.filter((p) => new Date(`${p.date}T12:00:00`).getTime() >= now - 120 * DAY);
  const u = weightUnit(units);
  const x = (d: string) => new Date(`${d}T12:00:00`).getTime();
  const fmt = (v: number) => `${toDisplayWeight(v, units).toFixed(1)} ${u}`;
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Bodyweight" href={trend.points.length ? "/progress/bodyweight" : undefined} link="All entries" />
      <Card className="flex flex-col gap-3 p-4">
        {trend.latest ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="display text-4xl leading-none font-extrabold">
                  {toDisplayWeight(trend.latest.bodyweight, units).toFixed(1)}<span className="ml-1 text-lg text-muted">{u}</span>
                </div>
                <div className="text-sm font-medium text-muted">{trend.latest.date === dateKey(new Date(now)) ? "Today" : shortDate(`${trend.latest.date}T12:00:00`)}</div>
              </div>
              {trend.change30 !== null && (
                <div className="text-right">
                  <div className="display text-2xl leading-none font-extrabold">
                    {trend.change30 > 0 ? "+" : trend.change30 < 0 ? "−" : ""}{Math.abs(toDisplayWeight(trend.change30, units)).toFixed(1)}
                  </div>
                  <div className="text-xs font-bold tracking-[0.1em] text-muted">30 DAYS</div>
                </div>
              )}
            </div>
            {recent.length > 1 && (
              <>
                <LineChart
                  ariaLabel="Bodyweight, daily and 7-day average"
                  height={180}
                  format={(v) => formatTick(toDisplayWeight(v, units))}
                  series={[
                    { name: "Daily", color: "var(--muted)", dots: "all", width: 0, muted: true, points: recent.map((p) => ({ x: x(p.date), y: p.value, label: fmt(p.value) })) },
                    { name: "7-day avg", color: "var(--chart-1)", dots: "end", points: recent.map((p) => ({ x: x(p.date), y: p.avg, label: fmt(p.avg) })) },
                  ]}
                />
                <div className="flex items-center gap-4 text-xs font-semibold text-muted">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted/60" />Daily</span>
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-chart-1" />7-day average</span>
                </div>
              </>
            )}
          </>
        ) : (
          <p className="text-base font-medium text-muted">Log your weight now and then (same time of day is best) and you&apos;ll see the trend here.</p>
        )}
        <button type="button" onClick={onLog} className={btn.secondary}>+ Log weight</button>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------

function RecentHistory() {
  const items = useHistory(5);
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="History" href="/progress/history" link="See all" />
      <HistoryList items={items?.slice(0, 3)} />
    </section>
  );
}
