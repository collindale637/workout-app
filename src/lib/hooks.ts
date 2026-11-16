"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData, useProfile } from "@/lib/db/provider";
import { needsByExercise } from "@/lib/availability";
import type { Equipment, Exercise, ExerciseMuscle, Muscle } from "@/lib/db/types";

export type Catalog = {
  exercises: Exercise[];
  byId: Map<string, Exercise>;
  needs: ReturnType<typeof needsByExercise>;
  musclesOf: Map<string, ExerciseMuscle[]>;
  muscles: Muscle[];
  muscleName: Map<string, string>;
  equipment: Equipment[];
  equipmentName: Map<string, string>;
};

/** The exercise library from the phone, with quick lookups. */
export function useCatalog(): Catalog | undefined {
  const { db } = useData();
  const raw = useLiveQuery(async () => {
    const [exercises, exMuscles, exEquip, muscles, equipment] = await Promise.all([
      db.exercises.toArray(),
      db.exercise_muscles.toArray(),
      db.exercise_equipment.toArray(),
      db.muscles.orderBy("id").toArray(),
      db.equipment.toArray(),
    ]);
    return { exercises, exMuscles, exEquip, muscles, equipment };
  }, [db]);
  return useMemo(() => {
    if (!raw) return undefined;
    const musclesOf = new Map<string, ExerciseMuscle[]>();
    for (const m of raw.exMuscles) musclesOf.set(m.exercise_id, [...(musclesOf.get(m.exercise_id) ?? []), m]);
    const equipment = [...raw.equipment].sort((a, b) => a.sort_order - b.sort_order);
    return {
      exercises: raw.exercises,
      byId: new Map(raw.exercises.map((e) => [e.id, e])),
      needs: needsByExercise(raw.exEquip),
      musclesOf,
      muscles: [...raw.muscles].sort((a, b) => a.sort_order - b.sort_order),
      muscleName: new Map(raw.muscles.map((m) => [m.id, m.name])),
      equipment,
      equipmentName: new Map(equipment.map((e) => [e.id, e.name])),
    };
  }, [raw]);
}

/** The gym you're at right now and what it has. */
export function useActiveGym() {
  const { db } = useData();
  const { profile } = useProfile();
  const gyms = useLiveQuery(() => db.gyms.toArray(), [db]);
  const activeId = profile?.active_gym_id ?? gyms?.find((g) => g.is_default)?.id ?? gyms?.[0]?.id ?? null;
  const gym = gyms?.find((g) => g.id === activeId) ?? null;
  const equipmentRows = useLiveQuery(
    async () => (activeId ? db.gym_equipment.where("gym_id").equals(activeId).toArray() : []),
    [db, activeId],
  );
  const equipment = useMemo(() => new Set((equipmentRows ?? []).map((r) => r.equipment_id)), [equipmentRows]);
  return { gyms: gyms ?? [], gym, equipment, equipmentRows: equipmentRows ?? [], loaded: gyms !== undefined };
}

/** The workout that's still going, if any. */
export function useOpenWorkout() {
  const { db } = useData();
  return useLiveQuery(async () => {
    const open = await db.workouts.filter((w) => !w.ended_at).toArray();
    open.sort((a, b) => b.started_at.localeCompare(a.started_at));
    return open[0] ?? null;
  }, [db]);
}
