import { loadFor, type Load } from "./progression";
import type { Experience, ExerciseEquipment, GymEquipment, Sex } from "./db/types";

/*
  Starting-weight estimates for lifts with no history (onboarding: weight, height, sex, experience).

  Rough idea: strength scales with bodyweight, so each kind of lift has a one-rep-max guess as a multiple of
  bodyweight (a barbell-equivalent total, for a man at that experience level). Then:
    - women and anyone who skipped the question are scaled down (the cautious direction; you can always go up),
    - the guess is converted to this exercise's equipment (dumbbells are per hand; machines run as-is),
    - turned into a weight you could do for the top of the rep range with ~3 reps left in the tank,
    - trimmed 10% because the first session is for finding the weight, and
    - rounded to what the gym can actually load (bar weight + plate steps, dumbbell steps, kettlebell ladder, stack).
  Height only caps bodyweight at a BMI-30 equivalent, since extra body fat doesn't add lifting strength.
  These are estimates, not prescriptions. The live workout labels them as such, and once you log a lift the
  normal double progression takes over. Weights are pounds.
*/

export type StartingProfile = {
  bodyweightLb: number | null;
  heightIn: number | null;
  sex: Sex | null;
  experience: Experience;
};

type Triple = [beginner: number, intermediate: number, advanced: number];
type Kind = { oneRm: Triple; lower: boolean };

/** One-rep max as a multiple of bodyweight: barbell-equivalent total load, man, by experience. */
const KINDS = {
  bench: { oneRm: [0.6, 1.0, 1.4], lower: false },
  overhead: { oneRm: [0.4, 0.65, 0.9], lower: false },
  row: { oneRm: [0.5, 0.8, 1.1], lower: false },
  pulldown: { oneRm: [0.6, 0.9, 1.2], lower: false },
  pullover: { oneRm: [0.3, 0.5, 0.7], lower: false },
  squat: { oneRm: [0.75, 1.25, 1.75], lower: true },
  lunge: { oneRm: [0.5, 0.9, 1.3], lower: true },
  deadlift: { oneRm: [1.0, 1.6, 2.1], lower: true },
  rdl: { oneRm: [0.75, 1.2, 1.6], lower: true },
  goodmorning: { oneRm: [0.4, 0.7, 1.0], lower: true },
  hipthrust: { oneRm: [0.9, 1.5, 2.1], lower: true },
  curl: { oneRm: [0.25, 0.4, 0.55], lower: false },
  triceps: { oneRm: [0.25, 0.4, 0.6], lower: false },
  raise: { oneRm: [0.12, 0.2, 0.3], lower: false },
  fly: { oneRm: [0.3, 0.5, 0.7], lower: false },
  shrug: { oneRm: [0.7, 1.2, 1.7], lower: false },
  legext: { oneRm: [0.5, 0.8, 1.1], lower: true },
  legcurl: { oneRm: [0.4, 0.6, 0.85], lower: true },
  calf: { oneRm: [0.7, 1.1, 1.6], lower: true },
  glute: { oneRm: [0.4, 0.7, 1.0], lower: true },
  hipmachine: { oneRm: [0.6, 0.9, 1.2], lower: true },
} satisfies Record<string, Kind>;
type KindId = keyof typeof KINDS;

/** Women and "prefer not to say" use the lighter numbers on purpose: too light is easy to fix, too heavy isn't. */
const FEMALE = { upper: 0.55, lower: 0.72 };

const BAR_WEIGHT: Record<string, number> = { barbell: 45, trap_bar: 45, safety_squat_bar: 45, ez_bar: 25, smith_machine: 20, landmine: 15, t_bar_row_machine: 15 };
const BARS = new Set(Object.keys(BAR_WEIGHT));
const MACHINES = new Set([
  "leg_press", "hack_squat_machine", "pendulum_squat", "belt_squat", "leg_extension", "lying_leg_curl", "seated_leg_curl", "standing_leg_curl",
  "hip_abductor", "hip_adductor", "hip_thrust_machine", "glute_kickback_machine", "standing_calf_machine", "seated_calf_machine",
  "chest_press_machine", "pec_deck", "shoulder_press_machine", "lateral_raise_machine", "seated_row_machine", "bicep_curl_machine",
  "tricep_extension_machine", "dip_machine", "cable_crossover", "cable_pulley", "lat_pulldown", "cable_row_station",
]);

