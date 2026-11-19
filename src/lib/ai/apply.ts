import type { Catalog } from "@/lib/hooks";
import type { AiDay, AiItem, AiPlan, PlanSnapshot } from "./types";

/** What a day trains: the main muscles of its lifts, in body-map order. Used to regenerate and swap later. */
export function targetsFor(catalog: Pick<Catalog, "musclesOf" | "muscles">, items: Pick<AiItem, "exercise_id">[]): string[] {
  const hit = new Set<string>();
  for (const i of items) for (const m of catalog.musclesOf.get(i.exercise_id) ?? []) if (m.role === "primary") hit.add(m.muscle_id);
  return catalog.muscles.map((m) => m.id).filter((id) => hit.has(id));
}

/** The plan's saved notes: the overview, then how it progresses. */
export const planNotes = (p: Pick<AiPlan, "summary" | "progression">) =>
  [p.summary.trim(), p.progression.trim() ? `Progression: ${p.progression.trim()}` : ""].filter(Boolean).join("\n\n") || null;

/** A draft plan in the shape the edit request expects (drafts get stand-in day ids). */
export function draftSnapshot(p: AiPlan): PlanSnapshot {
  return {
    name: p.name,
    goal: p.goal,
    weeks: p.weeks,
    notes: planNotes(p),
    days: p.days.map((d, i) => ({ id: `draft-${i + 1}`, name: d.name, items: d.items })),
    ...(p.later_weeks?.length ? { later: p.later_weeks.map((w) => ({ week: w.week, kind: w.kind, focus: w.focus, days: w.days.map((d) => ({ name: d.name, items: d.items })) })) } : {}),
  };
}

/**
 * Every day to save for a draft, week by week: week 1's days, then each later week's own days. Weeks with no days of
 * their own repeat the week before (see src/lib/plan-weeks.ts).
 */
export function draftWeekDays(p: Pick<AiPlan, "days" | "later_weeks">): { week: number; day: AiDay }[] {
  return [
    ...p.days.map((day) => ({ week: 1, day })),
    ...(p.later_weeks ?? []).flatMap((w) => w.days.map((day) => ({ week: w.week, day: { ...day, ref_day_id: null } }))),
  ];
}
