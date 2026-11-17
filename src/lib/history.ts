"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useData } from "@/lib/db/provider";
import { isPerHand, volumeBy } from "@/lib/units";
import type { CardioSession, Workout } from "@/lib/db/types";

export type HistoryItem =
  | { kind: "workout"; at: string; workout: Workout; exerciseIds: string[]; sets: number; volume: number; durationSec: number; cardio: CardioSession[] }
  | { kind: "cardio"; at: string; cardio: CardioSession };

/** Finished workouts and standalone cardio, newest first. */
export function useHistory(limit = 200) {
  const { db } = useData();
  return useLiveQuery(async () => {
    const workouts = (await db.workouts.orderBy("started_at").reverse().toArray()).filter((w) => w.ended_at).slice(0, limit);
    const ids = workouts.map((w) => w.id);
    const wexs = await db.workout_exercises.where("workout_id").anyOf(ids).toArray();
    const sets = await db.sets.where("workout_exercise_id").anyOf(wexs.map((w) => w.id)).toArray();
    const cardio = await db.cardio_sessions.orderBy("started_at").reverse().toArray();
    const wexBy = new Map<string, typeof wexs>();
    for (const w of wexs) wexBy.set(w.workout_id, [...(wexBy.get(w.workout_id) ?? []), w]);
    const setsBy = new Map<string, typeof sets>();
    for (const s of sets) setsBy.set(s.workout_exercise_id, [...(setsBy.get(s.workout_exercise_id) ?? []), s]);
    const perHandIds = new Set((await db.exercises.bulkGet([...new Set(wexs.map((w) => w.exercise_id))])).filter((e) => isPerHand(e)).map((e) => e!.id));
    const openIds = new Set((await db.workouts.filter((w) => !w.ended_at).primaryKeys()) as string[]);

    const items: HistoryItem[] = workouts.map((w) => {
      const list = (wexBy.get(w.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
      const ss = list.flatMap((x) => setsBy.get(x.id) ?? []);
      return {
        kind: "workout",
        at: w.started_at,
        workout: w,
        exerciseIds: list.map((x) => x.exercise_id),
        sets: ss.filter((s) => s.type !== "warmup").length,
        volume: volumeBy(ss, list, (id) => perHandIds.has(id)),
        durationSec: (new Date(w.ended_at!).getTime() - new Date(w.started_at).getTime()) / 1000,
        cardio: cardio.filter((c) => c.workout_id === w.id),
      };
    });
    for (const c of cardio) {
      if (!c.workout_id || (!ids.includes(c.workout_id) && !openIds.has(c.workout_id))) items.push({ kind: "cardio", at: c.started_at, cardio: c });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at));
  }, [db, limit]);
}