type Implement = { type: "bar"; bar: number } | { type: "dumbbell" } | { type: "kettlebell" } | { type: "machine"; cable: boolean };

/** What you load this exercise with at this gym, or null for bodyweight, bands and anything else you can't add weight to. */
function implementFor(needs: ExerciseEquipment[], gymRows: Pick<GymEquipment, "equipment_id">[] | null): Implement | null {
  const have = new Set((gymRows ?? []).map((r) => r.equipment_id));
  const all = needs.map((n) => n.equipment_id);
  const ids = gymRows ? all.filter((id) => have.has(id)) : all;
  const pick = ids.length ? ids : all;
  const bar = pick.find((id) => BARS.has(id));
  if (bar) return { type: "bar", bar: BAR_WEIGHT[bar] };
  if (pick.includes("dumbbells")) return { type: "dumbbell" };
  if (pick.includes("kettlebells")) return { type: "kettlebell" };
  const machine = pick.find((id) => MACHINES.has(id));
  if (machine) return { type: "machine", cable: machine.startsWith("cable") || machine === "lat_pulldown" };
  return null;
}

type Classified = { kind: KindId; mod: number; /** One implement held (goblet squat, pullover) rather than a pair. */ single?: boolean };

function classify(name: string, pattern: string | null, primary: string[]): Classified | null {
  const n = name.toLowerCase();
  if (/jump|clean|snatch|swing|throw|carry|walk|pistol|handstand|muscle.?up|plank|wheel|stretch|sissy|wall sit/.test(n)) return null;
  switch (pattern) {
    case "horizontal_push": {
      if (/push.?up|dip\b|svend/.test(n)) return null;
      return { kind: "bench", mod: /incline/.test(n) ? 0.8 : /decline/.test(n) ? 1.05 : /close|narrow/.test(n) ? 0.85 : /floor/.test(n) ? 0.9 : 1 };
    }
    case "vertical_push":
      return { kind: "overhead", mod: /seated/.test(n) ? 0.95 : /push press/.test(n) ? 1.15 : 1 };
    case "horizontal_pull":
      return { kind: "row", mod: /pendlay/.test(n) ? 0.9 : 1 };
    case "vertical_pull":
      return /straight.?arm/.test(n) ? { kind: "pullover", mod: 0.8 } : { kind: "pulldown", mod: 1 };
    case "squat": {
      if (/overhead/.test(n)) return { kind: "squat", mod: 0.4 };
      if (/goblet/.test(n)) return { kind: "squat", mod: 0.4, single: true };
      return { kind: "squat", mod: /leg press/.test(n) ? 1.9 : /hack|pendulum|belt/.test(n) ? 1.3 : /front/.test(n) ? 0.8 : /zercher/.test(n) ? 0.7 : 1 };
    }
    case "lunge":
      return { kind: "lunge", mod: /step.?up/.test(n) ? 0.8 : 1 };
    case "hinge": {
      if (/hip thrust|bridge/.test(n)) return { kind: "hipthrust", mod: 1 };
      if (/good morning/.test(n)) return { kind: "goodmorning", mod: 1 };
      if (/hyperextension|back extension|reverse hyper|glute ham|pull through/.test(n)) return /pull through/.test(n) ? { kind: "glute", mod: 0.8 } : null;
      if (/single.?leg|one.?leg/.test(n)) return { kind: "rdl", mod: 0.55 };
      if (/romanian|rdl|stiff/.test(n)) return { kind: "rdl", mod: 1 };
      return { kind: "deadlift", mod: /rack pull/.test(n) ? 1.1 : /deficit/.test(n) ? 0.9 : 1 };
    }
    case "isolation": {
      const m = primary[0];
      if (m === "biceps") return { kind: "curl", mod: 1 };
      if (m === "triceps") return { kind: "triceps", mod: 1 };
      if (m === "side_delts" || m === "rear_delts" || m === "front_delts" || m === "upper_back") return { kind: "raise", mod: 1 };
      if (m === "chest") return { kind: "fly", mod: 1 };
      if (m === "quads") return { kind: "legext", mod: 1 };
      if (m === "hamstrings") return { kind: "legcurl", mod: 1 };
      if (m === "calves") return { kind: "calf", mod: /seated/.test(n) ? 0.5 : 1 };
      if (m === "glutes") return { kind: "glute", mod: 1 };
      if (m === "traps") return { kind: "shrug", mod: 1 };
      if (m === "lats") return { kind: "pullover", mod: 1, single: true };
      if (m === "adductors" || m === "abductors") return { kind: "hipmachine", mod: 1 };
      return null;
    }
    default:
      return null;
  }
}

