"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData, useProfile } from "@/lib/db/provider";
import { useCatalog } from "@/lib/hooks";
import { isCardioExercise } from "@/lib/cardio";
import { todayIso } from "@/lib/plans";
import { useNow } from "@/lib/use-now";
import { dateKey } from "@/lib/progress";
import { useWorkoutComparison } from "@/lib/compare-data";
import { formatDuration, toDisplayWeight, volumeLb, weightUnit } from "@/lib/units";
import { NextUpRow } from "@/components/next-up-row";
import { btn } from "@/components/ui/kit";

/*
  Today after you've trained (UX spec Part 2.4): what you did, then what's next and when it's ready.
  "Train again today" brings the regular Up next card back below it for the rest of the day.
*/

const TRAIN_AGAIN = "trainAgain";

/** The latest lifting workout that ended today (local date), or null. Cardio-only workouts don't count. */
export function useDoneToday() {
  const { db } = useData();
  const catalog = useCatalog();
  // Re-checked each minute so the card goes away after midnight.
  useNow(60_000);
  const today = todayIso();
  return useLiveQuery(async () => {
    if (!catalog) return undefined;
    const ended = (await db.workouts.toArray())
      .filter((w) => w.ended_at && dateKey(new Date(w.ended_at)) === today)
      .sort((a, b) => b.ended_at!.localeCompare(a.ended_at!));
    for (const w of ended) {
      const wexs = await db.workout_exercises.where("workout_id").equals(w.id).toArray();
      const lifts = wexs.filter((x) => !isCardioExercise(catalog.byId.get(x.exercise_id)));
      if (lifts.length && (await db.sets.where("workout_exercise_id").anyOf(lifts.map((x) => x.id)).count()) > 0) return w;
    }
    return null;
  }, [db, catalog, today]);
}

/** "Train again today" (device meta, today's date). */
export function useTrainAgain() {
  const { db } = useData();
  const today = todayIso();
  const on = useLiveQuery(async () => (await db.getMeta<string>(TRAIN_AGAIN)) === today, [db, today]);
  const set = useCallback(() => db.setMeta(TRAIN_AGAIN, todayIso()), [db]);
  return { on: on ?? false, set };
}

export function DoneTodayCard({ workoutId, trainAgain, onTrainAgain }: { workoutId: string; trainAgain: boolean; onTrainAgain: () => void }) {
  const { db } = useData();
  const { profile } = useProfile();
  const units = profile?.units ?? "lb";
  const data = useLiveQuery(async () => {
    const workout = await db.workouts.get(workoutId);
    if (!workout) return null;
    const wexs = await db.workout_exercises.where("workout_id").equals(workoutId).toArray();
    const sets = await db.sets.where("workout_exercise_id").anyOf(wexs.map((w) => w.id)).toArray();
    return { workout, sets };
  }, [db, workoutId]);
  const compared = useWorkoutComparison(workoutId);
  if (!data) return null;

  const { workout, sets } = data;
  const dur = workout.ended_at ? (new Date(workout.ended_at).getTime() - new Date(workout.started_at).getTime()) / 1000 : 0;
  const records = compared?.comparison.records.length ?? 0;
  const notStarted = compared?.note?.notStarted.length ?? 0;
  const tiles: [string, string][] = [
    [formatDuration(dur), "TIME"],
    [String(sets.filter((s) => s.type !== "warmup").length), "SETS"],
    [Math.round(toDisplayWeight(volumeLb(sets), units)).toLocaleString(), `${weightUnit(units).toUpperCase()} MOVED`],
  ];

  return (
    <>
      <section className="flex flex-col gap-3 rounded-[28px] border-2 border-line bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="display flex items-center gap-2 text-sm font-extrabold text-good">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--done)] text-[var(--done-ink)]" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
            </span>
            Done for today
          </span>
          <Link href={`/progress/session?id=${workout.id}`} className="display flex min-h-11 items-center text-sm font-extrabold tracking-[0.06em] text-accent">
            View →
          </Link>
        </div>
        <h1 className="display -mt-1 text-[44px] leading-[0.85] font-extrabold break-words">{workout.name ?? "Workout"}</h1>
        <div className="grid grid-cols-3 gap-2">
          {tiles.map(([v, l]) => (
            <div key={l} className="rounded-2xl bg-card-2 p-2.5 text-center">
              <div className="display num text-[26px] leading-tight font-extrabold">{v}</div>
              <div className="text-xs font-bold tracking-[0.1em] text-muted">{l}</div>
            </div>
          ))}
        </div>
        {(records > 0 || notStarted > 0) && (
          <p className="text-sm font-semibold text-muted">
            {records > 0 && <span className="text-accent-soft">{records} {records === 1 ? "record" : "records"}</span>}
            {records > 0 && notStarted > 0 && " · "}
            {notStarted > 0 && `${notStarted} ${notStarted === 1 ? "exercise" : "exercises"} not started`}
          </p>
        )}
      </section>
      {!trainAgain && (
        <>
          <NextUpRow onClick={onTrainAgain} />
          <button type="button" className={btn.ghost} onClick={onTrainAgain}>
            Train again today
          </button>
        </>
      )}
    </>
  );
}
