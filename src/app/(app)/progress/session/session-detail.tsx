"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useData, useProfile, useRemove } from "@/lib/db/provider";
import { useCatalog, useOpenWorkout } from "@/lib/hooks";
import { deleteWorkout } from "@/lib/workout";
import { cardioLabel } from "@/lib/cardio";
import { distanceUnit, formatDuration, formatWeight, toDisplayDistance, volumeLb, weightUnit } from "@/lib/units";
import { Card, PageHeader, btn } from "@/components/ui/kit";

export function SessionDetail() {
  const params = useSearchParams();
  const id = params.get("id");
  const cardioId = params.get("cardio");
  const justDone = params.get("done") === "1";
  return id ? <WorkoutDetail id={id} justDone={justDone} /> : cardioId ? <CardioDetail id={cardioId} /> : null;
}

function WorkoutDetail({ id, justDone }: { id: string; justDone: boolean }) {
  const router = useRouter();
  const { db, requestSync } = useData();
  const { profile } = useProfile();
  const catalog = useCatalog();
  const open = useOpenWorkout();
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

  if (data === undefined || !catalog) return null;
  if (data === null) return <PageHeader title="Not found" back="/progress" />;
  const { workout, wexs, sets, cardio, gym } = data;
  const start = new Date(workout.started_at);
  const dur = workout.ended_at ? (new Date(workout.ended_at).getTime() - start.getTime()) / 1000 : 0;
  const volume = volumeLb(sets);

  return (
    <main className="flex flex-col gap-4">
      <PageHeader title={workout.name ?? "Workout"} back="/progress" />
      {justDone && <p className="rounded-2xl bg-primary px-4 py-3 text-base font-bold text-white">Saved. Nice work! 💪</p>}
      <p className="-mt-2 text-sm font-semibold text-muted">
        {start.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })} · {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        {gym ? ` · ${gym.name}` : ""}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {[[formatDuration(dur), "TIME"], [String(sets.filter((s) => s.type !== "warmup").length), "SETS"], [Math.round(units === "kg" ? volume / 2.2046 : volume).toLocaleString(), `${weightUnit(units).toUpperCase()} MOVED`]].map(([v, l]) => (
          <div key={l} className="rounded-2xl bg-card p-3 text-center">
            <div className="display num text-3xl font-extrabold">{v}</div>
            <div className="text-xs font-bold tracking-[0.1em] text-muted">{l}</div>
          </div>
        ))}
      </div>
      {workout.notes && <p className="rounded-2xl bg-card-2 px-4 py-3 text-base font-medium">📝 {workout.notes}</p>}
      {wexs.map((w) => {
        const list = sets.filter((s) => s.workout_exercise_id === w.id).sort((a, b) => a.set_no - b.set_no);
        return (
          <Card key={w.id} className="p-4">
            <div className="flex items-baseline justify-between gap-2">
              <Link href={`/more/library/exercise?id=${encodeURIComponent(w.exercise_id)}`} className="text-lg font-bold">{catalog.byId.get(w.exercise_id)?.name ?? w.exercise_id}</Link>
              {w.superset_group !== null && <span className="display text-xs font-extrabold tracking-[0.08em] text-accent">SUPERSET {String.fromCharCode(64 + w.superset_group)}</span>}
            </div>
            {w.notes && <p className="mt-1 text-sm font-medium text-muted">📝 {w.notes}</p>}
            <ol className="mt-2 flex flex-col gap-1">
              {list.map((s) => (
                <li key={s.id} className="num flex items-center gap-3 text-base">
                  <span className="w-8 text-sm font-bold text-muted">{s.type === "warmup" ? "W" : s.type === "drop" ? "D" : s.set_no}</span>
                  <span className="font-bold">{formatWeight(s.weight, units)}{s.weight !== null ? ` ${weightUnit(units)}` : ""} × {s.reps ?? "—"}</span>
                  <span className={s.rpe === null ? "text-muted" : "text-accent"}>RPE {s.rpe ?? `${defaultRpe} (default)`}</span>
                </li>
              ))}
            </ol>
          </Card>
        );
      })}
      {cardio.map((c) => (
        <Link key={c.id} href={`/progress/session?cardio=${c.id}`} className="rounded-3xl border border-line bg-card p-4">
          <div className="text-lg font-bold">{cardioLabel(c.type)}</div>
          <div className="text-sm font-medium text-muted">{formatDuration(c.duration_sec)}{c.distance ? ` · ${toDisplayDistance(c.distance, units)} ${distanceUnit(units)}` : ""}</div>
        </Link>
      ))}
      <button
        type="button"
        className={btn.primary}
        disabled={Boolean(open)}
        onClick={() => router.push(`/workout?repeat=${workout.id}`)}
      >
        {open ? "Finish your current workout first" : "Do this workout again"}
      </button>
      <button
        type="button"
        className={btn.danger}
        onClick={async () => {
          if (!confirm("Delete this workout from your history?")) return;
          await deleteWorkout(db, workout.id);
          requestSync(0);
          router.replace("/progress");
        }}
      >
        Delete workout
      </button>
    </main>
  );
}

function CardioDetail({ id }: { id: string }) {
  const router = useRouter();
  const { db } = useData();
  const remove = useRemove();
  const { profile } = useProfile();
  const units = profile?.units ?? "lb";
  const c = useLiveQuery(async () => (await db.cardio_sessions.get(id)) ?? null, [db, id]);
  if (c === undefined) return null;
  if (c === null) return <PageHeader title="Not found" back="/progress" />;
  const when = new Date(c.started_at);
  const pace = c.distance ? c.duration_sec / toDisplayDistance(c.distance, units) : null;
  const rows: [string, string][] = [
    ["Time", formatDuration(c.duration_sec)],
    ...(c.distance ? [["Distance", `${toDisplayDistance(c.distance, units)} ${distanceUnit(units)}`] as [string, string]] : []),
    ...(pace ? [["Pace", `${formatDuration(pace)} / ${distanceUnit(units)}`] as [string, string]] : []),
    ...(c.avg_hr ? [["Avg heart rate", `${c.avg_hr} bpm`] as [string, string]] : []),
    ...(c.rpe ? [["Effort", `RPE ${c.rpe}`] as [string, string]] : []),
  ];
  return (
    <main className="flex flex-col gap-4">
      <PageHeader title={cardioLabel(c.type)} back="/progress" />
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
          router.replace("/progress");
        }}
      >
        Delete
      </button>
    </main>
  );
}
