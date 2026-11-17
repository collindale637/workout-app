import type { Units } from "./db/types";
import { formatWeight, weightUnit } from "./units";

/*
  Sanity limits for a logged set, so a slipped thumb (a stray extra digit) can't put 18,000 lb or 400 reps in
  the history and the charts. Weights are pounds in storage; the message shows the person's own units.
*/

export const MAX_SET_WEIGHT_LB = 1500;
export const MIN_SET_REPS = 1;
export const MAX_SET_REPS = 100;

/** A short, plain message for the first problem with this set, or null when it's fine. Blank weight = bodyweight. */
export function setProblem(weightLb: number | null, reps: number | null, units: Units): string | null {
  if (weightLb !== null && (!Number.isFinite(weightLb) || weightLb < 0 || weightLb > MAX_SET_WEIGHT_LB)) {
    return `Weight must be 0–${formatWeight(MAX_SET_WEIGHT_LB, units)} ${weightUnit(units)}.`;
  }
  if (reps === null || !Number.isFinite(reps) || reps < MIN_SET_REPS || reps > MAX_SET_REPS) {
    return `Reps must be ${MIN_SET_REPS}–${MAX_SET_REPS}.`;
  }
  return null;
}

