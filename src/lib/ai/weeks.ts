import { MAX_PLAN_WEEKS } from "@/lib/plan-weeks";
import { checkItems } from "./validate";
import type { AiDay, AiPlan, AiWeek, AllowedExercise, WeekChange } from "./types";

/*
  AI plans whose workouts change from week to week (Batch 20d).
  Claude's first answer is week 1 plus a short schedule: the weeks where the workouts change. Each "new" week is then
  written in its own call (in parallel, so a 12-week plan doesn't take 12 times as long). Deload weeks aren't asked
  for: the app halves the sets of the week before, and puts full sets back the week after.
  Weeks not listed repeat the week before, the same way saved plans store their weeks (src/lib/plan-weeks.ts).
*/

/** At most this many weeks of newly written workouts per plan, which keeps the cost and wait in check. */
export const MAX_NEW_WEEKS = 5;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : null);

/** The last week a schedule can name: the plan's length, up to 12. */
export const lastScheduledWeek = (planWeeks: number) => Math.min(Math.max(planWeeks, 1), MAX_PLAN_WEEKS);

/** Checks the schedule in Claude's first answer. Bad entries are dropped and reported. */
export function checkSchedule(raw: unknown, planWeeks: number): { schedule: WeekChange[]; errors: string[] } {
  const errors: string[] = [];
  if (raw === undefined || raw === null) return { schedule: [], errors };
  if (!Array.isArray(raw)) return { schedule: [], errors: [`"schedule" must be a list.`] };
  const last = lastScheduledWeek(planWeeks);
  const seen = new Set<number>();
  const out: WeekChange[] = [];
  for (const e of raw) {
    const o = isObj(e) ? e : {};
    const week = int(o.week);
    if (week === null || week < 2 || week > last) {
      errors.push(last < 2 ? `"schedule" must be empty for a one-week plan.` : `schedule: week must be 2–${last}.`);
      continue;
    }
    if (seen.has(week)) {
      errors.push(`schedule: week ${week} is listed twice.`);
      continue;
    }
    const kind = o.kind === "deload" ? "deload" : "new";
    if (o.kind !== undefined && o.kind !== "new" && o.kind !== "deload") errors.push(`schedule: week ${week} kind must be "new" or "deload".`);
    const focus = text(o.focus, 200);
    if (kind === "new" && !focus) errors.push(`schedule: week ${week} needs a "focus" saying what changes.`);
    seen.add(week);
    out.push({ week, kind, focus });
  }
  out.sort((a, b) => a.week - b.week);
  const news = out.filter((e) => e.kind === "new");
  if (news.length > MAX_NEW_WEEKS) {
    errors.push(`At most ${MAX_NEW_WEEKS} weeks of new workouts; let the others repeat the week before.`);
    const keep = new Set(news.slice(0, MAX_NEW_WEEKS).map((e) => e.week));
    return { schedule: out.filter((e) => e.kind === "deload" || keep.has(e.week)), errors };
  }
  return { schedule: out, errors };
}

/** Checks one week Claude wrote: the same days as week 1, in the same order. */
export function checkWeek(raw: unknown, allow: Map<string, AllowedExercise>, week: number, week1: AiDay[]): { days: AiDay[]; errors: string[] } {
  const errors: string[] = [];
  const r = isObj(raw) ? raw : {};
  const rawDays = Array.isArray(r.days) ? r.days : [];
  if (rawDays.length !== week1.length) errors.push(`Week ${week} must have exactly ${week1.length} days, in the same order as week 1.`);
  const days: AiDay[] = [];
  week1.forEach((base, i) => {
    const o = isObj(rawDays[i]) ? (rawDays[i] as Obj) : null;
    const name = (o && text(o.name, 40)) || base.name;
    const items = o ? checkItems(o.exercises, allow, `Week ${week}, day ${i + 1} (${name})`, errors) : [];
    if (!items.length) {
      if (o) errors.push(`Week ${week}, day ${i + 1} (${name}) has no valid exercises.`);
      // Keep the week usable: a day that couldn't be written stays as it was.
      days.push({ ...base, ref_day_id: null });
      return;
    }
    days.push({ name, ref_day_id: null, items });
  });
  return { days, errors };
}

/** A deload week: the same workouts with about half the sets (cardio unchanged). */
export const deloadDays = (days: AiDay[]): AiDay[] =>
  days.map((d) => ({ ...d, ref_day_id: null, items: d.items.map((i) => ({ ...i, sets: Math.max(1, Math.ceil(i.sets / 2)) })) }));

/**
 * The plan's later weeks from the schedule and the weeks Claude wrote. A "new" week that couldn't be written is left
 * out (it repeats the week before) and reported. After a deload, full sets come back the next week unless that week
 * already has its own workouts.
 */
export function assembleWeeks(schedule: WeekChange[], written: Map<number, AiDay[]>, week1: AiDay[], planWeeks: number): { weeks: AiWeek[]; errors: string[] } {
  const errors: string[] = [];
  const last = lastScheduledWeek(planWeeks);
  const listed = new Set(schedule.map((e) => e.week));
  const out: AiWeek[] = [];
  let full = week1;
  for (const e of schedule) {
    if (e.week > last) continue;
    if (e.kind === "new") {
      const days = written.get(e.week);
      if (!days) {
        errors.push(`Week ${e.week} couldn't be written, so it repeats the week before.`);
        continue;
      }
      out.push({ week: e.week, kind: "new", focus: e.focus, days });
      full = days;
      continue;
    }
    out.push({ week: e.week, kind: "deload", focus: e.focus || "Easier week: about half the sets.", days: deloadDays(full) });
    const next = e.week + 1;
    if (next <= last && !listed.has(next)) out.push({ week: next, kind: "back", focus: "Back to full sets.", days: full });
  }
  return { weeks: out, errors };
}

/** The schedule a draft was built from, for a follow-up edit ("back" weeks are added again by the app). */
export const scheduleOf = (p: Pick<AiPlan, "later_weeks">): WeekChange[] =>
  (p.later_weeks ?? []).filter((w) => w.kind !== "back").map((w) => ({ week: w.week, kind: w.kind === "deload" ? "deload" : "new", focus: w.focus }));

/** The days a draft trains in week `week`: that week's own, else the latest earlier week's, else week 1's. */
export function draftDaysForWeek(p: Pick<AiPlan, "days" | "later_weeks">, week: number): { days: AiDay[]; from: number; entry: AiWeek | null } {
  let entry: AiWeek | null = null;
  for (const w of p.later_weeks ?? []) if (w.week <= week && (!entry || w.week > entry.week)) entry = w;
  return entry ? { days: entry.days, from: entry.week, entry } : { days: p.days, from: 1, entry: null };
}
