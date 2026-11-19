import type { Plan, PlanDay } from "@/lib/db/types";

/*
  Plans that run week by week (Batch 20).
  - A plan day belongs to a week (1–12). A week with no days of its own reuses the latest earlier week that has some,
    so a plan that repeats one week stores it once.
  - The plan is on `current_week`. A day counts as done this week when a workout from it finished after the week
    started. The week moves on once every day is done or skipped (`advancePlan`).
  - `plans.weeks` is the plan's length. After the last week the plan is complete; with no length it keeps going.
*/

export const MAX_PLAN_WEEKS = 12;

export const dayWeek = (d: Pick<PlanDay, "week">) => d.week ?? 1;
export const planWeek = (p: Pick<Plan, "current_week">) => p.current_week ?? 1;

/** The week whose days week `week` uses: itself if it has days, else the latest earlier week that does. */
export function sourceWeek(days: Pick<PlanDay, "week">[], week: number): number | null {
  let best: number | null = null;
  for (const d of days) {
    const w = dayWeek(d);
    if (w <= week && (best === null || w > best)) best = w;
  }
  return best;
}

/** The days to train in week `week`, in order. */
export function daysForWeek<T extends Pick<PlanDay, "week" | "day_order">>(days: T[], week: number): T[] {
  const src = sourceWeek(days, week);
  if (src === null) return [];
  return days.filter((d) => dayWeek(d) === src).sort((a, b) => a.day_order - b.day_order);
}

/** When the current week started (ms). Falls back to the plan's start date, then when it was made. */
export function weekStart(p: Pick<Plan, "week_started_at" | "start_date" | "created_at">): number {
  if (p.week_started_at) return Date.parse(p.week_started_at);
  if (p.start_date) return new Date(`${p.start_date}T00:00:00`).getTime();
  return Date.parse(p.created_at);
}

export type FinishedWorkout = { plan_day_id: string | null; ended_at: string | null };

export type WeekProgress<T> = {
  /** The week the plan is on (1-based). */
  week: number;
  /** The plan's length in weeks, or null when it keeps going. */
  length: number | null;
  /** This week's days, in order. */
  days: T[];
  done: Set<string>;
  skipped: Set<string>;
  /** Every day this week is done or skipped. */
  weekComplete: boolean;
  /** This is the plan's last week. */
  lastWeek: boolean;
  /** The day to train next: the first one this week not done or skipped (next week's first once this one is full). */
  nextDay: T | null;
};

export function weekProgress<T extends Pick<PlanDay, "id" | "week" | "day_order">>(
  plan: Pick<Plan, "current_week" | "weeks" | "week_started_at" | "start_date" | "created_at" | "skipped_day_ids">,
  allDays: T[],
  finished: FinishedWorkout[],
): WeekProgress<T> {
  const week = planWeek(plan);
  const length = plan.weeks && plan.weeks > 1 ? plan.weeks : null;
  const days = daysForWeek(allDays, week);
  const ids = new Set(days.map((d) => d.id));
  const since = weekStart(plan);
  const done = new Set(
    finished.filter((w) => w.plan_day_id && w.ended_at && ids.has(w.plan_day_id) && Date.parse(w.ended_at) >= since).map((w) => w.plan_day_id!),
  );
  const skipped = new Set((plan.skipped_day_ids ?? []).filter((id) => ids.has(id) && !done.has(id)));
  const weekComplete = days.length > 0 && days.every((d) => done.has(d.id) || skipped.has(d.id));
  const lastWeek = length !== null && week >= length;
  let nextDay = days.find((d) => !done.has(d.id) && !skipped.has(d.id)) ?? null;
  if (!nextDay) nextDay = (weekComplete && !lastWeek ? daysForWeek(allDays, week + 1)[0] : days[0]) ?? null;
  return { week, length, days, done, skipped, weekComplete, lastWeek, nextDay };
}

/**
 * The plan fields to save once the week is full, or null when nothing changes. Moves to the next week (fresh skip
 * list, new start time); on the last week it marks the plan complete instead.
 */
