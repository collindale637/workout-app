"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useData, useProfile, useRemove } from "@/lib/db/provider";
import { useCatalog, useOpenWorkout } from "@/lib/hooks";
import { deleteWorkout, useWorkoutActions } from "@/lib/workout";
import { cardioLabel, cardioSummary, isCardioExercise } from "@/lib/cardio";
import { distanceUnit, formatDuration, formatWeight, toDisplayDistance, toDisplayWeight, hasBodyweightSets, isPerHand, volumeBy, VOLUME_NOTE, weightUnit } from "@/lib/units";
import { filledSets } from "@/lib/set-slots";
import { shortDate, volumeDeltaText, type Comparison } from "@/lib/compare";
import { useWorkoutComparison } from "@/lib/compare-data";
import { useActivePlan } from "@/lib/smart";
import { NextUpRow } from "@/components/next-up-row";
import { NotDoneBlock, PrBadge } from "@/components/workout-summary";
import type { Units, WorkoutSet } from "@/lib/db/types";
import { Card, PageHeader, Sheet, btn } from "@/components/ui/kit";
import { isTimed } from "@/lib/generator";
import { EditSetForm } from "@/components/edit-set-form";

export function SessionDetail() {
  const params = useSearchParams();
  const id = params.get("id");
  const cardioId = params.get("cardio");
  const justDone = params.get("done") === "1";
  // ‹ goes back where you came from: Today (its done card, the cardio "saved" bar, or finishing a workout) or Progress.
  const back = justDone || params.get("from") === "today" ? "/" : "/progress";
  return id ? <WorkoutDetail id={id} justDone={justDone} back={back} /> : cardioId ? <CardioDetail id={cardioId} back={back} /> : null;
}

