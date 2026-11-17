"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData, useProfile } from "@/lib/db/provider";
import { useCatalog } from "@/lib/hooks";
import { isCardioExercise } from "@/lib/cardio";
import { isPerHand } from "@/lib/units";
import { compareWorkout, findPrevious, historyBefore, FINISH_NOTES_KEY, type Comparison, type FinishNote, type FinishNotes } from "@/lib/compare";

/**
 * Loads one workout, its previous one and each lift's history before it, and runs compareWorkout.
 * Live data: the Finish sheet updates as sets are logged. Also returns the "not started" note saved at Finish.
 * undefined while loading, null when the workout doesn't exist.
 */
export function useWorkoutComparison(workoutId: string | null): { comparison: Comparison; note: FinishNote | null } | null | undefined {
  const { db } = useData();
  const catalog = useCatalog();
  const { profile } = useProfile();
  const raw = useLiveQuery(async () => {
    if (!workoutId) return null;
    const workout = await db.workouts.get(workoutId);
    if (!workout) return null;
    const wexs = await db.workout_exercises.where("workout_id").equals(workoutId).sortBy("sort_order");
    const sets = await db.sets.where("workout_exercise_id").anyOf(wexs.map((w) => w.id)).toArray();
    const workouts = await db.workouts.toArray();
    const prevW = findPrevious(workout, workouts);
    const prevWexs = prevW ? await db.workout_exercises.where("workout_id").equals(prevW.id).toArray() : [];
    const prevSets = prevW ? await db.sets.where("workout_exercise_id").anyOf(prevWexs.map((w) => w.id)).toArray() : [];
    const exIds = [...new Set(wexs.map((w) => w.exercise_id))];
    const hWexs = exIds.length ? await db.workout_exercises.where("exercise_id").anyOf(exIds).toArray() : [];
    const hSets = hWexs.length ? await db.sets.where("workout_exercise_id").anyOf(hWexs.map((w) => w.id)).toArray() : [];
    const notes = await db.getMeta<FinishNotes>(FINISH_NOTES_KEY);
    return { workout, wexs, sets, prev: prevW ? { workout: prevW, wexs: prevWexs, sets: prevSets } : null, workouts, hWexs, hSets, note: notes?.[workoutId] ?? null };
  }, [db, workoutId]);

  const units = profile?.units ?? "lb";
  return useMemo(() => {
    if (raw === undefined || !catalog) return undefined;
    if (raw === null) return null;
    const { workout } = raw;
    const durationSec = workout.ended_at ? (new Date(workout.ended_at).getTime() - new Date(workout.started_at).getTime()) / 1000 : 0;
    const comparison = compareWorkout({
      workout,
      wexs: raw.wexs,
      sets: raw.sets,
      previous: raw.prev,
      history: historyBefore(workout.started_at, raw.workouts, raw.hWexs, raw.hSets, workout.id),
      isBodyweight: (id) => (catalog.needs.get(id) ?? []).length === 0,
      isPerHand: (id) => isPerHand(catalog.byId.get(id)),
      isCardio: (id) => isCardioExercise(catalog.byId.get(id)),
      units,
      durationSec,
      names: (id) => catalog.byId.get(id)?.name ?? id,
    });
    return { comparison, note: raw.note };
  }, [raw, catalog, units]);
}
