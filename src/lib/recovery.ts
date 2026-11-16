import type { CardioType, Muscle, SetType } from "./db/types";

/*
  Muscle recovery (plan doc → "Muscle recovery"). All numbers are starting values to tune with real use.

  Each logged set adds fatigue to the muscles it works:  role weight × effort
    role weight: 1.0 primary, 0.5 secondary
    effort:      RPE ÷ 10 (blank RPE = your default, usually 8); warm-up sets count as 0.3
  Fatigue fades exponentially:  F(t) = Σ f · e^(−hours since the set / τ)   (τ per muscle: 30 h small, 36 h medium, 44 h large)
  Recovery = 100 × max(0, 1 − F / F_MAX). F_MAX ≈ thirteen hard (RPE 9) primary sets.
  Calibrated (Batch 5 audit) so a hard session (~10 sets near failure) reads "fatigued" for about a day and
  "fresh" again after ~2 days for small muscles, ~2.5 for chest and shoulders, ~3 for legs and back: the usual
  48–72 hours. Lighter sessions recover sooner.

  Manual adjustment: you can tell the app how a muscle really feels. That stores an offset to the muscle's
  fatigue at that moment, which fades with the same τ as everything else, so it wears off by itself and sets
  you log afterwards still count on top.
*/

export const F_MAX = 12;
export const WINDOW_DAYS = 7;
export const FRESH_AT = 85;
export const RECOVERING_AT = 60;

export type RecoveryState = "fresh" | "recovering" | "fatigued";

export const scoreFor = (fatigue: number) => Math.round(100 * Math.min(1, Math.max(0, 1 - fatigue / F_MAX)));

export const stateFor = (score: number): RecoveryState =>
  score >= FRESH_AT ? "fresh" : score >= RECOVERING_AT ? "recovering" : "fatigued";

/** One logged set, flattened with its exercise's muscles. */
export type FatigueSet = {
  id: string;
  exerciseId: string;
  at: string;
  type: SetType;
  rpe: number | null;
  muscles: { muscle_id: string; role: "primary" | "secondary" }[];
};

export type FatigueCardio = { id: string; at: string; type: CardioType; durationSec: number; rpe: number | null };

/** How a muscle feels, set by hand: fatigue units added at `at` (negative = fresher), fading like normal recovery. */
export type FatigueAdjustment = { at: number; offset: number };
export type FatigueAdjustments = Record<string, FatigueAdjustment>;

export type MuscleRecovery = {
  muscleId: string;
  score: number;
  state: RecoveryState;
  fatigue: number;
  /** What the app would say without a manual adjustment, and the raw fatigue behind it. */
  autoScore: number;
  autoFatigue: number;
  /** True while a manual adjustment is still having an effect. */
  adjusted: boolean;
  /** Most recent set (or cardio) that worked this muscle in the window. */
  lastTrained: string | null;
  /** Working sets in the window where this muscle was primary / secondary. */
  primarySets: number;
  secondarySets: number;
};

export function setFatigue(role: "primary" | "secondary", type: SetType, rpe: number | null, defaultRpe: number) {
  const effort = type === "warmup" ? 0.3 : Math.min(10, Math.max(1, rpe ?? defaultRpe)) / 10;
  return (role === "primary" ? 1 : 0.5) * effort;
}

/** Which muscles a cardio session loads. Rowing and swimming also hit the back. */
export const CARDIO_MUSCLES: Record<CardioType, string[]> = {
  run: ["quads", "hamstrings", "glutes", "calves"],
  walk: ["quads", "hamstrings", "glutes", "calves"],
  bike: ["quads", "glutes", "hamstrings", "calves"],
  elliptical: ["quads", "glutes", "hamstrings", "calves"],
  stairs: ["quads", "glutes", "hamstrings", "calves"],
  row: ["lats", "upper_back", "quads", "glutes", "hamstrings"],
  swim: ["lats", "upper_back", "front_delts", "triceps"],
  hiit: ["quads", "glutes", "hamstrings", "calves", "abs"],
  other: ["quads", "glutes"],
};

/** About one secondary set per 20 minutes of moderate work; intervals count 1.5×. */
export function cardioFatigue(c: FatigueCardio) {
  const effort = (c.rpe ?? (c.type === "walk" ? 4 : 6)) / 10;
  return 0.5 * effort * (c.durationSec / 60 / 20) * (c.type === "hiit" ? 1.5 : 1);
}

const HOUR = 3_600_000;

/** The offset that makes a muscle read `desiredScore` right now, given its automatic fatigue. */
export const adjustmentFor = (desiredScore: number, autoFatigue: number, now: number): FatigueAdjustment => ({
  at: now,
  offset: (1 - Math.min(100, Math.max(0, desiredScore)) / 100) * F_MAX - autoFatigue,
});

