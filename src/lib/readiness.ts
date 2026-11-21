import { F_MAX, RECOVERING_AT, type MuscleRecovery } from "./recovery";

/*
  Group readiness (Recovery screen tiles): "is my Push day ready?", for whatever groups fit your plan.

  A group is Ready when its average recovery is at least READY_AVG and none of its muscles is fatigued (under
  RECOVERING_AT). One wrecked muscle shouldn't hide behind fresh neighbours: a very tired lower back keeps
  "Back" waiting even if lats and upper back are fine.
  "Ready in ~X h" projects each muscle's fatigue forward with its own recovery speed (τ) until the rule passes.
*/

export const READY_AVG = 80;

export type ReadinessView = "plan" | "ppl" | "upper_lower" | "body_part";
export const VIEW_LABELS: Record<ReadinessView, string> = { plan: "My plan", body_part: "Body part", upper_lower: "Upper / Lower", ppl: "PPL" };

export type MuscleGroup = { name: string; muscles: string[] };

const UPPER = ["chest", "front_delts", "side_delts", "rear_delts", "triceps", "biceps", "forearms", "lats", "upper_back", "traps"];
const LOWER = ["quads", "hamstrings", "glutes", "adductors", "abductors", "calves", "lower_back"];
const CORE = ["abs", "obliques"];

export const FIXED_VIEWS: Record<Exclude<ReadinessView, "plan">, MuscleGroup[]> = {
  ppl: [
    { name: "Push", muscles: ["chest", "front_delts", "side_delts", "triceps"] },
    { name: "Pull", muscles: ["lats", "upper_back", "rear_delts", "traps", "biceps", "forearms"] },
    { name: "Legs", muscles: LOWER },
  ],
  upper_lower: [
    { name: "Upper", muscles: UPPER },
    { name: "Lower", muscles: LOWER },
    { name: "Core", muscles: CORE },
  ],
  body_part: [
    { name: "Chest", muscles: ["chest"] },
    { name: "Back", muscles: ["lats", "upper_back", "traps", "lower_back"] },
    { name: "Shoulders", muscles: ["front_delts", "side_delts", "rear_delts"] },
    { name: "Arms", muscles: ["biceps", "triceps", "forearms"] },
    { name: "Core", muscles: CORE },
    { name: "Legs", muscles: ["quads", "hamstrings", "glutes", "adductors", "abductors", "calves"] },
  ],
};

const MAJOR_UPPER = ["chest", "lats", "upper_back"];
const MAJOR_LOWER = ["quads", "hamstrings", "glutes"];
const isFullBody = (muscles: string[]) => MAJOR_UPPER.some((m) => muscles.includes(m)) && MAJOR_LOWER.some((m) => muscles.includes(m));

/** "Upper A" + "Upper B" → "Upper"; "Upper Power" + "Upper Hypertrophy" → "Upper"; "Upper + Cardio" → "Upper". */
function groupName(names: string[]) {
  const clean = names.map((n) => n.replace(/\s*\+\s*cardio\b/i, "").replace(/^cardio\s*\+\s*/i, "").trim());
  const words = clean.map((n) => n.split(/\s+/));
  const common: string[] = [];
  for (let i = 0; i < words[0].length && words.every((w) => w[i]?.toLowerCase() === words[0][i].toLowerCase()); i++) common.push(words[0][i]);
  let name = (common.length ? common.join(" ") : clean[0]).replace(/\s+([A-D]|\d+)$/, "");
  if (names.length === 1) name = clean[0].replace(/\s+([A-D]|\d+)$/, "");
  return name || names[0];
}

/**
 * The groups for "My plan": one per distinct training day (days that train the same muscles are merged).
 * Returns null when the plan's days don't split the body up (full body, or no plan), so the caller falls back
 * to Upper / Lower / Core.
 */