function WorkoutDetail({ id, justDone, back }: { id: string; justDone: boolean; back: string }) {
  const router = useRouter();
  const { db, requestSync } = useData();
  const { profile } = useProfile();
  const catalog = useCatalog();
  const open = useOpenWorkout();
  const active = useActivePlan();
  const units = profile?.units ?? "lb";
  const defaultRpe = profile?.default_rpe ?? 8;
  const data = useLiveQuery(async () => {
    const workout = await db.workouts.get(id);
    if (!workout) return null;
    const wexs = await db.workout_exercises.where("workout_id").equals(id).sortBy("sort_order");
    const sets = await db.sets.where("workout_exercise_id").anyOf(wexs.map((w) => w.id)).toArray();
    const cardio = await db.cardio_sessions.where("workout_id").equals(id).toArray();
    const gym = workout.gym_id ? await db.gyms.get(workout.gym_id) : undefined;
    return { workout, wexs, sets, cardio, gym };
  }, [db, id]);
  const compared = useWorkoutComparison(id);
  // Set detail: collapsed right after saving (the result card leads), open when you come from History.
  const [allOpen, setAllOpen] = useState<boolean | null>(null);
  const [editSet, setEditSet] = useState<WorkoutSet | null>(null);
  const actions = useWorkoutActions();

  if (data === undefined || !catalog || compared === undefined) return null;
  if (data === null) return <PageHeader title="Not found" back={back} />;
  const { workout, wexs, sets, cardio, gym } = data;
  const cmp = compared?.comparison ?? null;
  const note = compared?.note ?? null;
  const start = new Date(workout.started_at);
  const dur = workout.ended_at ? (new Date(workout.ended_at).getTime() - start.getTime()) / 1000 : 0;
  const volume = volumeBy(sets, wexs, (id) => isPerHand(catalog.byId.get(id)));
  const workingSets = sets.filter((s) => s.type !== "warmup").length;
  const unit = weightUnit(units);
  const shown = (lb: number) => Math.round(toDisplayWeight(lb, units));
  const nameOf = (exerciseId: string) => catalog.byId.get(exerciseId)?.name ?? exerciseId;
  const expanded = allOpen ?? !justDone;

  // Not done: missing sets on started lifts, plus lifts that were never started (saved on this phone at Finish).
  const notDone = [
    ...wexs.flatMap((w) => {
      if (isCardioExercise(catalog.byId.get(w.exercise_id))) return [];
      const list = sets.filter((s) => s.workout_exercise_id === w.id);
      const target = w.target_sets ?? 3;
      const missing = target - filledSets(list, target, []);
      if (missing <= 0) return [];
      const skipped = (w.skipped_sets ?? []).filter((n) => n >= 1 && n <= target);
      const right = missing === 1 && skipped.length === 1 ? `Set ${skipped[0]} skipped` : `${missing} ${missing === 1 ? "set" : "sets"} skipped`;
      return [{ key: w.id, name: nameOf(w.exercise_id), right }];
    }),
    ...(note?.notStarted ?? []).map((n, i) => ({ key: `ns-${i}`, name: catalog.byId.get(n.exercise_id)?.name ?? n.name, right: "not started" })),
  ];

  const tiles: [string, string][] = [
    [formatDuration(dur), "TIME"],
    [String(workingSets), "SETS"],
    [shown(volume).toLocaleString(), `${unit.toUpperCase()} MOVED`],
  ];

  return (
    <main className={`flex flex-col gap-4 ${justDone ? "pb-24" : ""}`}>
      <PageHeader
        title={workout.name ?? "Workout"}
        back={back}
        right={
          justDone ? (
            <span className="display flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-good/15 px-3 text-sm font-extrabold text-good">✓ Saved</span>
          ) : undefined
        }
      />
      <p className="-mt-2 text-sm font-semibold text-muted">
        {start.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })} · {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        {gym ? ` · ${gym.name}` : ""}
      </p>

      {cmp && <ResultCard cmp={cmp} workoutName={workout.name ?? "Workout"} units={units} nameOf={nameOf} />}

      {cmp?.totals.last ? (
        <TodayVsLast
          lastDate={shortDate(cmp.previous!.started_at)}
          rows={[
            { label: `${unit.toUpperCase()} MOVED`, today: shown(volume), last: shown(cmp.totals.last.volumeLb), fmt: (n) => n.toLocaleString() },
            { label: "SETS", today: workingSets, last: cmp.totals.last.sets, fmt: String },
            { label: "TIME", today: Math.round(dur), last: Math.round(cmp.totals.last.durationSec), fmt: formatDuration },
          ]}
        />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {tiles.map(([v, l]) => (
            <div key={l} className="rounded-2xl bg-card p-3 text-center">
              <div className="display num text-3xl font-extrabold">{v}</div>
              <div className="text-xs font-bold tracking-[0.1em] text-muted">{l}</div>
            </div>
          ))}
        </div>
      )}
      {hasBodyweightSets(sets) && <p className="-mt-2 text-xs font-semibold text-muted">{VOLUME_NOTE}</p>}

      {notDone.length > 0 && <NotDoneBlock label="NOT DONE" rows={notDone} />}

      {justDone && active && <NextUpRow href="/plan" />}

      {wexs.length > 0 && (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setAllOpen(!expanded)}
            className="flex min-h-11 items-center justify-between rounded-2xl bg-card-2 px-4 text-sm font-bold"
          >
            All {workingSets} {workingSets === 1 ? "set" : "sets"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={`text-muted ${expanded ? "rotate-180" : ""}`} aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {expanded &&
            wexs.map((w) => {
              const list = sets.filter((s) => s.workout_exercise_id === w.id).sort((a, b) => a.set_no - b.set_no);
              const linked = cardio.find((c) => c.workout_exercise_id === w.id);
              return (
                <Card key={w.id} className="p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/more/library/exercise?id=${encodeURIComponent(w.exercise_id)}`} className="text-lg font-bold">{nameOf(w.exercise_id)}</Link>
                    {w.superset_group !== null && <span className="display text-xs font-extrabold tracking-[0.08em] text-accent">SUPERSET {String.fromCharCode(64 + w.superset_group)}</span>}
                  </div>
                  {w.notes && <p className="mt-1 text-sm font-medium text-muted">📝 {w.notes}</p>}
                  {linked && (
                    <Link href={`/progress/session?cardio=${linked.id}`} className="mt-2 flex items-center justify-between gap-3 text-base">
                      <span className="num font-bold">{cardioSummary(linked, units)}</span>
                      <span className="num text-accent">{[linked.avg_hr ? `${linked.avg_hr} bpm` : null, linked.rpe ? `RPE ${linked.rpe}` : null].filter(Boolean).join(" · ")}</span>
                    </Link>
                  )}
                  <ol className="mt-2 flex flex-col gap-1">
                    {list.map((s) => (
                      <li key={s.id}>
                        <button type="button" onClick={() => setEditSet(s)} aria-label={`Edit set ${s.set_no}`} className="num flex min-h-11 w-full items-center gap-3 text-left text-base active:bg-card-2">
                          <span className="w-8 text-sm font-bold text-muted">{s.type === "warmup" ? "W" : s.type === "drop" ? "D" : s.set_no}</span>
                          <span className="font-bold">{formatWeight(s.weight, units)}{s.weight !== null ? ` ${unit}` : ""} × {s.reps ?? "—"}</span>
                          <span className={`flex-1 ${s.rpe === null ? "text-muted" : "text-accent"}`}>RPE {s.rpe ?? `${defaultRpe} (default)`}</span>
                          <span aria-hidden="true" className="text-lg text-muted">›</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </Card>
              );
            })}
        </section>
      )}
      {cardio.filter((c) => !c.workout_exercise_id).map((c) => (
        <Link key={c.id} href={`/progress/session?cardio=${c.id}`} className="rounded-3xl border border-line bg-card p-4">
          <div className="text-lg font-bold">{cardioLabel(c.type)}</div>
          <div className="text-sm font-medium text-muted">{cardioSummary(c, units)}</div>
        </Link>
      ))}

      {workout.notes && <p className="rounded-2xl bg-card-2 px-4 py-3 text-base font-medium">📝 {workout.notes}</p>}

      {!justDone && (
        <button
          type="button"
          className={btn.primary}
          disabled={Boolean(open)}
          onClick={() => router.push(`/workout?repeat=${workout.id}`)}
        >
          {open ? "Finish your current workout first" : "Do this workout again"}
        </button>
      )}
      <button
        type="button"
        className={justDone ? `${btn.ghost} text-danger` : btn.danger}
        onClick={async () => {
          if (!confirm("Delete this workout from your history?")) return;
          await deleteWorkout(db, workout.id);
          requestSync(0);
          router.replace(back);
        }}
      >
        Delete workout
      </button>

      <Sheet open={editSet !== null} onClose={() => setEditSet(null)} title={editSet ? `Edit set ${editSet.set_no}` : undefined}>
        {editSet && (
          <EditSetForm
            set={editSet}
            units={units}
            timed={(() => {
              const w = wexs.find((x) => x.id === editSet.workout_exercise_id);
              return w ? isTimed(catalog.byId.get(w.exercise_id)?.name ?? "", w.notes) : false;
            })()}
            defaultRpe={defaultRpe}
            onSave={async (changes) => {
              await actions.updateSet(editSet.id, changes);
              setEditSet(null);
            }}
            onDelete={async () => {
              if (!confirm("Delete this set?")) return;
              await actions.deleteSet(editSet);
              setEditSet(null);
            }}
          />
        )}
      </Sheet>

      {justDone && (
        // Over the tab bar (z-20): no tab bar on the just-saved screen.
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t border-line bg-bg px-5 pt-3.5">
          <Link href="/" className={`${btn.primary} w-full`}>Done</Link>
        </div>
      )}
    </main>
  );
}

/** The blue "lifts in the card" result: each lift's change vs last time, records, and like-for-like volume. */
function ResultCard({ cmp, workoutName, units, nameOf }: { cmp: Comparison; workoutName: string; units: Units; nameOf: (id: string) => string }) {
  if (!cmp.rows.length) return null; // cardio only
  const first = cmp.compared === 0;
  const n = cmp.compared;
  const r = cmp.records.length;
  const label = first
    ? `FIRST ${workoutName.toUpperCase()} · BASELINE SET`
    : cmp.previous
      ? `VS LAST ${(cmp.previous.name ?? workoutName).toUpperCase()} · ${shortDate(cmp.previous.started_at).toUpperCase()}`
      : "VS LAST TIME";
  const headline = first
    ? null
    : cmp.up > 0
      ? `Up on ${cmp.up} of ${n}`
      : cmp.same > 0
        ? `Held ${cmp.same} of ${n}`
        : `Down on ${cmp.down} of ${n}`;
  const color = (k: string) => (k === "up" ? "text-[#C9F7DA]" : k === "down" || k === "skipped" ? "text-[#FFD2B3]" : "text-[#DCE4FF]");
  const footer = first ? "Next time this card shows what went up." : (() => {
    const v = volumeDeltaText(cmp.sameLiftsDelta, units);
    return v ? `Same ${n} ${n === 1 ? "lift" : "lifts"}: ${v}` : null;
  })();
  return (
    <section className="flex flex-col gap-2.5 rounded-[28px] bg-primary p-5 text-white">
      <span className="text-xs font-bold tracking-[0.12em] text-[#DCE4FF]">{label}</span>
      {headline && (
        <h2 className="display -mt-1 text-[28px] leading-none font-extrabold">
          {headline}
          {cmp.up > 0 && r > 0 && <span className="text-gold-bright"> · {r} {r === 1 ? "record" : "records"}</span>}
        </h2>
      )}
      <ul className="flex flex-col divide-y divide-white/20">
        {cmp.rows.map((row) => (
          <li key={row.wexId} className="flex min-h-11 items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{nameOf(row.exerciseId)}</span>
            {row.record && <PrBadge />}
            <span className={`display num shrink-0 text-base font-extrabold ${first ? "text-[#DCE4FF]" : color(row.kind)}`}>{first ? row.best : row.delta}</span>
          </li>
        ))}
      </ul>
      {footer && <p className="text-sm font-semibold text-[#DCE4FF]">{footer}</p>}
    </section>
  );
}

/** Today vs the previous workout: three bars (volume, sets, time). */
function TodayVsLast({ lastDate, rows }: { lastDate: string; rows: { label: string; today: number; last: number; fmt: (n: number) => string }[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4">
      <div className="flex justify-between text-xs font-bold tracking-[0.12em] text-muted">
        <span>TODAY</span>
        <span>{lastDate.toUpperCase()}</span>
      </div>
      {rows.map((r) => {
        const pct = r.last > 0 ? Math.min(100, (r.today / r.last) * 100) : 100;
        return (
          <div key={r.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-baseline gap-2">
                <span className="display num text-2xl leading-none font-extrabold">{r.fmt(r.today)}</span>
                <span className="text-xs font-bold tracking-[0.1em] text-muted">{r.label}</span>
              </span>
              <span className="display num text-base font-extrabold text-muted">{r.fmt(r.last)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <div className={`h-full rounded-full ${r.today >= r.last ? "bg-good" : "bg-accent-strong"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

function CardioDetail({ id, back }: { id: string; back: string }) {
  const router = useRouter();
  const { db } = useData();
  const remove = useRemove();
  const { profile } = useProfile();
  const units = profile?.units ?? "lb";
  const c = useLiveQuery(async () => (await db.cardio_sessions.get(id)) ?? null, [db, id]);
  if (c === undefined) return null;
  if (c === null) return <PageHeader title="Not found" back={back} />;
  const when = new Date(c.started_at);
  const pace = c.distance ? c.duration_sec / toDisplayDistance(c.distance, units) : null;
  const rows: [string, string][] = [
    ["Time", formatDuration(c.duration_sec)],
    ...(c.distance ? [["Distance", `${toDisplayDistance(c.distance, units)} ${distanceUnit(units)}`] as [string, string]] : []),
    ...(pace ? [["Pace", `${formatDuration(pace)} / ${distanceUnit(units)}`] as [string, string]] : []),
    ...(c.incline ? [["Incline", `${c.incline}%`] as [string, string]] : []),
    ...(c.avg_hr ? [["Avg heart rate", `${c.avg_hr} bpm`] as [string, string]] : []),
    ...(c.rpe ? [["Effort", `RPE ${c.rpe}`] as [string, string]] : []),
  ];
  return (
    <main className="flex flex-col gap-4">
      <PageHeader title={cardioLabel(c.type)} back={back} />
      <p className="-mt-2 text-sm font-semibold text-muted">{when.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })} · {when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
      <Card className="divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-h-13 items-center justify-between px-4">
            <span className="text-base font-semibold text-muted">{k}</span>
            <span className="display num text-xl font-extrabold">{v}</span>
          </div>
        ))}
      </Card>
      {c.notes && <p className="rounded-2xl bg-card-2 px-4 py-3 text-base font-medium">📝 {c.notes}</p>}
      <Link href={`/cardio?id=${c.id}`} className={btn.secondary}>Edit</Link>
      <button
        type="button"
        className={btn.danger}
        onClick={async () => {
          if (!confirm("Delete this cardio session?")) return;
          await remove("cardio_sessions", c.id);
          router.replace(back);
        }}
      >
        Delete
      </button>
    </main>
  );
}
