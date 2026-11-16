import type { CardioPref, Experience, Goal } from "./db/types";

/*
  Onboarding helpers (plan doc → "Onboarding"): which split to suggest for how often you can train,
  your goal, experience and how much cardio you want. Suggestions only; every split stays pickable.
*/

export type SplitInfo = { id: string; name: string; days_per_week: number; description: string; sort_order: number };

/** The best-fit split id for these answers. */
export function recommendSplit(days: number, goal: Goal, experience: Experience, cardio: CardioPref): string {
  const d = Math.min(6, Math.max(2, days));
  if (d === 2) return "full_body_2";
  if (d === 3) return experience === "beginner" || goal === "fat_loss" || goal === "general" ? "full_body_3" : "ppl_3";
  if (d === 4) {
    if (cardio === "more" || goal === "fat_loss") return "hybrid_4";
    if (goal === "strength") return "phul_4";
    return "upper_lower_4";
  }
  if (d === 5) return experience === "beginner" ? "upper_lower_4" : "ul_ppl_5";
  return experience === "beginner" ? "ul_ppl_5" : "ppl_6";
}

/** Splits that fit the week: the recommended one first, then the rest for that many days, then one fewer. */
export function splitChoices(splits: SplitInfo[], days: number, recommended: string): SplitInfo[] {
  const d = Math.min(6, Math.max(2, days));
  const fits = (s: SplitInfo) => s.days_per_week === d || s.days_per_week === d - 1;
  const list = splits.filter((s) => s.id === recommended || fits(s));
  return list.sort((a, b) =>
    (a.id === recommended ? -1 : b.id === recommended ? 1 : 0) || b.days_per_week - a.days_per_week || a.sort_order - b.sort_order,
  );
}

export const CARDIO_PREF_LABELS: Record<CardioPref, { name: string; blurb: string }> = {
  none: { name: "Just lifting", blurb: "No cardio unless a day calls for it. You can still log runs and rides." },
  auto: { name: "What my goal needs", blurb: "Cardio when it helps your goal: most days for fat loss, a little for general fitness." },
  more: { name: "Lots of cardio", blurb: "A cardio block after every lifting session." },
};

export const GOAL_BLURBS: Record<Goal, string> = {
  strength: "Lift heavier. Fewer reps, longer rests, the big lifts first.",
  hypertrophy: "Grow muscle size. Moderate weights, 6–15 reps, plenty of sets.",
  fat_loss: "Lose fat and tone up. Faster sessions, supersets and cardio.",
  general: "Feel fit and healthy. A balanced mix of strength and cardio.",
};