export function planGroups(days: { name: string; target_muscle_ids: string[] }[], known?: Set<string>): MuscleGroup[] | null {
  const byKey = new Map<string, { names: string[]; muscles: string[] }>();
  for (const d of days) {
    const muscles = [...new Set(d.target_muscle_ids)].filter((m) => !known || known.has(m)).sort();
    if (!muscles.length) continue;
    const key = muscles.join(",");
    const g = byKey.get(key);
    if (g) { if (!g.names.includes(d.name)) g.names.push(d.name); } else byKey.set(key, { names: [d.name], muscles });
  }
  const groups = [...byKey.values()];
  if (groups.length < 2 || groups.every((g) => isFullBody(g.muscles))) return null;
  const out = groups.map((g) => ({ name: groupName(g.names), muscles: g.muscles }));
  // Two different days that end up with the same name ("Chest & Back" twice with different targets) get merged.
  const merged = new Map<string, MuscleGroup>();
  for (const g of out) {
    const k = g.name.toLowerCase();
    const cur = merged.get(k);
    merged.set(k, cur ? { name: cur.name, muscles: [...new Set([...cur.muscles, ...g.muscles])] } : g);
  }
  return [...merged.values()].slice(0, 6);
}

export function groupsFor(view: ReadinessView, plan: MuscleGroup[] | null): MuscleGroup[] {
  if (view === "plan") return plan ?? FIXED_VIEWS.upper_lower;
  return FIXED_VIEWS[view];
}

export type GroupReadiness = {
  name: string;
  muscles: string[];
  /** Average recovery %, rounded. */
  score: number;
  /** Lowest single muscle %. */
  lowest: number;
  ready: boolean;
  /** Hours until Ready; 0 when ready now, Infinity if more than a week away. */
  hoursToReady: number;
};

const scoreAfter = (fatigue: number, tau: number, hours: number) => 100 * Math.min(1, Math.max(0, 1 - (fatigue * Math.exp(-hours / tau)) / F_MAX));

export function groupReadiness(group: MuscleGroup, recovery: Map<string, MuscleRecovery>, tau: Map<string, number>): GroupReadiness {
  const rows = group.muscles.map((m) => recovery.get(m)).filter((r): r is MuscleRecovery => Boolean(r));
  const at = (h: number) => {
    const scores = rows.map((r) => (h === 0 ? r.score : scoreAfter(r.fatigue, tau.get(r.muscleId) ?? 48, h)));
    const avg = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
    return { avg, lowest: Math.min(100, ...scores) };
  };
  const ok = ({ avg, lowest }: { avg: number; lowest: number }) => Math.round(avg) >= READY_AVG && Math.round(lowest) >= RECOVERING_AT;
  const now = at(0);
  let hoursToReady = 0;
  if (!ok(now)) {
    hoursToReady = Infinity;
    for (let h = 0.5; h <= 168; h += 0.5) if (ok(at(h))) { hoursToReady = h; break; }
  }
  return { name: group.name, muscles: group.muscles, score: Math.round(now.avg), lowest: Math.round(now.lowest), ready: hoursToReady === 0, hoursToReady };
}

/** "<1 h", "~23 h", "~2½ days", "7+ days". */
export function formatWait(hours: number) {
  if (!Number.isFinite(hours) || hours > 168) return "7+ days";
  if (hours < 1) return "<1 h";
  if (hours < 48) return `~${Math.round(hours)} h`;
  const days = Math.round((hours / 24) * 2) / 2;
  return `~${String(days).replace(".5", "½")} days`;
}

/**
 * The rows on the Up Next card: the body parts (Chest, Back, Shoulders, Arms, Core, Legs) the workout trains, in the order
 * its target muscles first appear. Each group holds only the workout's own muscles, so Arms on a push day is just triceps.
 * A muscle the body-part list doesn't know gets a row of its own.
 */
export function targetGroups(targets: string[]): MuscleGroup[] {
  const groups: MuscleGroup[] = [];
  for (const t of targets) {
    const name = FIXED_VIEWS.body_part.find((g) => g.muscles.includes(t))?.name ?? t;
    const group = groups.find((g) => g.name === name);
    if (group) group.muscles.push(t);
    else groups.push({ name, muscles: [t] });
  }
  return groups;
}
