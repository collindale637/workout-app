/*
  Today's "not ready" options (UX spec Part 2.2). When the next plan day's muscles aren't recovered, Today offers
  one Switch: the first later day in the plan that is ready, or (if none is) a lighter version of the planned day.
  Pure, so it's tested on its own.
*/

export type Alternative<D> = { kind: "day"; day: D } | { kind: "light" };

/** Walks the plan's days in order starting after the planned day (wrapping), skipping it; first ready day wins. */
export function pickAlternative<D extends { id: string }>(days: D[], plannedDayId: string, readinessOf: (d: D) => { ready: boolean }): Alternative<D> {
  const i = days.findIndex((d) => d.id === plannedDayId);
  for (let k = 1; k < days.length; k++) {
    const d = days[(Math.max(0, i) + k) % days.length];
    if (d.id !== plannedDayId && readinessOf(d).ready) return { kind: "day", day: d };
  }
  return { kind: "light" };
}

/** "Go lighter": every lift capped at 2 sets; cardio unchanged. */
export const LIGHT_SETS = 2;
export function lighterItems<T extends { exercise_id: string; sets: number }>(items: T[], isCardio: (exerciseId: string) => boolean): T[] {
  return items.map((it) => (isCardio(it.exercise_id) ? it : { ...it, sets: Math.min(it.sets, LIGHT_SETS) }));
}

/** About how long the lighter day takes: session minutes × (lighter sets ÷ planned sets), rounded to 5 (at least 5). */
export function lighterMinutes(sessionMinutes: number, planned: { sets: number }[], lighter: { sets: number }[]) {
  const total = (l: { sets: number }[]) => l.reduce((a, it) => a + Math.max(0, it.sets), 0);
  const p = total(planned);
  if (!p) return sessionMinutes;
  return Math.max(5, Math.round((sessionMinutes * (total(lighter) / p)) / 5) * 5);
}
