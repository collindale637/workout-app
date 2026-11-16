import type { Exercise, WorkoutExercise } from "./db/types";

/*
  Planned warm-up: at most ONE warm-up set per workout, and only on a lift that really needs it.

  Needs one: the first heavy lift of the day (the one the generator or AI marked with a "Warm up" note) when it is
    - a barbell-style compound (barbell, trap bar, safety squat bar, Smith machine, landmine) at 12 reps or fewer, or
    - any other loaded compound done heavy (6 reps or fewer, i.e. Power / strength days).
  Doesn't: machines, cables, dumbbells and kettlebells at normal reps, bodyweight moves, isolation, core, cardio,
  and every lift after the first one (earlier work has already warmed you up).
*/

export const WARMUP_NOTE = "Warm up: 1 lighter set first";
/** Stored in workout_exercises.skipped_sets when the planned warm-up is skipped (working sets are 1, 2, 3…). */
export const WARMUP_SLOT = 0;

const BAR_LIFTS = new Set(["barbell", "trap_bar", "safety_squat_bar", "smith_machine", "landmine"]);
const LOADED = new Set([...BAR_LIFTS, "dumbbells", "kettlebells", "ez_bar"]);

export const isBarLift = (equipmentIds: string[]) => equipmentIds.some((e) => BAR_LIFTS.has(e));

/** Does this lift, done for this many reps, deserve a warm-up set? */
export function warmupWorthy(ex: Pick<Exercise, "mechanic" | "category"> | undefined, equipmentIds: string[], repMax: number | null) {
  if (!ex || ex.mechanic !== "compound" || ex.category === "cardio") return false;
  const reps = repMax ?? 10;
  if (isBarLift(equipmentIds)) return reps <= 12;
  return reps <= 6 && equipmentIds.some((e) => LOADED.has(e));
}

/** The one exercise in this workout that gets a planned warm-up row, or null. Old plans' "1–2 / 2–3 sets" notes count too. */
export function plannedWarmupId(
  wexs: Pick<WorkoutExercise, "id" | "exercise_id" | "notes" | "rep_max">[],
  exerciseOf: (id: string) => Pick<Exercise, "mechanic" | "category"> | undefined,
  equipmentOf: (id: string) => string[],
) {
  const first = wexs.find((w) => w.notes?.startsWith("Warm up"));
  if (!first) return null;
  return warmupWorthy(exerciseOf(first.exercise_id), equipmentOf(first.exercise_id), first.rep_max) ? first.id : null;
}

/** Suggested warm-up: about half your working weight for 8 (heavy days: 60% for 5), rounded to 5 lb, never under the empty bar. */
export function warmupDose(workingLb: number | null, repMax: number | null, equipmentIds: string[]) {
  const heavy = (repMax ?? 10) <= 6;
  const reps = heavy ? 5 : 8;
  if (workingLb === null || workingLb <= 0) return { weight: null, reps, pct: heavy ? 60 : 50 };
  const floor = isBarLift(equipmentIds) ? 45 : 5;
  const weight = Math.min(workingLb, Math.max(floor, Math.round((workingLb * (heavy ? 0.6 : 0.5)) / 5) * 5));
  return { weight, reps, pct: heavy ? 60 : 50 };
}