/** Bodyweight that counts for lifting: capped at the BMI-30 weight for this height (weight is pounds, height inches). */
export function effectiveBodyweight(bodyweightLb: number, heightIn: number | null): number {
  if (!heightIn || heightIn < 40) return bodyweightLb;
  const bmi30 = (30 * heightIn * heightIn) / 703;
  return Math.min(bodyweightLb, bmi30);
}

function roundTo(raw: number, load: Load, implement: Implement): number {
  if (load.ladder?.length) {
    // Kettlebells: the heaviest one that's not above the estimate, else the lightest.
    return [...load.ladder].reverse().find((w) => w <= raw) ?? load.ladder[0];
  }
  const inc = load.increment > 0 ? load.increment : 5;
  const base = implement.type === "bar" ? implement.bar : 0;
  const floor = implement.type === "dumbbell" ? Math.max(inc, load.min ?? 0) : implement.type === "bar" ? base : inc;
  let w = base + Math.max(0, Math.round((raw - base) / inc)) * inc;
  w = Math.max(w, floor);
  if (load.max !== undefined) w = Math.min(w, load.max);
  return Math.round(w * 100) / 100;
}

/**
 * A starting weight in pounds for an exercise you haven't logged, or null when there's nothing sensible to suggest
 * (no bodyweight, bodyweight-only exercise, or a lift this model doesn't cover).
 */
export function estimateStartingWeight(args: {
  name: string;
  pattern: string | null;
  primaryMuscles: string[];
  needs: ExerciseEquipment[];
  gymRows: Pick<GymEquipment, "equipment_id" | "details">[] | null;
  repMin: number | null;
  repMax: number | null;
  who: StartingProfile;
}): number | null {
  const { who } = args;
  if (!who.bodyweightLb || who.bodyweightLb <= 0) return null;
  const c = classify(args.name, args.pattern, args.primaryMuscles);
  if (!c) return null;
  const implement = implementFor(args.needs, args.gymRows);
  if (!implement) return null;

  const kind: Kind = KINDS[c.kind];
  const exp = who.experience === "beginner" ? 0 : who.experience === "intermediate" ? 1 : 2;
  const bw = effectiveBodyweight(who.bodyweightLb, who.heightIn);
  const sex = who.sex === "male" ? 1 : kind.lower ? FEMALE.lower : FEMALE.upper;
  const oneRm = bw * kind.oneRm[exp] * c.mod * sex;

  // Convert the barbell-equivalent total to what's shown on this equipment.
  const isolation = kind.oneRm[0] < 0.35 && !kind.lower;
  const factor =
    implement.type === "dumbbell" ? (c.single ? 1 : isolation ? 0.5 : 0.42)
    : implement.type === "kettlebell" ? (c.single ? 1 : 0.42)
    : implement.type === "machine" && implement.cable && isolation ? 0.8
    : 1;

  const reps = args.repMax ?? args.repMin ?? 10;
  const working = (oneRm * factor) / (1 + (reps + 3) / 30);
  const raw = working * 0.9;
  return roundTo(raw, loadFor(args.needs, args.gymRows), implement);
}