export function advancePlan(
  plan: Pick<Plan, "current_week" | "weeks" | "completed_at">,
  progress: Pick<WeekProgress<unknown>, "weekComplete" | "lastWeek" | "week">,
  now: string,
): Partial<Plan> | null {
  if (!progress.weekComplete || progress.week !== planWeek(plan)) return null;
  if (progress.lastWeek) return plan.completed_at ? null : { completed_at: now };
  return { current_week: progress.week + 1, week_started_at: now, skipped_day_ids: [] };
}

/** "Week 3 of 8" or "Week 3". */
export const weekLabel = (week: number, length: number | null) => (length ? `Week ${Math.min(week, length)} of ${length}` : `Week ${week}`);

/** The plan finished its last week and the Plan complete screen hasn't been dismissed ("Skip for now"). */
export const showPlanComplete = (p: Pick<Plan, "completed_at" | "completion_dismissed_at">) => Boolean(p.completed_at && !p.completion_dismissed_at);

/** The plan finished and was dismissed: Today works as if no plan were active, with a "Plan finished" row. */
export const planFinishedAndDismissed = (p: Pick<Plan, "completed_at" | "completion_dismissed_at">) => Boolean(p.completed_at && p.completion_dismissed_at);

/** When this run of the plan began (Restart sets a new start date), so history from earlier runs isn't counted. */
export function runStart(p: Pick<Plan, "start_date" | "created_at">): number {
  return p.start_date ? new Date(`${p.start_date}T00:00:00`).getTime() : Date.parse(p.created_at);
}

/**
 * Numbers for the Plan complete screen: workouts done from this plan since the run began, and planned days not done
 * (skips aren't kept once a week moves on, so this is days planned minus workouts done, never below 0).
 */
export function planRunStats<T extends Pick<PlanDay, "id" | "week" | "day_order">>(
  plan: Pick<Plan, "weeks" | "start_date" | "created_at">,
  allDays: T[],
  finished: (FinishedWorkout & { id?: string })[],
): { workouts: number; skipped: number; workoutIds: Set<string> } {
  const ids = new Set(allDays.map((d) => d.id));
  const since = runStart(plan);
  const mine = finished.filter((w) => w.plan_day_id && w.ended_at && ids.has(w.plan_day_id) && Date.parse(w.ended_at) >= since);
  let planned = 0;
  const length = Math.min(plan.weeks && plan.weeks > 1 ? plan.weeks : 1, 52);
  for (let w = 1; w <= length; w++) planned += daysForWeek(allDays, w).length;
  return { workouts: mine.length, skipped: Math.max(0, planned - mine.length), workoutIds: new Set(mine.map((w) => w.id).filter((x): x is string => Boolean(x))) };
}


/**
 * What copying week `from`'s workouts into week `to` changes: the target's own days and exercises go, and copies of the
 * source week's days (new ids) take their place. Null when there's nothing to copy or the week copies onto itself.
 */
export function planCopy<D extends Pick<PlanDay, "id" | "week" | "day_order">, R extends { id: string; plan_day_id: string; sort_order: number }>(
  days: D[],
  rows: R[],
  from: number,
  to: number,
  newId: () => string,
): { removeDays: D[]; removeRows: R[]; addDays: D[]; addRows: R[] } | null {
  const src = sourceWeek(days, from);
  if (src === null || src === to || to < 1) return null;
  const fromDays = days.filter((d) => dayWeek(d) === src).sort((a, b) => a.day_order - b.day_order);
  const removeDays = days.filter((d) => dayWeek(d) === to);
  const gone = new Set(removeDays.map((d) => d.id));
  const addDays: D[] = [];
  const addRows: R[] = [];
  for (const d of fromDays) {
    const id = newId();
    addDays.push({ ...d, id, week: to });
    for (const r of rows.filter((x) => x.plan_day_id === d.id).sort((a, b) => a.sort_order - b.sort_order)) addRows.push({ ...r, id: newId(), plan_day_id: id });
  }
  return { removeDays, removeRows: rows.filter((r) => gone.has(r.plan_day_id)), addDays, addRows };
}
