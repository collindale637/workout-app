import type { Units } from "./db/types";

// Weights are stored in pounds and distances in miles; these convert for display and input.
const LB_PER_KG = 2.2046226218;
const KM_PER_MI = 1.609344;

export const toDisplayWeight = (lb: number, units: Units) =>
  units === "kg" ? Math.round((lb / LB_PER_KG) * 4) / 4 : Math.round(lb * 100) / 100;

export const fromDisplayWeight = (value: number, units: Units) =>
  units === "kg" ? Math.round(value * LB_PER_KG * 100) / 100 : value;

export const toDisplayDistance = (mi: number, units: Units) =>
  units === "kg" ? Math.round(mi * KM_PER_MI * 100) / 100 : Math.round(mi * 100) / 100;

export const fromDisplayDistance = (value: number, units: Units) =>
  units === "kg" ? value / KM_PER_MI : value;

export const weightUnit = (units: Units) => (units === "kg" ? "kg" : "lb");
export const distanceUnit = (units: Units) => (units === "kg" ? "km" : "mi");

/** Default plus/minus step for the weight buttons. */
/** Lifts done with a dumbbell in each hand: the weight shown is per dumbbell ("LB EACH"). Label only. */
export const isPerHand = (ex: { name: string } | null | undefined) =>
  Boolean(ex && /dumbbell/i.test(ex.name) && !/one[- ]arm|single[- ]arm|goblet|pullover|concentration|one dumbbell|kickback/i.test(ex.name));

export const weightStep = (units: Units) => (units === "kg" ? 2.5 : 5);

/** "185", "92.5", "BW" */
/** Axis label: whole numbers, with one decimal only when the tick needs it (180.5). */
export function formatTick(v: number) {
  return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
}

export function formatWeight(lb: number | null, units: Units) {
  if (lb === null || lb === undefined) return "BW";
  const v = toDisplayWeight(lb, units);
  return Number.isInteger(v) ? String(v) : v.toFixed(v * 10 === Math.round(v * 10) ? 1 : 2);
}

/** 3725 -> "1:02:05", 605 -> "10:05" */
export function formatDuration(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** Total weight moved: sum of weight × reps for working and drop sets (pounds). */
export function volumeLb(sets: { weight: number | null; reps: number | null; type: string }[]) {
  return sets.reduce((sum, s) => (s.type === "warmup" ? sum : sum + (s.weight ?? 0) * (s.reps ?? 0)), 0);
}

/**
 * Weight moved across a workout's sets, counting both dumbbells on per-hand lifts (the weight logged is per
 * dumbbell). `wexs` maps each set to its exercise; `perHand` says which exercises are per-hand.
 * Bodyweight sets have no external load, so they add nothing (see `hasBodyweightSets`).
 */
export function volumeBy(
  sets: { workout_exercise_id: string; weight: number | null; reps: number | null; type: string }[],
  wexs: { id: string; exercise_id: string }[],
  perHand: (exerciseId: string) => boolean,
) {
  const exOf = new Map(wexs.map((w) => [w.id, w.exercise_id]));
  return sets.reduce((sum, s) => {
    if (s.type === "warmup") return sum;
    const ex = exOf.get(s.workout_exercise_id);
    return sum + (s.weight ?? 0) * (s.reps ?? 0) * (ex && perHand(ex) ? 2 : 1);
  }, 0);
}

/** Any working set done with no added weight (push-ups, pull-ups): volume doesn't count your bodyweight. */
export const hasBodyweightSets = (sets: { weight: number | null; reps: number | null; type: string }[]) =>
  sets.some((s) => s.type !== "warmup" && !(s.weight ?? 0) && (s.reps ?? 0) > 0);

export const VOLUME_NOTE = "Weight moved counts added weight (both dumbbells), not your bodyweight.";

/** An estimated max, rounded to a whole pound (or half kilo): the decimals are noise. */
export const formatMax = (lb: number, units: Units) =>
  units === "kg" ? String(Math.round((lb / LB_PER_KG) * 2) / 2) : String(Math.round(lb));

/** Epley estimated one-rep max. */
export const estimate1RM = (weight: number, reps: number) => (reps <= 1 ? weight : weight * (1 + reps / 30));

// Height is stored in inches (like weights in lb); these convert for display and input.
const CM_PER_IN = 2.54;

export const inchesToCm = (inches: number) => Math.round(inches * CM_PER_IN * 10) / 10;
export const cmToInches = (cm: number) => Math.round((cm / CM_PER_IN) * 10) / 10;

/** 70.5 -> { ft: 5, inch: 10.5 } */
export function splitFeetInches(inches: number) {
  const ft = Math.floor(inches / 12);
  return { ft, inch: Math.round((inches - ft * 12) * 10) / 10 };
}

/** 70.5 -> `5'10.5"` (lb users) or "179 cm" (kg users). */
export function formatHeight(inches: number | null, units: Units) {
  if (inches === null || inches === undefined) return "";
  if (units === "kg") return `${Math.round(inches * CM_PER_IN)} cm`;
  const { ft, inch } = splitFeetInches(inches);
  return `${ft}'${Number.isInteger(inch) ? inch : inch.toFixed(1)}"`;
}
