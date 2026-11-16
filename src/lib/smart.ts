"use client";

import { useCallback, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData, useProfile } from "@/lib/db/provider";
import { markDirty } from "@/lib/db/sync";
import { useActiveGym, useCatalog, type Catalog } from "@/lib/hooks";
import { useNow } from "@/lib/use-now";
import { useFatigueAdjustments } from "@/lib/fatigue-adjust";
import { computeRecovery, WINDOW_DAYS, type FatigueSet, type MuscleRecovery } from "@/lib/recovery";
import { loadFor, suggestNext, type Suggestion } from "@/lib/progression";
import { estimateStartingWeight, type StartingProfile } from "@/lib/starting-weights";
import type { ExercisePref, GymEquipment, Plan, PlanDay, PlanExercise, WorkoutSet } from "@/lib/db/types";

/** Favorites and exclusions, keyed by exercise. */
export function usePrefs() {
  const { db, requestSync } = useData();
  const rows = useLiveQuery(() => db.exercise_prefs.toArray(), [db]);
  const prefs = useMemo(() => new Map((rows ?? []).map((r) => [r.exercise_id, r])), [rows]);
  const setPref = useCallback(
    async (exerciseId: string, changes: Partial<Omit<ExercisePref, "exercise_id">>) => {
      const cur = (await db.exercise_prefs.get(exerciseId)) ?? { exercise_id: exerciseId, favorite: false, excluded: false };
      const next = { ...cur, ...changes };
      // Favorite and never-suggest can't both be on.
      if (changes.favorite) next.excluded = false;
      if (changes.excluded) next.favorite = false;
      await db.exercise_prefs.put(next);
      await markDirty(db, "exercise_prefs", exerciseId);
      requestSync();
    },
    [db, requestSync],
  );
  return { prefs, setPref, loaded: rows !== undefined };
}

export type RecoverySet = FatigueSet & { weight: number | null; reps: number | null; workoutId: string };

/** Per-muscle recovery from the last 7 days of sets and cardio. Updates as you log and as time passes. */
export function useRecovery() {
  const { db } = useData();
  const { profile } = useProfile();
  const catalog = useCatalog();
  const { adjustments } = useFatigueAdjustments();
  // Re-read once a minute: recovery changes with the clock, not just with new sets.
  const minute = Math.floor(useNow(60_000) / 60_000);
  const raw = useLiveQuery(async () => {
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
    const sets = await db.sets.where("completed_at").above(since).toArray();
    const wexs = await db.workout_exercises.bulkGet([...new Set(sets.map((s) => s.workout_exercise_id))]);
    const cardio = await db.cardio_sessions.where("started_at").above(since).toArray();
    return { sets, wexs, cardio };
  }, [db, minute]);

  return useMemo(() => {
    if (!raw || !catalog || !profile || !adjustments) return undefined;
    const wexById = new Map(raw.wexs.filter(Boolean).map((w) => [w!.id, w!]));
    const sets: RecoverySet[] = [];
    for (const s of raw.sets) {
      const w = wexById.get(s.workout_exercise_id);
      if (!w) continue;
      sets.push({
        id: s.id, exerciseId: w.exercise_id, at: s.completed_at, type: s.type, rpe: s.rpe, weight: s.weight, reps: s.reps, workoutId: w.workout_id,
        muscles: (catalog.musclesOf.get(w.exercise_id) ?? []).map((m) => ({ muscle_id: m.muscle_id, role: m.role })),
      });
    }
    const cardio = raw.cardio.map((c) => ({ id: c.id, at: c.started_at, type: c.type, durationSec: c.duration_sec, rpe: c.rpe }));
    const map = computeRecovery({ muscles: catalog.muscles, sets, cardio, now: minute * 60_000, defaultRpe: profile.default_rpe, adjustments });
    return { map, sets, cardio: raw.cardio };
  }, [raw, catalog, profile, minute, adjustments]);
}

export const recoveryScores = (map: Map<string, MuscleRecovery> | undefined) =>
  new Map([...(map ?? new Map<string, MuscleRecovery>()).values()].map((r) => [r.muscleId, r.score]));

/** When each exercise was last done (finished workouts), for variety. */
export function useLastDone() {
  const { db } = useData();
  return useLiveQuery(async () => {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const workouts = (await db.workouts.where("started_at").above(since).toArray()).filter((w) => w.ended_at);
    const wexs = await db.workout_exercises.where("workout_id").anyOf(workouts.map((w) => w.id)).toArray();
    const at = new Map(workouts.map((w) => [w.id, new Date(w.started_at).getTime()]));
    const out = new Map<string, number>();
    for (const w of wexs) out.set(w.exercise_id, Math.max(out.get(w.exercise_id) ?? 0, at.get(w.workout_id) ?? 0));
    return out;
  }, [db]);
}

export type ActivePlan = {
  plan: Plan;
  days: PlanDay[];
  exercises: Map<string, PlanExercise[]>;
  /** The day to train next: the one after the last plan day you finished. */
  nextDay: PlanDay | null;
  /** 1-based week number since the plan started. */
  week: number;
};

export function usePlans() {
  const { db } = useData();
  return useLiveQuery(async () => (await db.plans.toArray()).sort((a, b) => b.created_at.localeCompare(a.created_at)), [db]);
}

