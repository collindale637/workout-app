import type { Exercise } from "@/lib/db/types";
import type { ImportLine } from "./types";

/*
  Matches imported exercise names to the library (plan doc → "Import review screen").
  Each line ends up as:
    matched   → confirmed automatically
    unsure    → pick from the top 3 suggestions
    not found → choose an exercise or create a custom one
  Signals: the exact name or an alias, common gym shorthand ("RDL", "DB"), word overlap, and Claude's own pick.
*/

export type MatchStatus = "matched" | "unsure" | "missing";
export type LineMatch = { status: MatchStatus; exerciseId: string | null; candidates: string[] };

const SHORTHAND: Record<string, string> = {
  rdl: "romanian deadlift", sldl: "stiff legged deadlift", ohp: "overhead press", bss: "bulgarian split squat",
  cgbp: "close grip bench press", db: "dumbbell", dbs: "dumbbell", bb: "barbell", kb: "kettlebell", ez: "ez bar",
  sl: "single leg", sa: "single arm", ghr: "glute ham raise", bw: "bodyweight", sm: "smith",
  pullup: "pull up", pullups: "pull up", chinup: "chin up", chinups: "chin up",
  pushup: "push up", pushups: "push up", situp: "sit up", skullcrusher: "skull crusher", skullcrushers: "skull crusher",
  flye: "fly", flyes: "fly", flies: "fly", presses: "press", crunches: "crunch",
  tricep: "triceps", bicep: "biceps", delts: "delt", rev: "reverse",
};

/**
  Search box: "db press" → "dumbbell press", "ohp" → "overhead press". Two-letter shorthand that is also the start of
  real words people type ("sl" → sled, slider) is left alone, since the search runs while typing.
*/
const TYPING_AMBIGUOUS = new Set(["sl", "sa", "sm", "rev"]);
export function expandQueryWords(words: string[]): string[] {
  return words.flatMap((w) => {
    const long = TYPING_AMBIGUOUS.has(w) ? undefined : SHORTHAND[w];
    // "tricep" → "triceps" would only narrow a substring search ("Band Tricep Pushdown" has no "triceps"), so keep it as typed.
    return long && !long.includes(w) ? long.split(" ") : [w];
  });
}

/** Plurals whose singular isn't just the word minus "s" ("calves" → "Calf Raise"). */
const IRREGULAR: Record<string, string> = { calves: "calf" };

/**
  Search box: each typed word becomes the forms it can take in a name or alternate name. As typed or as shorthand
  spelled out ("db" → dumbbell), or its singular ("curls" → curl, "farmers" → Farmer's). Hyphens split words, so
  "pull-up" finds "Pullups" and "Pull-Up".
*/
export function searchTerms(q: string): string[][][] {
  return q
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => {
      const forms = [expandQueryWords([w])];
      const one = IRREGULAR[w] ?? singular(w);
      if (one !== w) forms.push([one]);
      return forms;
    });
}

/** True when every typed word shows up (in one of its forms) in the text: name plus alternate names. */
export function matchesSearch(text: string, terms: string[][][]): boolean {
  const hay = text.toLowerCase();
  return terms.every((forms) => forms.some((parts) => parts.every((p) => hay.includes(p))));
}

/** Words that don't help tell exercises apart. */
const STOP = new Set(["the", "a", "with", "and", "on", "of", "to", "x", "version", "exercise", "medium", "grip", "-"]);

export function normalize(name: string): string[] {
  const words = name
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    const expanded = SHORTHAND[w] ?? w;
    for (const x of expanded.split(" ")) if (!STOP.has(x) && !/^\d+$/.test(x)) out.push(singular(x));
  }
  return out;
}

/** "pulldowns" → "pulldown", but leave "press", "abs", "biceps" alone-ish (both sides get the same treatment). */
const singular = (w: string) => (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w);

const key = (name: string) => normalize(name).join(" ");

function similarity(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  // Dice coefficient: forgiving of an extra word on either side ("Barbell Bench Press" vs "Bench Press").
  return (2 * inter) / (sa.size + sb.size);
}

export type MatchIndex = { exercises: Exercise[]; byKey: Map<string, string>; words: Map<string, string[][]> };

export function buildMatchIndex(exercises: Exercise[]): MatchIndex {
  const active = exercises.filter((e) => e.is_active);
  const byKey = new Map<string, string>();
  const words = new Map<string, string[][]>();
  // Common and custom exercises win ties on exact names.
  const ordered = [...active].sort((a, b) => rank(a) - rank(b));
  for (const e of ordered) {
    const names = [e.name, ...e.aliases, e.id.replace(/_/g, " ")];
    words.set(e.id, names.map(normalize));
    for (const n of names) {
      const k = key(n);
      if (k && !byKey.has(k)) byKey.set(k, e.id);
    }
  }
  return { exercises: ordered, byKey, words };
}

const rank = (e: Exercise) => (e.owner_id ? 0 : e.is_common ? 1 : 2);

/** The closest library exercises to a name, best first. */
export function rankByName(index: MatchIndex, names: string[], limit = 3): { id: string; score: number }[] {
  const queries = names.map(normalize).filter((q) => q.length);
  if (!queries.length) return [];
  const scored: { id: string; score: number }[] = [];
  for (const e of index.exercises) {
    const forms = index.words.get(e.id) ?? [];
    let best = 0;
    for (const q of queries) for (const f of forms) best = Math.max(best, similarity(q, f));
    if (best > 0) scored.push({ id: e.id, score: best - rank(e) * 0.04 });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function matchLine(index: MatchIndex, line: Pick<ImportLine, "written" | "standard_name" | "exercise_id" | "match">): LineMatch {
  const exact = index.byKey.get(key(line.written)) ?? index.byKey.get(key(line.standard_name));
  const ranked = rankByName(index, [line.written, line.standard_name], 4);
  const guess = line.exercise_id && index.words.has(line.exercise_id) ? line.exercise_id : null;
  const candidates = [...new Set([exact, guess, ...ranked.map((r) => r.id)].filter((x): x is string => Boolean(x)))].slice(0, 3);
  if (exact) return { status: "matched", exerciseId: exact, candidates };
  if (guess && line.match === "exact") return { status: "matched", exerciseId: guess, candidates };
  const top = ranked[0];
  // A near-identical name with a clear lead over the next one is safe to accept.
  if (top && top.score >= 0.9 && (!ranked[1] || top.score - ranked[1].score >= 0.15) && (!guess || guess === top.id)) {
    return { status: "matched", exerciseId: top.id, candidates };
  }
  if (guess || (top && top.score >= 0.4)) return { status: "unsure", exerciseId: guess ?? top!.id, candidates };
  return { status: "missing", exerciseId: null, candidates: candidates.filter(() => Boolean(top && top.score >= 0.25)) };
}
