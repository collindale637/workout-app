import type { CardioSession, CardioType, Units } from "./db/types";
import { distanceUnit, formatDuration, toDisplayDistance } from "./units";

export const CARDIO_TYPES: { id: CardioType; label: string; distance: boolean }[] = [
  { id: "run", label: "Run", distance: true },
  { id: "walk", label: "Walk", distance: true },
  { id: "bike", label: "Bike", distance: true },
  { id: "row", label: "Row", distance: true },
  { id: "elliptical", label: "Elliptical", distance: true },
  { id: "stairs", label: "Stairs", distance: false },
  { id: "swim", label: "Swim", distance: true },
  { id: "hiit", label: "HIIT", distance: false },
  { id: "other", label: "Other", distance: false },
];

export const cardioLabel = (t: CardioType) => CARDIO_TYPES.find((c) => c.id === t)?.label ?? "Cardio";

export const cardioHasDistance = (t: CardioType) => CARDIO_TYPES.find((c) => c.id === t)?.distance ?? false;

/** Walks and runs can be done on a treadmill, so they get an optional incline (% grade). */
export const cardioHasIncline = (t: CardioType) => t === "walk" || t === "run";

/** Treadmills top out around 15 %, a few go to 40 %; the database check matches. */
export const INCLINE_MAX = 40;

/** Library exercises in the "cardio" category get Start / Done instead of sets and reps. */
export const isCardioExercise = (ex: { category: string } | undefined | null) => ex?.category === "cardio";

/** Which kind of cardio a library exercise is, so the right result fields show up ("Treadmill Run" → run). */
export function cardioTypeFor(ex: { id: string; name: string }): CardioType {
  const s = `${ex.id} ${ex.name}`.toLowerCase().replace(/_/g, " ");
  if (/prowler|ski ?erg|skat/.test(s)) return "other";
  if (/ellipt/.test(s)) return "elliptical";
  if (/bik|cycl|spin/.test(s)) return "bike";
  if (/\brow(ing|er)?\b/.test(s)) return "row";
  if (/stair|step ?mill/.test(s)) return "stairs";
  if (/swim/.test(s)) return "swim";
  if (/jump(ing)? rope|rope jump/.test(s)) return "other";
  if (/run|jog|sprint/.test(s)) return "run";
  if (/walk/.test(s)) return "walk";
  return "other";
}

/**
 * A cardio timer that survives leaving the screen or closing the app: it keeps clock times, not a running count.
 * `stoppedAt` is set when you tap Done, while the results form is still waiting to be filled in.
 */
export type CardioTimer = {
  type: CardioType;
  startedAt: number;
  stoppedAt: number | null;
  workoutId: string | null;
  /** The cardio exercise in the workout this timer is for; null for a standalone session. */
  wexId: string | null;
  /** Set when a saved session was resumed: saving updates it instead of adding another. */
  sessionId?: string | null;
};

export const cardioElapsedSec = (t: Pick<CardioTimer, "startedAt" | "stoppedAt">, now: number) =>
  Math.max(0, Math.floor(((t.stoppedAt ?? now) - t.startedAt) / 1000));

/** "30:00 · 2.1 mi · 5% incline" */
export function cardioSummary(c: Pick<CardioSession, "duration_sec" | "distance" | "incline">, units: Units) {
  return `${formatDuration(c.duration_sec)}${c.distance ? ` · ${toDisplayDistance(c.distance, units)} ${distanceUnit(units)}` : ""}${c.incline ? ` · ${c.incline}% incline` : ""}`;
}