export function usePlan(planId: string | null | undefined) {
  const { db } = useData();
  return useLiveQuery(async (): Promise<ActivePlan | null> => {
    const plan = planId ? await db.plans.get(planId) : (await db.plans.toArray()).find((p) => p.is_active);
    if (!plan) return null;
    const days = (await db.plan_days.where("plan_id").equals(plan.id).toArray()).sort((a, b) => a.day_order - b.day_order);
    const exs = await db.plan_exercises.where("plan_day_id").anyOf(days.map((d) => d.id)).toArray();
    const exercises = new Map<string, PlanExercise[]>();
    for (const d of days) exercises.set(d.id, exs.filter((e) => e.plan_day_id === d.id).sort((a, b) => a.sort_order - b.sort_order));
    // Next day: after the most recent finished workout that came from this plan.
    const dayIds = new Set(days.map((d) => d.id));
    const done = (await db.workouts.filter((w) => Boolean(w.ended_at && w.plan_day_id && dayIds.has(w.plan_day_id))).toArray())
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
    const lastDay = done[0] ? days.find((d) => d.id === done[0].plan_day_id) : null;
    const nextDay = days.length ? (lastDay ? days[(days.indexOf(lastDay) + 1) % days.length] : days[0]) : null;
    const start = plan.start_date ? new Date(`${plan.start_date}T00:00:00`).getTime() : new Date(plan.created_at).getTime();
    const week = Math.max(1, Math.floor((Date.now() - start) / (7 * 86_400_000)) + 1);
    return { plan, days, exercises, nextDay, week };
  }, [db, planId]);
}

export const useActivePlan = () => usePlan(undefined);

/** Last time's sets for these exercises (finished workouts only), for weight suggestions. */
export function useLastSets(exerciseIds: string[]) {
  const { db } = useData();
  const key = [...new Set(exerciseIds)].sort().join(",");
  return useLiveQuery(async () => {
    const out = new Map<string, WorkoutSet[]>();
    const ids = key ? key.split(",") : [];
    if (!ids.length) return out;
    const wexs = await db.workout_exercises.where("exercise_id").anyOf(ids).toArray();
    const workouts = new Map((await db.workouts.bulkGet([...new Set(wexs.map((w) => w.workout_id))])).filter(Boolean).map((w) => [w!.id, w!]));
    const latest = new Map<string, { wexId: string; at: string }>();
    for (const w of wexs) {
      const wo = workouts.get(w.workout_id);
      if (!wo?.ended_at) continue;
      const cur = latest.get(w.exercise_id);
      if (!cur || wo.started_at > cur.at) latest.set(w.exercise_id, { wexId: w.id, at: wo.started_at });
    }
    const sets = await db.sets.where("workout_exercise_id").anyOf([...latest.values()].map((l) => l.wexId)).toArray();
    for (const [exId, l] of latest) out.set(exId, sets.filter((s) => s.workout_exercise_id === l.wexId).sort((a, b) => a.set_no - b.set_no));
    return out;
  }, [db, key]);
}

/** What the starting-weight estimates are based on: latest logged bodyweight, height, sex and experience. Null until there's a weight. */
export function useStartingProfile(): StartingProfile | null {
  const { db } = useData();
  const { profile } = useProfile();
  const latestLb = useLiveQuery(async () => {
    const rows = (await db.body_metrics.toArray()).filter((r) => r.bodyweight !== null && Number(r.bodyweight) > 0);
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const last = rows[rows.length - 1];
    return last ? Number(last.bodyweight) : null;
  }, [db]);
  return useMemo(
    () => (profile && latestLb ? { bodyweightLb: latestLb, heightIn: profile.height_in ?? null, sex: profile.sex ?? null, experience: profile.experience } : null),
    [profile, latestLb],
  );
}

/** A starting weight (lb) for a lift with no history, or null when there's no sensible guess. */
export function startingWeightFor(
  catalog: Catalog,
  exerciseId: string,
  who: StartingProfile | null,
  repMin: number | null,
  repMax: number | null,
  gymRows: Pick<GymEquipment, "equipment_id" | "details">[] | null,
): number | null {
  const ex = catalog.byId.get(exerciseId);
  if (!ex || !who) return null;
  const primaryMuscles = (catalog.musclesOf.get(exerciseId) ?? []).filter((m) => m.role === "primary").map((m) => m.muscle_id);
  return estimateStartingWeight({ name: ex.name, pattern: ex.movement_pattern, primaryMuscles, needs: catalog.needs.get(exerciseId) ?? [], gymRows, repMin, repMax, who });
}

/** Next session's weight and reps for an exercise, from last time and this gym's equipment (or a starting-weight estimate for a new lift). */
export function suggestionFor(
  catalog: Catalog,
  exerciseId: string,
  last: WorkoutSet[] | undefined,
  repMin: number | null,
  repMax: number | null,
  gymRows: Pick<GymEquipment, "equipment_id" | "details">[] | null,
  who: StartingProfile | null = null,
): Suggestion {
  const hasHistory = (last ?? []).some((s) => s.type === "working" && (s.reps ?? 0) > 0);
  const estimate = hasHistory ? null : startingWeightFor(catalog, exerciseId, who, repMin, repMax, gymRows);
  return suggestNext(last ?? [], repMin, repMax, loadFor(catalog.needs.get(exerciseId) ?? [], gymRows), estimate);
}

/** Everything the generator needs from the phone, in one place. */
export function useGeneratorInputs() {
  const catalog = useCatalog();
  const { profile } = useProfile();
  const { gym, equipment, equipmentRows, loaded } = useActiveGym();
  const { prefs, loaded: prefsLoaded } = usePrefs();
  const recovery = useRecovery();
  const lastDone = useLastDone();
  const ready = Boolean(catalog && profile && loaded && prefsLoaded && recovery && lastDone);
  return useMemo(
    () => ({
      ready,
      catalog,
      profile,
      gym,
      gymEquipment: gym ? equipment : null,
      gymRows: gym ? equipmentRows : null,
      prefs,
      recovery,
      lastDone: lastDone ?? EMPTY,
    }),
    [ready, catalog, profile, gym, equipment, equipmentRows, prefs, recovery, lastDone],
  );
}

const EMPTY = new Map<string, number>();
