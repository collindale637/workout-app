/*
  Plan previews show each day by its headline lifts ("Bench Press · Overhead Press · Incline Press +4 more"),
  not by a row of muscle chips that look the same on every Push or Pull day.
*/

type Item = { exercise_id: string };

/** The main (non-cardio) lifts of a day, in plan order, with how many more there are. */
export function headline(items: Item[], opts: { isCardio: (id: string) => boolean; nameOf: (id: string) => string; max?: number }): { names: string[]; more: number } {
  const lifts = items.filter((i) => !opts.isCardio(i.exercise_id));
  const names = lifts.slice(0, opts.max ?? 3).map((i) => opts.nameOf(i.exercise_id));
  return { names, more: items.length - names.length };
}

/** "Bench Press · Overhead Press · Incline Press +4 more" (or "+1 more"). */
export function headlineText(h: { names: string[]; more: number }): string {
  return `${h.names.join(" · ")}${h.more > 0 ? ` +${h.more} more` : ""}`;
}

/** Applies swaps (keyed "dayIndex:itemIndex" → new exercise id) to generated days. Doses carry over. */
export function applySwaps<T extends { items: Item[] }>(days: T[], swaps: Record<string, string>): T[] {
  if (!Object.keys(swaps).length) return days;
  return days.map((d, di) => ({ ...d, items: d.items.map((it, ii) => (swaps[`${di}:${ii}`] ? { ...it, exercise_id: swaps[`${di}:${ii}`] } : it)) }));
}
