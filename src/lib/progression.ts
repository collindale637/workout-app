import type { EquipmentDetails, ExerciseEquipment, GymEquipment, SetType } from "./db/types";

/*
  Weight suggestions by double progression (plan doc → "Suggest weights"):
  hit the top of the rep range on every working set and the weight goes up by the smallest jump this gym
  allows; otherwise keep the weight and aim for one more rep. If every set at that weight fell 2+ reps short
  of the bottom of the range, it was too heavy: drop one step and build back up. With no history there's no suggestion
  (the first session is for finding a comfortable working weight). Weights are pounds.
*/

export type LoggedSet = { weight: number | null; reps: number | null; type: SetType };

export type Suggestion = {
  /** Pounds; null = bodyweight or no history. */
  weight: number | null;
  reps: number | null;
  change: "up" | "same" | "down" | "new";
  /** Weight used last time (top working weight). */
  from: number | null;
};

const BARBELLS = new Set(["barbell", "ez_bar", "trap_bar", "safety_squat_bar", "smith_machine", "landmine", "t_bar_row_machine"]);

type Load = { increment: number; max?: number; ladder?: number[] };

/** The smallest jump in weight for this exercise at this gym (and the heaviest available, if known). */
export function loadFor(needs: ExerciseEquipment[], gymRows: Pick<GymEquipment, "equipment_id" | "details">[] | null): Load {
  const details = new Map<string, EquipmentDetails>((gymRows ?? []).map((r) => [r.equipment_id, r.details ?? {}]));
  const have = (id: string) => !gymRows || details.has(id);
  const ids = needs.map((n) => n.equipment_id).filter(have);
  const pick = ids.length ? ids : needs.map((n) => n.equipment_id);
  for (const id of pick) {
    const d = details.get(id) ?? {};
    if (BARBELLS.has(id)) return { increment: 2 * (d.plate_increment ?? 2.5) };
    if (id === "dumbbells") return { increment: d.dumbbell_step ?? 5, max: d.dumbbell_max };
    if (id === "kettlebells" && d.kettlebells?.length) {
      const ladder = [...d.kettlebells].sort((a, b) => a - b);
      return { increment: 5, ladder, max: ladder[ladder.length - 1] };
    }
  }
  for (const id of pick) {
    const d = details.get(id) ?? {};
    if (d.stack_max) return { increment: 5, max: d.stack_max };
  }
  // Machines, cables and anything else: 5 lb is the usual pin or plate step.
  return { increment: 5 };
}

export function suggestNext(last: LoggedSet[], repMin: number | null, repMax: number | null, load: Load): Suggestion {
  const working = last.filter((s) => s.type === "working" && (s.reps ?? 0) > 0);
  const top = repMax ?? repMin;
  const bottom = repMin ?? repMax;
  if (!working.length) return { weight: null, reps: top, change: "new", from: null };

  const weights = working.map((s) => s.weight).filter((w): w is number => w !== null && w > 0);
  if (!weights.length) {
    // Bodyweight: add a rep until the top of the range, then stay there.
    const best = Math.max(...working.map((s) => s.reps ?? 0));
    return { weight: null, reps: top ? Math.min(top, best + 1) : best + 1, change: "same", from: null };
  }

  const heaviest = Math.max(...weights);
  const atTop = working.filter((s) => s.weight === heaviest);
  const minReps = Math.min(...atTop.map((s) => s.reps ?? 0));
  const hitTop = top !== null && atTop.every((s) => (s.reps ?? 0) >= top);

  if (hitTop) {
    const next = stepUp(heaviest, load);
    if (next > heaviest) return { weight: next, reps: bottom, change: "up", from: heaviest };
    // Already at the heaviest weight this gym has: chase reps instead.
    return { weight: heaviest, reps: (top ?? minReps) + 1, change: "same", from: heaviest };
  }
  // Well short of the range on every set: the weight is too heavy to progress from.
  const maxReps = Math.max(...atTop.map((s) => s.reps ?? 0));
  if (bottom !== null && maxReps <= bottom - 2) {
    const lower = stepDown(heaviest, load);
    if (lower < heaviest) return { weight: lower, reps: bottom, change: "down", from: heaviest };
  }
  const reps = top === null ? minReps + 1 : Math.min(top, Math.max(bottom ?? 1, minReps + 1));
  return { weight: heaviest, reps, change: "same", from: heaviest };
}

function stepUp(weight: number, load: Load) {
  if (load.ladder) return load.ladder.find((w) => w > weight) ?? weight;
  const next = Math.round((weight + load.increment) * 100) / 100;
  return load.max !== undefined && next > load.max ? weight : next;
}

function stepDown(weight: number, load: Load) {
  if (load.ladder) return [...load.ladder].reverse().find((w) => w < weight) ?? weight;
  const next = Math.round((weight - load.increment) * 100) / 100;
  return next > 0 ? next : weight;
}
