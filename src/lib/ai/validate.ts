import type { Goal } from "@/lib/db/types";
import type { AiDay, AiImport, AiItem, AiPick, AiPlan, AiWorkout, AllowedExercise, ImportLine, ImportMatch } from "./types";

/*
  Checks what Claude sends back before anyone sees it. Every exercise must come from the list it was given
  (so it can't invent exercises or use equipment you don't have), and every number must be sensible.
  Each check returns a cleaned-up result plus a list of problems; the server sends the problems back to
  Claude once to fix, then shows the cleaned result (with anything invalid dropped).
*/

export const GOALS: Goal[] = ["strength", "hypertrophy", "fat_loss", "general"];
export const MAX_DAYS = 7;
export const MAX_ITEMS = 14;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
/**
 * Free text shown to the person (summary, progression). Over the limit, it's cut at the last full sentence
 * that fits, never mid-sentence ("...records on the main lifts and").
 */
export function prose(v: unknown, max: number): string {
  const t = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), /[.!?]$/.test(cut) ? cut.length - 1 : -1);
  return end > max * 0.4 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "")}…`;
}
const num = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const int = (v: unknown) => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const textOrNull = (v: unknown, max: number) => str(v, max) || null;

/** Superset groups as 1, 2, 3… in order; a "superset" of one is just a normal exercise. */
export function normalizeSupersets<T extends { superset_group: number | null }>(items: T[]): T[] {
  const counts = new Map<number, number>();
  for (const i of items) if (i.superset_group !== null) counts.set(i.superset_group, (counts.get(i.superset_group) ?? 0) + 1);
  const renumber = new Map<number, number>();
  return items.map((i) => {
    const g = i.superset_group;
    if (g === null || (counts.get(g) ?? 0) < 2) return { ...i, superset_group: null };
    if (!renumber.has(g)) renumber.set(g, renumber.size + 1);
    return { ...i, superset_group: renumber.get(g)! };
  });
}

/** "20 min" (plus an optional note) is how cardio is stored in a plan. */
export const cardioNote = (minutes: number, note?: string | null) => `${minutes} min${note ? ` · ${note}` : ""}`;

export function checkItems(raw: unknown, allow: Map<string, AllowedExercise>, where: string, errors: string[]): AiItem[] {
  if (!Array.isArray(raw)) {
    errors.push(`${where}: "exercises" must be a list.`);
    return [];
  }
  const out: AiItem[] = [];
  const seen = new Set<string>();
  raw.forEach((r, i) => {
    const at = `${where}, exercise ${i + 1}`;
    if (!isObj(r)) {
      errors.push(`${at}: not an object.`);
      return;
    }
    const id = str(r.exercise_id, 120);
    const ex = allow.get(id);
    if (!ex) {
      errors.push(`${at}: "${id || "(blank)"}" is not an exercise_id from the EXERCISES list. Use one of the listed ids exactly.`);
      return;
    }
    if (seen.has(id)) {
      errors.push(`${at}: ${ex.name} appears twice in the same day. Use it once.`);
      return;
    }
    seen.add(id);
    const note = textOrNull(r.notes, 120);
    const group = int(r.superset_group);
    const superset_group = group !== null && group > 0 ? group : null;

    if (ex.type === "cardio") {
      let minutes = int(r.minutes);
      if (minutes === null || minutes < 5 || minutes > 120) {
        errors.push(`${at}: ${ex.name} is cardio, so give "minutes" between 5 and 120.`);
        minutes = clamp(minutes ?? 20, 5, 120);
      }
      out.push({ exercise_id: id, sets: 1, rep_min: null, rep_max: null, rest_sec: null, superset_group: null, notes: cardioNote(minutes, note) });
      return;
    }

    let sets = int(r.sets);
    if (sets === null || sets < 1 || sets > 10) {
      errors.push(`${at}: sets must be 1–10 (got ${String(r.sets)}).`);
      sets = clamp(sets ?? 3, 1, 10);
    }
    let lo = int(r.rep_min);
    let hi = int(r.rep_max);
    if (lo === null && hi !== null) lo = hi;
    if (hi === null && lo !== null) hi = lo;
    if (lo === null || hi === null || lo < 1 || hi > 100) {
      errors.push(`${at}: rep_min and rep_max must be 1–100 (for timed holds, use seconds and say so in notes).`);
      lo = clamp(lo ?? 8, 1, 100);
      hi = clamp(hi ?? 12, 1, 100);
    }
    if (lo > hi) [lo, hi] = [hi, lo];
    let rest = int(r.rest_sec);
    if (rest !== null && (rest < 0 || rest > 600)) {
      errors.push(`${at}: rest_sec must be 0–600.`);
      rest = clamp(rest, 0, 600);
    }
    out.push({ exercise_id: id, sets, rep_min: lo, rep_max: hi, rest_sec: rest ?? (ex.type === "compound" ? 120 : 60), superset_group, notes: note });
  });
  if (out.length > MAX_ITEMS) errors.push(`${where}: at most ${MAX_ITEMS} exercises.`);
  return normalizeSupersets(out.slice(0, MAX_ITEMS));
}

export function checkPlan(
  raw: unknown,
  allow: Map<string, AllowedExercise>,
  opts: { fallbackGoal: Goal; fallbackWeeks: number; dayIds?: Set<string> },
): { plan: AiPlan; errors: string[] } {
  const errors: string[] = [];
  const r = isObj(raw) ? raw : {};
  if (!isObj(raw)) errors.push("The answer must be an object with name, goal, weeks, summary, progression and days.");
  const name = str(r.name, 60);
  if (!name) errors.push(`"name" is missing.`);
  const goal = GOALS.includes(r.goal as Goal) ? (r.goal as Goal) : opts.fallbackGoal;
  if (r.goal !== undefined && goal !== r.goal) errors.push(`"goal" must be one of ${GOALS.join(", ")}.`);
  let weeks = int(r.weeks);
  if (weeks === null || weeks < 1 || weeks > 52) {
    if (r.weeks !== undefined) errors.push(`"weeks" must be 1–52.`);
    weeks = opts.fallbackWeeks;
  }
  const rawDays = Array.isArray(r.days) ? r.days : [];
  if (!rawDays.length) errors.push(`"days" must list at least one training day.`);
  if (rawDays.length > MAX_DAYS) errors.push(`At most ${MAX_DAYS} days (one week; the week repeats).`);
  const usedRefs = new Set<string>();
  const days: AiDay[] = [];
  rawDays.slice(0, MAX_DAYS).forEach((d, i) => {
    const o = isObj(d) ? d : {};
    const dayName = str(o.name, 40) || `Day ${i + 1}`;
    if (!str(o.name, 40)) errors.push(`Day ${i + 1} needs a name.`);
    const where = `Day ${i + 1} (${dayName})`;
    const items = checkItems(o.exercises, allow, where, errors);
    if (!items.length) {
      errors.push(`${where} has no valid exercises.`);
      return;
    }
    const ref = str(o.ref_day_id, 64);
    const ref_day_id = ref && opts.dayIds?.has(ref) && !usedRefs.has(ref) ? ref : null;
    if (ref_day_id) usedRefs.add(ref_day_id);
    days.push({ name: dayName, ref_day_id, items });
  });
  const changes = Array.isArray(r.changes) ? r.changes.map((c) => str(c, 160)).filter(Boolean).slice(0, 12) : [];
  return {
    plan: { name: name || "AI plan", goal, weeks, summary: prose(r.summary, 900), progression: prose(r.progression, 1200), days, changes },
    errors,
  };
}

export function checkWorkout(raw: unknown, allow: Map<string, AllowedExercise>): { workout: AiWorkout; errors: string[] } {
  const errors: string[] = [];
  const r = isObj(raw) ? raw : {};
  if (!isObj(raw)) errors.push("The answer must be an object with name, summary and exercises.");
  const name = str(r.name, 40);
  if (!name) errors.push(`"name" is missing.`);
  const items = checkItems(r.exercises, allow, "The workout", errors);
  if (!items.length) errors.push("The workout needs at least one valid exercise.");
  return { workout: { name: name || "AI workout", summary: prose(r.summary, 400), items }, errors };
}

/**
 * Imports keep every line (even ones Claude couldn't place), because the review screen lets you
 * pick the right exercise. Only the structure and numbers are checked here.
 */
export function checkImport(raw: unknown, allow: Map<string, AllowedExercise>): { result: AiImport; errors: string[] } {
  const errors: string[] = [];
  const r = isObj(raw) ? raw : {};
  if (!isObj(raw) || !Array.isArray(r.days)) errors.push(`The answer must be an object with a "days" list (empty if nothing could be read).`);
  const days: AiImport["days"] = [];
  (Array.isArray(r.days) ? r.days : []).slice(0, 10).forEach((d, i) => {
    const o = isObj(d) ? d : {};
    const lines: ImportLine[] = [];
    (Array.isArray(o.exercises) ? o.exercises : []).slice(0, 20).forEach((x) => {
      if (!isObj(x)) return;
      const written = str(x.written, 80) || str(x.standard_name, 80);
      if (!written) return;
      const id = str(x.exercise_id, 120);
      const ex = allow.get(id);
      const is_cardio = ex ? ex.type === "cardio" : x.is_cardio === true;
      const match: ImportMatch = ex ? (x.match === "exact" ? "exact" : "close") : "none";
      const minutes = int(x.minutes);
      let lo = int(x.rep_min);
      let hi = int(x.rep_max);
      if (lo === null) lo = hi;
      if (hi === null) hi = lo;
      if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
      const note = textOrNull(x.notes, 120);
      lines.push({
        written,
        standard_name: str(x.standard_name, 80) || written,
        exercise_id: ex ? id : null,
        match,
        is_cardio,
        sets: is_cardio ? 1 : clamp(int(x.sets) ?? 3, 1, 10),
        rep_min: is_cardio || lo === null ? null : clamp(lo, 1, 100),
        rep_max: is_cardio || hi === null ? null : clamp(hi, 1, 100),
        rest_sec: is_cardio ? null : (() => {
          const v = int(x.rest_sec);
          return v === null ? null : clamp(v, 0, 600);
        })(),
        superset_group: is_cardio ? null : (() => {
          const g = int(x.superset_group);
          return g !== null && g > 0 ? g : null;
        })(),
        notes: is_cardio ? cardioNote(clamp(minutes ?? 20, 5, 120), note) : note,
      });
    });
    if (lines.length) days.push({ name: str(o.name, 40) || `Day ${i + 1}`, lines: normalizeSupersets(lines) });
  });
  const goal = GOALS.includes(r.goal as Goal) ? (r.goal as Goal) : null;
  const weeks = int(r.weeks);
  return {
    result: {
      name: str(r.name, 60) || "Imported plan",
      goal,
      weeks: weeks !== null && weeks >= 1 && weeks <= 52 ? weeks : null,
      summary: prose(r.summary, 900),
      progression: prose(r.progression, 1200),
      days,
      problems: textOrNull(r.problems, 400),
    },
    errors,
  };
}

/** Swap / suggest picks: ids from the candidate list only, no repeats, nothing already in the workout. */
export function checkPicks(raw: unknown, allow: Map<string, AllowedExercise>, opts: { exclude: Set<string>; max: number }): { picks: AiPick[]; errors: string[] } {
  const errors: string[] = [];
  const list = isObj(raw) && Array.isArray(raw.picks) ? raw.picks : null;
  if (!list) return { picks: [], errors: ['Return {"picks": [...]} by calling the tool.'] };
  const picks: AiPick[] = [];
  list.forEach((r, i) => {
    if (!isObj(r)) return errors.push(`Pick ${i + 1}: not an object.`);
    const id = str(r.exercise_id, 120);
    if (!allow.has(id)) return errors.push(`Pick ${i + 1}: "${id}" isn't in the CANDIDATES list. Use ids from that list only.`);
    if (opts.exclude.has(id)) return errors.push(`Pick ${i + 1}: "${id}" is already in today's workout (or is the exercise being replaced).`);
    if (picks.some((p) => p.exercise_id === id)) return errors.push(`Pick ${i + 1}: "${id}" is listed twice.`);
    picks.push({ exercise_id: id, reason: str(r.reason, 110) });
  });
  if (picks.length > opts.max) picks.length = opts.max;
  if (!picks.length && !errors.length) errors.push("Return at least one pick.");
  return { picks, errors };
}
