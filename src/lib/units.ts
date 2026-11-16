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
export const weightStep = (units: Units) => (units === "kg" ? 2.5 : 5);

/** "185", "92.5", "BW" */
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

/** An estimated max, rounded to a whole pound (or half kilo): the decimals are noise. */
export const formatMax = (lb: number, units: Units) =>
  units === "kg" ? String(Math.round((lb / LB_PER_KG) * 2) / 2) : String(Math.round(lb));

/** Epley estimated one-rep max. */
export const estimate1RM = (weight: number, reps: number) => (reps <= 1 ? weight : weight * (1 + reps / 30));
