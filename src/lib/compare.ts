import { slotRows } from "./set-slots";
import { bestE1rm, PR_MARGIN } from "./progress";
import { formatMax, formatWeight, toDisplayWeight, volumeBy, volumeLb, weightUnit } from "./units";
import type { SetType, Units } from "./db/types";

/*
  "How did today go vs last time?" (UX spec Part 3.1), shared by the Finish sheet, the saved-workout screen and
  Today's "Done for today" card so all three agree. Pure: callers load the rows, this does the maths.

  Previous workout P: the latest finished workout before this one with the same plan day; if none, the same name.
  Each lift is compared with its sets in P, or (if it wasn't in P) with its own last session. Per lift, the first
  rule that applies: top weight up / down, then a planned set skipped (or fewer logged than planned), then total
  reps over the sets both sessions have. Bodyweight lifts skip the weight rules.
*/

export type CmpWorkout = { id: string; name: string | null; plan_day_id: string | null; started_at: string; ended_at: string | null };
export type CmpWex = { id: string; workout_id: string; exercise_id: string; sort_order: number; target_sets: number | null; skipped_sets?: number[] };
export type CmpSet = { workout_exercise_id: string; set_no: number; type: SetType; weight: number | null; reps: number | null };

/** Everything about one exercise before this workout: its last session and its bests. */
export type LiftHistory = { last: CmpSet[]; lastDate: string | null; bestWeight: number; best1RM: number };

export type RowKind = "up" | "down" | "skipped" | "same" | "first";
export type CompareRow = {
  wexId: string;
  exerciseId: string;
  kind: RowKind;
  /** "▲ +10 lb", "▼ −2 reps", "Set 3 skipped", "= Same", "First time". */
  delta: string;
  record: LiftRecord | null;
  /** Best set today, "45 × 10" (the baseline card shows it). */
  best: string;
};
export type LiftRecord = { wexId: string; exerciseId: string; kind: "weight" | "e1rm"; text: string };

export type Totals = { volumeLb: number; sets: number; durationSec: number };

export type Comparison = {
  previous: CmpWorkout | null;
  rows: CompareRow[];
  /** Lifts compared (not first time). */
  compared: number;
  up: number;
  same: number;
  /** Down or with skipped sets. */
  down: number;
  records: LiftRecord[];
  /** Σ volume today − Σ volume last time, over the compared lifts only (pounds). */
  sameLiftsDelta: number;
  totals: { today: Totals; last: Totals | null };
};

const counts = (s: CmpSet) => s.type !== "warmup";

/** The workout to compare against: same plan day first, else same name (case-insensitive). */
export function findPrevious<W extends CmpWorkout>(workout: CmpWorkout, candidates: W[]): W | null {
  const before = candidates
    .filter((w) => w.id !== workout.id && w.ended_at && w.started_at < workout.started_at)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  if (workout.plan_day_id) {
    const same = before.find((w) => w.plan_day_id === workout.plan_day_id);
    if (same) return same;
  }
  const name = workout.name?.trim().toLowerCase();
  return name ? (before.find((w) => w.name?.trim().toLowerCase() === name) ?? null) : null;
}

/**
 * Each exercise's last session and bests from finished workouts that started before `beforeIso`.
 * (useExerciseHistory looks at all history, which is wrong when reopening an old workout.)
 */
export function historyBefore(beforeIso: string, workouts: CmpWorkout[], wexs: CmpWex[], sets: CmpSet[], excludeWorkoutId?: string): Map<string, LiftHistory> {
  const byId = new Map(workouts.map((w) => [w.id, w]));
  const setsBy = new Map<string, CmpSet[]>();
  for (const s of sets) setsBy.set(s.workout_exercise_id, [...(setsBy.get(s.workout_exercise_id) ?? []), s]);
  const out = new Map<string, LiftHistory>();
  const usable = wexs
    .filter((x) => x.workout_id !== excludeWorkoutId)
    .filter((x) => {
      const w = byId.get(x.workout_id);
      return Boolean(w?.ended_at && w.started_at < beforeIso);
    })
    .sort((a, b) => byId.get(b.workout_id)!.started_at.localeCompare(byId.get(a.workout_id)!.started_at));
  for (const x of usable) {
    const list = [...(setsBy.get(x.id) ?? [])].sort((a, b) => a.set_no - b.set_no);
    const h = out.get(x.exercise_id) ?? { last: [], lastDate: null, bestWeight: 0, best1RM: 0 };
    if (!h.lastDate && list.length) {
      h.last = list;
      h.lastDate = byId.get(x.workout_id)!.started_at;
    }
    for (const s of list) if (counts(s) && s.weight && s.reps) h.bestWeight = Math.max(h.bestWeight, s.weight);
    h.best1RM = Math.max(h.best1RM, bestE1rm(list));
    out.set(x.exercise_id, h);
  }
  return out;
}

