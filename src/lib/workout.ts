"use client";

import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData, useProfile } from "@/lib/db/provider";
import { markDeleted, markDirty } from "@/lib/db/sync";
import { newId, nowIso, type LocalDB } from "@/lib/db/dexie";
import { defaultTargets } from "@/lib/defaults";
import { isCardioExercise } from "@/lib/cardio";
import { clearCardioTimer } from "@/lib/cardio-timer";
import { estimate1RM } from "@/lib/units";
import type { CardioSession, Exercise, SetType, Workout, WorkoutExercise, WorkoutSet } from "@/lib/db/types";

export type RestState = { endsAt: number; total: number; wexId: string } | null;

/** An exercise with its targets, from a plan day or the generator. */
export type PlannedItem = {
  exercise_id: string;
  sets: number;
  rep_min: number | null;
  rep_max: number | null;
  rest_sec: number | null;
  superset_group: number | null;
  notes: string | null;
};

/** Everything you do to a workout. Every change is saved on the phone first, then synced. */
export function useWorkoutActions() {
  const { db, requestSync } = useData();
  const { profile } = useProfile();
  const goal = profile?.goal ?? "hypertrophy";

  const touch = useCallback(
    async (table: "workouts" | "workout_exercises" | "sets" | "cardio_sessions", id: string) => {
      await markDirty(db, table, id);
      requestSync(4000);
    },
    [db, requestSync],
  );

  const newWex = useCallback(
    (workoutId: string, ex: Exercise | undefined, exerciseId: string, sortOrder: number, from?: Partial<WorkoutExercise>): WorkoutExercise => {
      // Cardio is Start / Done: no reps and no rest between sets. One "set" means it's done once its results are saved.
      if (isCardioExercise(ex)) {
        return {
          id: newId(), workout_id: workoutId, exercise_id: exerciseId, sort_order: sortOrder,
          superset_group: null, notes: null, target_sets: 1, rep_min: null, rep_max: null, rest_sec: null,
        };
      }
      const t = defaultTargets(goal, ex?.mechanic ?? null);
      return {
        id: newId(),
        workout_id: workoutId,
        exercise_id: exerciseId,
        sort_order: sortOrder,
        superset_group: from?.superset_group ?? null,
        notes: null,
        target_sets: from?.target_sets ?? t.sets,
        rep_min: from?.rep_min ?? t.repMin,
        rep_max: from?.rep_max ?? t.repMax,
        rest_sec: from?.rest_sec ?? t.rest,
      };
    },
    [goal],
  );

  /** Starts a workout with these exercises (or copies a past one). */
  const start = useCallback(
    async (opts: {
      exerciseIds?: string[];
      /** A planned or generated workout: exercises with their targets. */
      items?: PlannedItem[];
      name?: string | null;
      gymId: string | null;
      copyFrom?: string;
      planDayId?: string | null;
      source?: Workout["source"];
    }) => {
      const workout: Workout = {
        id: newId(), name: opts.name ?? null, gym_id: opts.gymId, plan_day_id: opts.planDayId ?? null,
        started_at: nowIso(), ended_at: null, notes: null, source: opts.source ?? "manual",
      };
      let rows: WorkoutExercise[] = [];
      if (opts.items) {
        const exs = await db.exercises.bulkGet(opts.items.map((i) => i.exercise_id));
        rows = opts.items.map((item, i) => ({
          ...newWex(workout.id, exs[i], item.exercise_id, i, {
            target_sets: item.sets, rep_min: item.rep_min, rep_max: item.rep_max, rest_sec: item.rest_sec, superset_group: item.superset_group,
          }),
          notes: item.notes,
        }));
      } else if (opts.copyFrom) {
        const src = await db.workout_exercises.where("workout_id").equals(opts.copyFrom).sortBy("sort_order");
        const exs = await db.exercises.bulkGet(src.map((s) => s.exercise_id));
        rows = src.map((s, i) => ({ ...newWex(workout.id, exs[i], s.exercise_id, i, s), notes: s.notes }));
        const old = await db.workouts.get(opts.copyFrom);
        workout.name = old?.name ?? null;
      } else {
        const exs = await db.exercises.bulkGet(opts.exerciseIds ?? []);
        rows = (opts.exerciseIds ?? []).map((id, i) => newWex(workout.id, exs[i], id, i));
      }
      await db.transaction("rw", [db.workouts, db.workout_exercises, db.outbox], async () => {
        await db.workouts.put(workout);
        await db.workout_exercises.bulkPut(rows);
        await markDirty(db, "workouts", workout.id);
        for (const r of rows) await markDirty(db, "workout_exercises", r.id);
      });
      requestSync();
      return workout;
    },
    [db, newWex, requestSync],
  );

  const addExercises = useCallback(
    async (workoutId: string, exerciseIds: string[], afterSortOrder?: number) => {
      const existing = await db.workout_exercises.where("workout_id").equals(workoutId).sortBy("sort_order");
      const exs = await db.exercises.bulkGet(exerciseIds);
      const insertAt = afterSortOrder === undefined ? existing.length : existing.findIndex((w) => w.sort_order === afterSortOrder) + 1;
      const added = exerciseIds.map((id, i) => newWex(workoutId, exs[i], id, 0));
      const all = [...existing.slice(0, insertAt), ...added, ...existing.slice(insertAt)];
      await db.transaction("rw", [db.workout_exercises, db.outbox], async () => {
        for (let i = 0; i < all.length; i++) {
          if (all[i].sort_order !== i || added.includes(all[i])) {
            all[i] = { ...all[i], sort_order: i };
            await db.workout_exercises.put(all[i]);
            await markDirty(db, "workout_exercises", all[i].id);
          }
        }
      });
      requestSync(4000);
      return added.map((a) => a.id);
    },
    [db, newWex, requestSync],
  );

  const updateWex = useCallback(
    async (id: string, changes: Partial<WorkoutExercise>) => {
      await db.workout_exercises.update(id, changes);
      await touch("workout_exercises", id);
    },
    [db, touch],
  );

  const removeWex = useCallback(
    async (id: string) => {
      const sets = await db.sets.where("workout_exercise_id").equals(id).toArray();
      const wex = await db.workout_exercises.get(id);
      const cardio = wex ? (await db.cardio_sessions.where("workout_id").equals(wex.workout_id).toArray()).filter((c) => c.workout_exercise_id === id) : [];
      await db.transaction("rw", [db.sets, db.workout_exercises, db.cardio_sessions, db.outbox, db.tombstones], async () => {
        for (const s of sets) {
          await db.sets.delete(s.id);
          await markDeleted(db, "sets", s.id);
        }
        for (const c of cardio) {
          await db.cardio_sessions.delete(c.id);
          await markDeleted(db, "cardio_sessions", c.id);
        }
        await db.workout_exercises.delete(id);
        await markDeleted(db, "workout_exercises", id);
      });
      await clearCardioTimer(db, { wexId: id });
      requestSync(4000);
    },
    [db, requestSync],
  );

  const move = useCallback(
    async (workoutId: string, id: string, dir: -1 | 1) => {
      const list = await db.workout_exercises.where("workout_id").equals(workoutId).sortBy("sort_order");
      const i = list.findIndex((w) => w.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      await db.transaction("rw", [db.workout_exercises, db.outbox], async () => {
        for (let k = 0; k < list.length; k++) {
          if (list[k].sort_order !== k) {
            await db.workout_exercises.update(list[k].id, { sort_order: k });
            await markDirty(db, "workout_exercises", list[k].id);
          }
        }
      });
      requestSync(4000);
    },
    [db, requestSync],
  );

  /** Links this exercise with the next one as a superset, or unlinks it. */
  const toggleSuperset = useCallback(
    async (workoutId: string, id: string) => {
      const list = await db.workout_exercises.where("workout_id").equals(workoutId).sortBy("sort_order");
      const i = list.findIndex((w) => w.id === id);
      const cur = list[i];
      const next = list[i + 1];
      if (cur.superset_group !== null) {
        // Unlink just this one.
        await updateWex(cur.id, { superset_group: null });
        const left = list.filter((w) => w.superset_group === cur.superset_group && w.id !== cur.id);
        if (left.length === 1) await updateWex(left[0].id, { superset_group: null });
        return;
      }
      if (!next) return;
      const group = next.superset_group ?? Math.max(0, ...list.map((w) => w.superset_group ?? 0)) + 1;
      await updateWex(cur.id, { superset_group: group });
      if (next.superset_group === null) await updateWex(next.id, { superset_group: group });
    },
    [db, updateWex],
  );

  const logSet = useCallback(
    async (wexId: string, values: { weight: number | null; reps: number | null; rpe: number | null; type: SetType }) => {
      const count = await db.sets.where("workout_exercise_id").equals(wexId).count();
      const set: WorkoutSet = { id: newId(), workout_exercise_id: wexId, set_no: count + 1, completed_at: nowIso(), ...values };
      await db.sets.put(set);
      await touch("sets", set.id);
      return set;
    },
    [db, touch],
  );

  const updateSet = useCallback(
    async (id: string, changes: Partial<WorkoutSet>) => {
      await db.sets.update(id, changes);
      await touch("sets", id);
    },
    [db, touch],
  );

  const deleteSet = useCallback(
    async (set: WorkoutSet) => {
      await db.sets.delete(set.id);
      await markDeleted(db, "sets", set.id);
      // Renumber the rest.
      const rest = await db.sets.where("workout_exercise_id").equals(set.workout_exercise_id).sortBy("set_no");
      for (let i = 0; i < rest.length; i++) if (rest[i].set_no !== i + 1) await updateSet(rest[i].id, { set_no: i + 1 });
      requestSync(4000);
    },
    [db, requestSync, updateSet],
  );

  /** Saves the results of a cardio exercise (or a standalone cardio session added to the workout). */
  const logCardio = useCallback(
    async (row: CardioSession) => {
      await db.cardio_sessions.put(row);
      await touch("cardio_sessions", row.id);
    },
    [db, touch],
  );

  const updateWorkout = useCallback(
    async (id: string, changes: Partial<Workout>) => {
      await db.workouts.update(id, changes);
      await touch("workouts", id);
    },
    [db, touch],
  );

  const finish = useCallback(
    async (id: string) => {
      // Drop exercises with no sets (or, for cardio, no results) so history stays clean.
      const wexs = await db.workout_exercises.where("workout_id").equals(id).toArray();
      const cardioDone = new Set((await db.cardio_sessions.where("workout_id").equals(id).toArray()).map((c) => c.workout_exercise_id));
      for (const w of wexs) {
        if (cardioDone.has(w.id)) continue;
        if ((await db.sets.where("workout_exercise_id").equals(w.id).count()) === 0) await removeWex(w.id);
      }
      await db.workouts.update(id, { ended_at: nowIso() });
      await markDirty(db, "workouts", id);
      await db.setMeta("rest", null);
      await clearCardioTimer(db, { workoutId: id }); // a timer left running for this workout is dropped
      requestSync(0);
    },
    [db, removeWex, requestSync],
  );

  const discard = useCallback(
    async (id: string) => {
      await deleteWorkout(db, id);
      await db.setMeta("rest", null);
      await clearCardioTimer(db, { workoutId: id });
      requestSync(0);
    },
    [db, requestSync],
  );

  return { start, addExercises, updateWex, removeWex, move, toggleSuperset, logSet, updateSet, deleteSet, logCardio, updateWorkout, finish, discard };
}

/** Deletes a workout with its exercises, sets and attached cardio. */
export async function deleteWorkout(db: LocalDB, id: string) {
  const wexs = await db.workout_exercises.where("workout_id").equals(id).toArray();
  const sets = await db.sets.where("workout_exercise_id").anyOf(wexs.map((w) => w.id)).toArray();
  const cardio = await db.cardio_sessions.where("workout_id").equals(id).toArray();
  await db.transaction("rw", [db.workouts, db.workout_exercises, db.sets, db.cardio_sessions, db.outbox, db.tombstones], async () => {
    for (const s of sets) {
      await db.sets.delete(s.id);
      await markDeleted(db, "sets", s.id);
    }
    for (const w of wexs) {
      await db.workout_exercises.delete(w.id);
      await markDeleted(db, "workout_exercises", w.id);
    }
    for (const c of cardio) {
      await db.cardio_sessions.delete(c.id);
      await markDeleted(db, "cardio_sessions", c.id);
    }
    await db.workouts.delete(id);
    await markDeleted(db, "workouts", id);
  });
}

export type ExerciseHistory = {
  /** Sets from the most recent finished workout that included this exercise. */
  last: WorkoutSet[];
  lastDate: string | null;
  /** Heaviest working-set weight ever (lb) and best estimated 1RM. */
  bestWeight: number;
  best1RM: number;
};

/** Past performance for these exercises, excluding the given workout. */
export function useExerciseHistory(exerciseIds: string[], excludeWorkoutId?: string) {
  const { db } = useData();
  const key = exerciseIds.join(",");
  return useLiveQuery(async () => {
    const out = new Map<string, ExerciseHistory>();
    if (!exerciseIds.length) return out;
    const wexs = (await db.workout_exercises.where("exercise_id").anyOf(exerciseIds).toArray()).filter((w) => w.workout_id !== excludeWorkoutId);
    const workouts = new Map((await db.workouts.bulkGet([...new Set(wexs.map((w) => w.workout_id))])).filter(Boolean).map((w) => [w!.id, w!]));
    const sets = await db.sets.where("workout_exercise_id").anyOf(wexs.map((w) => w.id)).toArray();
    const setsBy = new Map<string, WorkoutSet[]>();
    for (const s of sets) setsBy.set(s.workout_exercise_id, [...(setsBy.get(s.workout_exercise_id) ?? []), s]);
    for (const exId of exerciseIds) {
      const mine = wexs.filter((w) => w.exercise_id === exId && workouts.get(w.workout_id)?.ended_at);
      mine.sort((a, b) => (workouts.get(b.workout_id)!.started_at).localeCompare(workouts.get(a.workout_id)!.started_at));
      let bestWeight = 0;
      let best1RM = 0;
      for (const w of mine) {
        for (const s of setsBy.get(w.id) ?? []) {
          if (s.type === "warmup" || !s.weight || !s.reps) continue;
          bestWeight = Math.max(bestWeight, s.weight);
          best1RM = Math.max(best1RM, estimate1RM(s.weight, s.reps));
        }
      }
      const lastW = mine[0];
      out.set(exId, {
        last: lastW ? (setsBy.get(lastW.id) ?? []).sort((a, b) => a.set_no - b.set_no) : [],
        lastDate: lastW ? workouts.get(lastW.workout_id)!.started_at : null,
        bestWeight,
        best1RM,
      });
    }
    return out;
  }, [db, key, excludeWorkoutId]);
}
