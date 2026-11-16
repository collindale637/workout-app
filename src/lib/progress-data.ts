"use client";

import { useCallback, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData } from "@/lib/db/provider";
import { markDeleted, markDirty } from "@/lib/db/sync";
import { newId } from "@/lib/db/dexie";
import { useCatalog } from "@/lib/hooks";
import { dateKey, liftSessions, type CardioEntry, type LiftSet, type MuscleSet, type WeightEntry } from "@/lib/progress";
import type { BodyMetric } from "@/lib/db/types";

/** Everything the Progress tab charts, read from the phone. Finished workouts only. */
export function useProgressData() {
  const { db } = useData();
  const catalog = useCatalog();
  const raw = useLiveQuery(async () => {
    const [workouts, cardio, weights] = await Promise.all([
      db.workouts.toArray(),
      db.cardio_sessions.toArray(),
      db.body_metrics.toArray(),
    ]);
    const done = workouts.filter((w) => w.ended_at);
    const wexs = await db.workout_exercises.where("workout_id").anyOf(done.map((w) => w.id)).toArray();
    const sets = await db.sets.where("workout_exercise_id").anyOf(wexs.map((w) => w.id)).toArray();
    return { done, wexs, sets, cardio, weights, open: new Set(workouts.filter((w) => !w.ended_at).map((w) => w.id)) };
  }, [db]);

  return useMemo(() => {
    if (!raw || !catalog) return undefined;
    const workoutAt = new Map(raw.done.map((w) => [w.id, w.started_at]));
    const wexById = new Map(raw.wexs.map((w) => [w.id, w]));
    const liftSets: LiftSet[] = [];
    const muscleSets: MuscleSet[] = [];
    for (const s of raw.sets) {
      const w = wexById.get(s.workout_exercise_id);
      if (!w) continue;
      const ex = catalog.byId.get(w.exercise_id);
      if (ex?.category === "cardio") continue;
      const at = workoutAt.get(w.workout_id)!;
      liftSets.push({ workoutId: w.workout_id, exerciseId: w.exercise_id, at, type: s.type, weight: s.weight, reps: s.reps });
      muscleSets.push({ at: s.completed_at, type: s.type, muscles: (catalog.musclesOf.get(w.exercise_id) ?? []).map((m) => ({ muscle_id: m.muscle_id, role: m.role })) });
    }
    // Cardio from open (unfinished) workouts waits until the workout is finished, like the history list.
    const cardio: CardioEntry[] = raw.cardio
      .filter((c) => !c.workout_id || !raw.open.has(c.workout_id))
      .map((c) => ({ at: c.started_at, type: c.type, durationSec: c.duration_sec, distance: c.distance }));
    const withLifts = new Set(raw.wexs.filter((x) => catalog.byId.get(x.exercise_id)?.category !== "cardio").map((x) => x.workout_id));
    const liftDays = new Set(raw.done.filter((w) => withLifts.has(w.id)).map((w) => dateKey(new Date(w.started_at))));
    const cardioDays = new Set(cardio.map((c) => dateKey(new Date(c.at))));
    const weights: (WeightEntry & { id: string })[] = latestPerDay(raw.weights);
    return {
      catalog,
      sessions: liftSessions(liftSets),
      muscleSets,
      cardio,
      liftDays,
      cardioDays,
      weights,
      workouts: raw.done,
      sets: raw.sets.length,
    };
  }, [raw, catalog]);
}

/** Two phones can log the same day before syncing: keep the newest per day. */
function latestPerDay(rows: BodyMetric[]) {
  const by = new Map<string, BodyMetric>();
  for (const r of rows) {
    if (r.bodyweight === null) continue;
    const cur = by.get(r.date);
    if (!cur || (r.updated_at ?? "") >= (cur.updated_at ?? "")) by.set(r.date, r);
  }
  return [...by.values()].map((r) => ({ id: r.id, date: r.date, bodyweight: Number(r.bodyweight) })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Log, change or delete a bodyweight entry. One per day: logging again replaces that day's number. */
export function useBodyweightActions() {
  const { db, requestSync } = useData();
  const log = useCallback(
    async (date: string, lb: number) => {
      const existing = await db.body_metrics.where("date").equals(date).toArray();
      const keep = existing[0];
      const row: BodyMetric = { id: keep?.id ?? newId(), date, bodyweight: Math.round(lb * 10) / 10, updated_at: new Date().toISOString() };
      await db.transaction("rw", [db.body_metrics, db.outbox, db.tombstones], async () => {
        await db.body_metrics.put(row);
        await markDirty(db, "body_metrics", row.id);
        for (const extra of existing.slice(1)) {
          await db.body_metrics.delete(extra.id);
          await markDeleted(db, "body_metrics", extra.id);
        }
      });
      requestSync();
    },
    [db, requestSync],
  );
  const remove = useCallback(
    async (id: string) => {
      await db.transaction("rw", [db.body_metrics, db.outbox, db.tombstones], async () => {
        await db.body_metrics.delete(id);
        await markDeleted(db, "body_metrics", id);
      });
      requestSync();
    },
    [db, requestSync],
  );
  return { log, remove };
}