/** "45 × 10, 9, 8" (repeats the weight only when it changes); "BW × 12, 10". */
export function setsLine(sets: CmpSet[], units: Units) {
  const parts: string[] = [];
  let last: number | null | undefined;
  for (const s of sets.filter(counts)) {
    const reps = s.reps ?? "—";
    if (s.weight === last) parts[parts.length - 1] += `, ${reps}`;
    else parts.push(`${s.weight === null ? "BW" : formatWeight(s.weight, units)} × ${reps}`);
    last = s.weight;
  }
  return parts.join(" · ");
}

const fmtSigned = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
const round2 = (n: number) => Math.round(n * 100) / 100;

function bestSet(sets: CmpSet[], units: Units) {
  const top = [...sets].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || (b.reps ?? 0) - (a.reps ?? 0))[0];
  return top ? `${top.weight === null ? "BW" : formatWeight(top.weight, units)} × ${top.reps ?? "—"}` : "";
}

export function compareWorkout(args: {
  workout: CmpWorkout;
  /** Today's exercises, in workout order. */
  wexs: CmpWex[];
  sets: CmpSet[];
  /** P and its rows (null when there's no previous workout). */
  previous: { workout: CmpWorkout; wexs: CmpWex[]; sets: CmpSet[] } | null;
  /** Each exercise's history before this workout (see historyBefore). */
  history: Map<string, LiftHistory>;
  isBodyweight: (exerciseId: string) => boolean;
  /** Dumbbell-in-each-hand lifts: their volume counts both dumbbells. */
  isPerHand?: (exerciseId: string) => boolean;
  isCardio: (exerciseId: string) => boolean;
  units: Units;
  /** Seconds this workout has run (the live sheet passes the running clock). */
  durationSec: number;
  names?: (exerciseId: string) => string;
}): Comparison {
  const { wexs, sets, previous, history, isBodyweight, isCardio, units, durationSec } = args;
  const unit = weightUnit(units);
  const setsOf = (all: CmpSet[], wexId: string) => all.filter((s) => s.workout_exercise_id === wexId).sort((a, b) => a.set_no - b.set_no);

  const rows: CompareRow[] = [];
  const records: LiftRecord[] = [];
  let sameLiftsDelta = 0;

  for (const w of wexs) {
    if (isCardio(w.exercise_id)) continue;
    const all = setsOf(sets, w.id);
    const today = all.filter(counts);
    if (!today.length) continue;

    // Previous sets: this exercise in P, else its own last session before today.
    const inP = previous ? previous.wexs.filter((x) => x.exercise_id === w.exercise_id).flatMap((x) => setsOf(previous.sets, x.id)) : [];
    const prev = (inP.length ? inP : (history.get(w.exercise_id)?.last ?? [])).filter(counts);

    // Records: heaviest ever, else best estimated max (+0.5), vs everything before today. None on a first session.
    const h = history.get(w.exercise_id);
    let record: LiftRecord | null = null;
    const loaded = today.filter((s) => s.weight && s.reps);
    if (h && loaded.length && (h.bestWeight > 0 || h.best1RM > 0)) {
      const top = Math.max(...loaded.map((s) => s.weight!));
      const top1 = bestE1rm(loaded);
      const name = args.names?.(w.exercise_id) ?? w.exercise_id;
      if (top > h.bestWeight) record = { wexId: w.id, exerciseId: w.exercise_id, kind: "weight", text: `${name}: heaviest ever, ${formatWeight(top, units)} ${unit}` };
      else if (top1 >= h.best1RM * PR_MARGIN) record = { wexId: w.id, exerciseId: w.exercise_id, kind: "e1rm", text: `${name}: best estimated max, ${formatMax(top1, units)} ${unit}` };
    }
    if (record) records.push(record);

    const best = bestSet(today, units);
    if (!prev.length) {
      rows.push({ wexId: w.id, exerciseId: w.exercise_id, kind: "first", delta: "First time", record, best });
      continue;
    }

    sameLiftsDelta += (volumeLb(today) - volumeLb(prev)) * (args.isPerHand?.(w.exercise_id) ? 2 : 1);
    const bw = isBodyweight(w.exercise_id) || [...today, ...prev].every((s) => s.weight === null);
    const topToday = Math.max(...today.map((s) => toDisplayWeight(s.weight ?? 0, units)));
    const topPrev = Math.max(...prev.map((s) => toDisplayWeight(s.weight ?? 0, units)));
    const target = w.target_sets ?? 3;
    const missing = slotRows(all, target, w.skipped_sets ?? []).filter((r) => (r.kind === "skipped" || r.kind === "planned" || (r.kind === "next" && !r.extra)) && r.slot <= target);

    let kind: RowKind;
    let delta: string;
    if (!bw && round2(topToday - topPrev) > 0) {
      kind = "up";
      delta = `▲ +${round2(topToday - topPrev)} ${unit}`;
    } else if (!bw && round2(topToday - topPrev) < 0) {
      kind = "down";
      delta = `▼ −${round2(topPrev - topToday)} ${unit}`;
    } else if (missing.length) {
      kind = "skipped";
      delta = missing.length === 1 ? `Set ${(missing[0] as { slot: number }).slot} skipped` : `${missing.length} sets skipped`;
    } else {
      const n = Math.min(today.length, prev.length);
      const reps = (list: CmpSet[]) => list.slice(0, n).reduce((a, s) => a + (s.reps ?? 0), 0);
      const d = reps(today) - reps(prev);
      kind = d > 0 ? "up" : d < 0 ? "down" : "same";
      delta = d === 0 ? "= Same" : `${d > 0 ? "▲" : "▼"} ${fmtSigned(d)} reps`;
    }
    rows.push({ wexId: w.id, exerciseId: w.exercise_id, kind, delta, record, best });
  }

  const perHand = args.isPerHand ?? (() => false);
  const totalsOf = (list: CmpSet[], lifts: CmpWex[], dur: number): Totals => ({ volumeLb: volumeBy(list, lifts, perHand), sets: list.filter(counts).length, durationSec: dur });
  const prevDur = previous?.workout.ended_at ? (new Date(previous.workout.ended_at).getTime() - new Date(previous.workout.started_at).getTime()) / 1000 : 0;
  const compared = rows.filter((r) => r.kind !== "first");
  return {
    previous: previous?.workout ?? null,
    rows,
    compared: compared.length,
    up: compared.filter((r) => r.kind === "up").length,
    same: compared.filter((r) => r.kind === "same").length,
    down: compared.filter((r) => r.kind === "down" || r.kind === "skipped").length,
    records,
    sameLiftsDelta,
    totals: { today: totalsOf(sets, wexs, durationSec), last: previous ? totalsOf(previous.sets, previous.wexs, prevDur) : null },
  };
}

