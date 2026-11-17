import { estimate1RM } from "./units";
import type { CardioType, Goal, SetType } from "./db/types";

/*
  Progress numbers (plan doc → "Progress"). Everything here is calculated from logged sets, cardio and
  bodyweight on the phone; nothing is stored. Pure functions, so they're easy to test.

  - Estimated 1-rep max (e1RM): Epley, weight × (1 + reps / 30), from working sets of 1–12 reps
    (higher-rep sets overestimate, so they only count when that's all there is).
  - PRs: a session beats every earlier session on best e1RM or heaviest weight (or most reps, for
    bodyweight moves). The first time you do a lift isn't a PR.
  - Weekly sets per muscle: working and drop sets; a primary muscle counts 1, a secondary 0.5.
  - Weeks run Sunday to Saturday (like the week strip on Today), in the phone's time zone.
*/

const DAY = 86_400_000;

/** A logged set with the workout's start time (when the session happened). */
export type LiftSet = {
  workoutId: string;
  exerciseId: string;
  /** Workout start (ISO). */
  at: string;
  type: SetType;
  weight: number | null;
  reps: number | null;
  /** Dumbbell in each hand: volume counts both. */
  perHand?: boolean;
  /** A single-joint lift: judged on reps at a weight, not on an estimated max. */
  isolation?: boolean;
};

export type LiftSession = {
  workoutId: string;
  at: string;
  /** Best estimated 1RM (lb); 0 for bodyweight-only sessions. */
  e1rm: number;
  /** Heaviest working weight (lb) and the most reps done with it. */
  topWeight: number;
  topReps: number;
  /** Most reps in one set (what bodyweight moves are judged on). */
  bestReps: number;
  /** Weight × reps over working and drop sets. */
  volume: number;
  workingSets: number;
  sets: { weight: number | null; reps: number | null; type: SetType }[];
  isolation: boolean;
};

const counts = (s: { type: SetType; reps: number | null }) => s.type !== "warmup" && (s.reps ?? 0) > 0;

/**
 * Best estimated 1RM from one session's sets: working sets of 1–12 reps, or any loaded set when that's
 * all there is. Shared with the finish summary so "PR!" there and on Progress always agree.
 */
export function bestE1rm(sets: { type: SetType; weight: number | null; reps: number | null }[]) {
  const loaded = sets.filter((s) => counts(s) && (s.weight ?? 0) > 0);
  const normal = loaded.filter((s) => s.type === "working" && s.reps! <= 12);
  const use = normal.length ? normal : loaded;
  return use.length ? Math.max(...use.map((s) => estimate1RM(s.weight!, s.reps!))) : 0;
}

/** One entry per workout for each exercise, oldest first. */
export function liftSessions(sets: LiftSet[]): Map<string, LiftSession[]> {
  const byKey = new Map<string, LiftSet[]>();
  for (const s of sets) {
    const k = `${s.exerciseId}|${s.workoutId}`;
    byKey.set(k, [...(byKey.get(k) ?? []), s]);
  }
  const out = new Map<string, LiftSession[]>();
  for (const list of byKey.values()) {
    const { exerciseId, workoutId, at } = list[0];
    const work = list.filter(counts);
    if (!work.length) continue;
    const loaded = work.filter((s) => (s.weight ?? 0) > 0);
    const topWeight = loaded.length ? Math.max(...loaded.map((s) => s.weight!)) : 0;
    const session: LiftSession = {
      workoutId,
      at,
      e1rm: bestE1rm(work),
      topWeight,
      topReps: topWeight ? Math.max(...loaded.filter((s) => s.weight === topWeight).map((s) => s.reps!)) : 0,
      bestReps: Math.max(...work.map((s) => s.reps!)),
      volume: work.reduce((a, s) => a + (s.weight ?? 0) * s.reps! * (s.perHand ? 2 : 1), 0),
      workingSets: work.filter((s) => s.type === "working").length,
      sets: list.map((s) => ({ weight: s.weight, reps: s.reps, type: s.type })),
      isolation: Boolean(list[0].isolation),
    };
    out.set(exerciseId, [...(out.get(exerciseId) ?? []), session]);
  }
  for (const list of out.values()) list.sort((a, b) => a.at.localeCompare(b.at));
  return out;
}