export function computeRecovery(opts: {
  muscles: Pick<Muscle, "id" | "recovery_tau_hours">[];
  sets: FatigueSet[];
  cardio: FatigueCardio[];
  now: number;
  defaultRpe: number;
  adjustments?: FatigueAdjustments;
}): Map<string, MuscleRecovery> {
  const { muscles, sets, cardio, now, defaultRpe, adjustments } = opts;
  const out = new Map<string, MuscleRecovery>();
  const tau = new Map(muscles.map((m) => [m.id, m.recovery_tau_hours]));
  for (const m of muscles) {
    out.set(m.id, { muscleId: m.id, score: 100, state: "fresh", fatigue: 0, autoScore: 100, autoFatigue: 0, adjusted: false, lastTrained: null, primarySets: 0, secondarySets: 0 });
  }
  const since = now - WINDOW_DAYS * 24 * HOUR;
  const add = (muscleId: string, f: number, at: string) => {
    const r = out.get(muscleId);
    const t = new Date(at).getTime();
    if (!r || t < since || t > now + HOUR) return null;
    const hours = Math.max(0, (now - t) / HOUR);
    r.fatigue += f * Math.exp(-hours / (tau.get(muscleId) ?? 48));
    if (!r.lastTrained || at > r.lastTrained) r.lastTrained = at;
    return r;
  };
  for (const s of sets) {
    for (const m of s.muscles) {
      const r = add(m.muscle_id, setFatigue(m.role, s.type, s.rpe, defaultRpe), s.at);
      if (r && s.type !== "warmup") {
        if (m.role === "primary") r.primarySets++;
        else r.secondarySets++;
      }
    }
  }
  for (const c of cardio) {
    const f = cardioFatigue(c);
    for (const m of CARDIO_MUSCLES[c.type] ?? []) add(m, f, c.at);
  }
  for (const r of out.values()) {
    r.autoFatigue = r.fatigue;
    r.autoScore = scoreFor(r.fatigue);
    const adj = adjustments?.[r.muscleId];
    // Adjustments older than the window have faded to nothing (and are ignored); one from the "future" is ignored too.
    if (adj && adj.at >= since && adj.at <= now + HOUR) {
      r.fatigue += adj.offset * Math.exp(-Math.max(0, now - adj.at) / HOUR / (tau.get(r.muscleId) ?? 48));
      r.adjusted = true;
    }
    r.score = scoreFor(r.fatigue);
    r.state = stateFor(r.score);
  }
  return out;
}

/*
  "Target fresh muscles": pick the session shape whose muscles are freshest, then train the
  fresh/recovering muscles in it. Grouping keeps it sensible (no lone biceps day).
*/

export type FreshTemplate = { id: string; name: string; muscles: string[]; anchors: string[] };

export const FRESH_TEMPLATES: FreshTemplate[] = [
  { id: "full", name: "Full Body", muscles: ["chest", "lats", "upper_back", "side_delts", "quads", "hamstrings", "glutes", "abs"], anchors: ["chest", "lats", "quads", "hamstrings"] },
  { id: "upper", name: "Upper", muscles: ["chest", "lats", "upper_back", "front_delts", "side_delts", "rear_delts", "biceps", "triceps"], anchors: ["chest", "lats", "upper_back"] },
  { id: "lower", name: "Lower", muscles: ["quads", "hamstrings", "glutes", "calves", "abs", "obliques"], anchors: ["quads", "hamstrings", "glutes"] },
  { id: "push", name: "Push", muscles: ["chest", "front_delts", "side_delts", "triceps"], anchors: ["chest", "front_delts"] },
  { id: "pull", name: "Pull", muscles: ["lats", "upper_back", "rear_delts", "biceps", "traps"], anchors: ["lats", "upper_back"] },
  { id: "legs", name: "Legs", muscles: ["quads", "hamstrings", "glutes", "calves", "adductors", "abductors", "abs"], anchors: ["quads", "hamstrings", "glutes"] },
  { id: "chest_back", name: "Chest & Back", muscles: ["chest", "lats", "upper_back", "rear_delts"], anchors: ["chest", "lats"] },
  { id: "arms_shoulders", name: "Shoulders & Arms", muscles: ["front_delts", "side_delts", "rear_delts", "biceps", "triceps", "forearms", "abs"], anchors: ["side_delts", "biceps", "triceps"] },
];

const SIZE_WEIGHT: Record<string, number> = { large: 3, medium: 2, small: 1 };

export function pickFreshTargets(
  recovery: Map<string, MuscleRecovery>,
  muscles: Pick<Muscle, "id" | "size_class">[],
): { template: FreshTemplate; targets: string[]; score: number } {
  const size = new Map(muscles.map((m) => [m.id, SIZE_WEIGHT[m.size_class] ?? 1]));
  const rec = (id: string) => recovery.get(id)?.score ?? 100;
  let best: { template: FreshTemplate; score: number } | null = null;
  for (const t of FRESH_TEMPLATES) {
    let sum = 0;
    let w = 0;
    for (const m of t.muscles) {
      sum += rec(m) * (size.get(m) ?? 1);
      w += size.get(m) ?? 1;
    }
    let score = sum / w;
    // The day only works if its main muscles are ready.
    const anchorsLow = t.anchors.filter((a) => rec(a) < RECOVERING_AT).length;
    score -= anchorsLow * 25;
    // When everything is equally fresh, prefer training more at once.
    score += t.muscles.length * 0.3;
    if (!best || score > best.score) best = { template: t, score };
  }
  const { template, score } = best!;
  let targets = template.muscles.filter((m) => rec(m) >= RECOVERING_AT);
  if (targets.length < 2) targets = [...template.muscles].sort((a, b) => rec(b) - rec(a)).slice(0, 2);
  return { template, targets, score };
}