/** "Nov 9" */
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "+110 lb" / "−60 lb" in display units, or null at 0. */
/**
 * The live "New PR" toast: does the set just logged make a record, by the same rules as compareWorkout (heaviest
 * ever, else a best estimated max 2.5% up), and beat every earlier set of this exercise today? The second check means
 * the toast fires when a record is set or raised, not again for each set that ties it. None on a first session.
 */
export function setRecord(
  history: Pick<LiftHistory, "bestWeight" | "best1RM"> | undefined,
  earlierToday: Pick<CmpSet, "type" | "weight" | "reps">[],
  set: Pick<CmpSet, "type" | "weight" | "reps">,
): { kind: "weight" | "e1rm"; value: number } | null {
  if (!history || (history.bestWeight <= 0 && history.best1RM <= 0)) return null;
  if (set.type === "warmup" || !set.weight || !set.reps) return null;
  const before = earlierToday.filter((s) => s.type !== "warmup" && s.weight && s.reps);
  const topBefore = Math.max(0, ...before.map((s) => s.weight!));
  if (set.weight > history.bestWeight && set.weight > topBefore) return { kind: "weight", value: set.weight };
  if (set.weight > history.bestWeight) return null; // a heavier record is already set today; this set adds nothing
  const e = bestE1rm([set]);
  if (e >= history.best1RM * PR_MARGIN && e > bestE1rm(before)) return { kind: "e1rm", value: e };
  return null;
}

export function volumeDeltaText(lb: number, units: Units) {
  const v = Math.round(toDisplayWeight(Math.abs(lb), units));
  if (v === 0) return null;
  return `${lb > 0 ? "+" : "−"}${v.toLocaleString("en-US")} ${weightUnit(units)}`;
}

/* ---- Things not started (finish() deletes empty exercises, so the Finish step writes them down first). ---- */

export type FinishNote = { at: string; notStarted: { exercise_id: string; name: string; sets: number }[] };
export type FinishNotes = Record<string, FinishNote>;
export const FINISH_NOTES_KEY = "finish_notes";
const KEEP_NOTES = 30;

/** Adds one workout's note and keeps the newest 30. */
export function addFinishNote(notes: FinishNotes | undefined, workoutId: string, note: FinishNote): FinishNotes {
  const all = { ...(notes ?? {}), [workoutId]: note };
  return Object.fromEntries(Object.entries(all).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, KEEP_NOTES));
}