export type PRKind = "e1rm" | "weight" | "reps";

export type PREvent = {
  exerciseId: string;
  workoutId: string;
  at: string;
  kind: PRKind;
  value: number;
  previous: number;
  /** For weight PRs: reps done at the new weight. */
  reps?: number;
  /** For rep PRs on weighted lifts: the weight the reps were done at. */
  weight?: number;
};

/** An estimated max has to beat the old one by this much to count, so small bumps don't fill the PR list. */
export const PR_MARGIN = 1.025;

/** Most reps in a working set at this weight or heavier, across earlier sessions. */
const repsAtOrAbove = (before: LiftSession[], weight: number) =>
  Math.max(0, ...before.flatMap((x) => x.sets.filter((s) => s.type === "working" && (s.weight ?? 0) >= weight && (s.reps ?? 0) > 0).map((s) => s.reps!)));

/**
 * Every PR, newest first. One event per session per kind; e1RM beats weight when both happen.
 * Estimated-max PRs need a 2.5% jump. Single-joint lifts (curls, raises) are judged on reps instead: more
 * reps at the same weight or heavier, or a heavier weight.
 */
export function prEvents(sessions: Map<string, LiftSession[]>): PREvent[] {
  const out: PREvent[] = [];
  for (const [exerciseId, list] of sessions) {
    let bestE = 0;
    let bestW = 0;
    let bestR = 0;
    list.forEach((s, i) => {
      const first = i === 0;
      const loaded = s.topWeight > 0;
      const e = !first && loaded && !s.isolation && bestE > 0 && s.e1rm >= bestE * PR_MARGIN;
      const w = !first && loaded && bestW > 0 && s.topWeight > bestW;
      const r = !first && !loaded && bestW === 0 && s.bestReps > bestR;
      const prior = list.slice(0, i);
      const priorReps = loaded && s.isolation && !first ? repsAtOrAbove(prior, s.topWeight) : 0;
      const isoReps = priorReps > 0 && s.topReps > priorReps && s.topWeight <= bestW;
      if (e) out.push({ exerciseId, workoutId: s.workoutId, at: s.at, kind: "e1rm", value: s.e1rm, previous: bestE });
      if (w && !e) out.push({ exerciseId, workoutId: s.workoutId, at: s.at, kind: "weight", value: s.topWeight, previous: bestW, reps: s.topReps });
      if (r) out.push({ exerciseId, workoutId: s.workoutId, at: s.at, kind: "reps", value: s.bestReps, previous: bestR });
      if (isoReps) out.push({ exerciseId, workoutId: s.workoutId, at: s.at, kind: "reps", value: s.topReps, previous: priorReps, weight: s.topWeight });
      bestE = Math.max(bestE, s.e1rm);
      bestW = Math.max(bestW, s.topWeight);
      bestR = Math.max(bestR, s.bestReps);
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export type LiftRecords = {
  e1rm: { value: number; at: string } | null;
  weight: { value: number; reps: number; at: string } | null;
  reps: { value: number; at: string } | null;
  volume: { value: number; at: string } | null;
};

/** All-time bests for one exercise. */
export function liftRecords(list: LiftSession[]): LiftRecords {
  const best = <T>(pick: (s: LiftSession) => number, make: (s: LiftSession) => T): T | null => {
    let top: LiftSession | null = null;
    for (const s of list) if (pick(s) > 0 && (!top || pick(s) > pick(top))) top = s;
    return top ? make(top) : null;
  };
  return {
    e1rm: best((s) => s.e1rm, (s) => ({ value: s.e1rm, at: s.at })),
    weight: best((s) => s.topWeight, (s) => ({ value: s.topWeight, reps: s.topReps, at: s.at })),
    reps: best((s) => s.bestReps, (s) => ({ value: s.bestReps, at: s.at })),
    volume: best((s) => s.volume, (s) => ({ value: s.volume, at: s.at })),
  };
}

export type LiftSummary = {
  exerciseId: string;
  sessions: number;
  lastAt: string;
  /** Latest best e1RM, and the change vs ~4 weeks earlier (null when there's nothing to compare). */
  current: number;
  change: number | null;
  /** Up to the last 12 e1RMs (or best reps for bodyweight), oldest first. */
  trend: number[];
  bodyweight: boolean;
};

/** The lifts worth charting: done at least twice, most-trained recently first. */
export function topLifts(sessions: Map<string, LiftSession[]>, now: number, limit = 8): LiftSummary[] {
  const out: (LiftSummary & { recent: number })[] = [];
  for (const [exerciseId, list] of sessions) {
    if (!list.length) continue;
    const bodyweight = list.every((s) => s.topWeight === 0);
    const metric = (s: LiftSession) => (bodyweight ? s.bestReps : s.e1rm);
    const last = list[list.length - 1];
    const cutoff = new Date(last.at).getTime() - 25 * DAY;
    const earlier = [...list].reverse().find((s) => new Date(s.at).getTime() <= cutoff);
    const recent = list.filter((s) => now - new Date(s.at).getTime() <= 90 * DAY).length;
    out.push({
      exerciseId,
      sessions: list.length,
      lastAt: last.at,
      current: metric(last),
      change: earlier ? metric(last) - metric(earlier) : list.length > 1 ? metric(last) - metric(list[0]) : null,
      trend: list.slice(-12).map(metric),
      bodyweight,
      recent,
    });
  }
  return out
    .filter((l) => l.sessions >= 2 || out.length <= limit)
    .sort((a, b) => b.recent - a.recent || b.sessions - a.sessions || b.lastAt.localeCompare(a.lastAt))
    .slice(0, limit)
    .map((l) => {
      const { recent, ...rest } = l;
      void recent;
      return rest;
    });
}

// ---------------------------------------------------------------------------
// Calendar weeks
// ---------------------------------------------------------------------------

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Local midnight on the Sunday that starts the week containing `t`. */
export function weekStart(t: number | Date) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

// ---------------------------------------------------------------------------
// Weekly sets per muscle
// ---------------------------------------------------------------------------

export type MuscleSet = { at: string; type: SetType; muscles: { muscle_id: string; role: "primary" | "secondary" }[] };

/** Hard sets per muscle for the week starting `start` (primary 1, secondary 0.5). */
export function weeklySets(sets: MuscleSet[], start: Date): Map<string, number> {
  const from = start.getTime();
  const to = addDays(start, 7).getTime();
  const out = new Map<string, number>();
  for (const s of sets) {
    if (s.type === "warmup") continue;
    const t = new Date(s.at).getTime();
    if (t < from || t >= to) continue;
    for (const m of s.muscles) out.set(m.muscle_id, (out.get(m.muscle_id) ?? 0) + (m.role === "primary" ? 1 : 0.5));
  }
  return out;
}

/**
 * A rough weekly target range of hard sets for a muscle you're training, by goal. Guidelines to aim at,
 * not rules: research on muscle growth points to about 10–20 sets a week; less is plenty for strength
 * and general fitness. Small muscles that get lots of indirect work need less.
 */
export function weeklyTarget(goal: Goal, size: "small" | "medium" | "large"): [number, number] {
  const base: Record<Goal, [number, number]> = { hypertrophy: [10, 20], strength: [6, 15], fat_loss: [8, 16], general: [6, 12] };
  const [lo, hi] = base[goal];
  return size === "small" ? [Math.round(lo * 0.6), Math.round(hi * 0.8)] : [lo, hi];
}

// ---------------------------------------------------------------------------
// Cardio
// ---------------------------------------------------------------------------

export type CardioEntry = { at: string; type: CardioType; durationSec: number; distance: number | null };

export type CardioWeek = { start: Date; minutes: number; distance: number; sessions: number };

/** Minutes, miles and sessions for each of the last `weeks` weeks (oldest first, this week last). */
export function cardioWeeks(cardio: CardioEntry[], now: number, weeks = 8): CardioWeek[] {
  const first = addDays(weekStart(now), -7 * (weeks - 1));
  const out: CardioWeek[] = Array.from({ length: weeks }, (_, i) => ({ start: addDays(first, 7 * i), minutes: 0, distance: 0, sessions: 0 }));
  // Matched by the Sunday's date, so daylight-saving weeks (167 or 169 hours) land in the right place.
  const index = new Map(out.map((w, i) => [dateKey(w.start), i]));
  for (const c of cardio) {
    const k = index.get(dateKey(weekStart(new Date(c.at))));
    if (k === undefined) continue;
    out[k].minutes += c.durationSec / 60;
    out[k].distance += c.distance ?? 0;
    out[k].sessions += 1;
  }
  return out;
}

/** Totals by cardio type since `since` (ms), biggest first. */
export function cardioByType(cardio: CardioEntry[], since: number) {
  const map = new Map<CardioType, { type: CardioType; minutes: number; distance: number; sessions: number }>();
  for (const c of cardio) {
    if (new Date(c.at).getTime() < since) continue;
    const cur = map.get(c.type) ?? { type: c.type, minutes: 0, distance: 0, sessions: 0 };
    cur.minutes += c.durationSec / 60;
    cur.distance += c.distance ?? 0;
    cur.sessions += 1;
    map.set(c.type, cur);
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes);
}

// ---------------------------------------------------------------------------
// Consistency calendar
// ---------------------------------------------------------------------------

export type DayKind = "lift" | "cardio" | "both" | null;
export type CalendarDay = { key: string; date: Date; kind: DayKind; future: boolean };

/** `weeks` columns of Sunday–Saturday, oldest first, ending with this week. */
export function activityCalendar(liftDays: Iterable<string>, cardioDays: Iterable<string>, now: number, weeks = 16): CalendarDay[][] {
  const lifts = new Set(liftDays);
  const cardio = new Set(cardioDays);
  const today = dateKey(new Date(now));
  const first = addDays(weekStart(now), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(first, w * 7 + d);
      const key = dateKey(date);
      const l = lifts.has(key);
      const c = cardio.has(key);
      return { key, date, kind: l && c ? "both" : l ? "lift" : c ? "cardio" : null, future: key > today };
    }),
  );
}

/** Days trained in each week of the calendar. */
export const daysPerWeek = (cal: CalendarDay[][]) => cal.map((w) => w.filter((d) => d.kind).length);

/**
 * Weeks in a row that hit the goal. This week counts once it's met; until then the streak runs
 * through last week, so an unfinished week never breaks it.
 */
export function weekStreak(perWeek: number[], goal: number) {
  const need = Math.max(1, goal);
  let i = perWeek.length - 1;
  let streak = 0;
  if (i >= 0 && perWeek[i] >= need) streak++;
  i--;
  for (; i >= 0 && perWeek[i] >= need; i--) streak++;
  return streak;
}

// ---------------------------------------------------------------------------
// Bodyweight
// ---------------------------------------------------------------------------

export type WeightEntry = { date: string; bodyweight: number };

export type WeightTrend = {
  points: { date: string; value: number; avg: number }[];
  latest: WeightEntry | null;
  /** Change in the 7-day average over the last 30 days (lb), when there's enough data. */
  change30: number | null;
};

/** Entries oldest first, each with a 7-day rolling average (the average smooths out day-to-day water weight). */
export function weightTrend(entries: WeightEntry[]): WeightTrend {
  const list = entries.filter((e) => e.bodyweight > 0).sort((a, b) => a.date.localeCompare(b.date));
  const day = (k: string) => new Date(`${k}T12:00:00`).getTime();
  const points = list.map((e, i) => {
    const from = day(e.date) - 6 * DAY;
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0 && day(list[j].date) >= from; j--) {
      sum += list[j].bodyweight;
      n++;
    }
    return { date: e.date, value: e.bodyweight, avg: sum / n };
  });
  const last = points[points.length - 1];
  let change30: number | null = null;
  if (last) {
    const target = day(last.date) - 30 * DAY;
    // The entry closest to 30 days before (up to 3 days later or 2 weeks earlier).
    let before: (typeof points)[number] | null = null;
    for (const p of points) {
      const t = day(p.date);
      if (t > target + 3 * DAY || t < target - 14 * DAY) continue;
      if (!before || Math.abs(t - target) < Math.abs(day(before.date) - target)) before = p;
    }
    if (before && before.date !== last.date) change30 = last.avg - before.avg;
  }
  return { points, latest: list.length ? list[list.length - 1] : null, change30 };
}
