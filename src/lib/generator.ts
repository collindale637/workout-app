import { isAvailable } from "./availability";
import { WARMUP_NOTE, warmupWorthy } from "./warmup";
import type { CardioPref, Exercise, ExerciseEquipment, ExerciseMuscle, ExercisePref, Experience, Goal } from "./db/types";

/*
  Rules-based workout generator (plan doc → "Workout generator"). No AI: it runs on the phone, works
  offline, and gives the same answer for the same inputs (Regenerate just changes the seed).

    1. Target muscles come from a plan day, muscles you pick, or "target fresh muscles".
    2. The pool is exercises the active gym can support, at your level, minus ones you excluded.
    3. Each candidate is scored on how much unmet target work it covers, how recovered its muscles are,
       compound vs isolation, favorites, variety, and a little seeded randomness.
    4. Pick greedily (each pick reduces what its muscles still need), then order compounds first.
    5. Sets, reps and rest come from the goal (dose), and cardio is added when the goal or day calls for it.
*/

export type GenCatalog = {
  exercises: Exercise[];
  musclesOf: Map<string, ExerciseMuscle[]>;
  needs: Map<string, ExerciseEquipment[]>;
};

export type GenItem = {
  exercise_id: string;
  sets: number;
  rep_min: number | null;
  rep_max: number | null;
  rest_sec: number | null;
  superset_group: number | null;
  notes: string | null;
};

export type CardioMode = "none" | "block" | "main";
export type DayFocus = "power" | "hypertrophy" | null;

export type GenOptions = {
  targets: string[];
  /** Equipment at the active gym; null = no gym set up (anything goes). */
  gymEquipment: Set<string> | null;
  goal: Goal;
  experience: Experience;
  sessionMinutes: number;
  /** Recovery score 0–100 per muscle. Missing = fresh. */
  recovery?: Map<string, number>;
  /** When each exercise was last done (ms). Used for variety. */
  lastDone?: Map<string, number>;
  prefs?: Map<string, ExercisePref>;
  /** Exercises to steer away from, e.g. the ones already on the "A" day when building "B". */
  avoid?: Set<string>;
  seed?: number;
  now?: number;
  cardio?: CardioMode;
  focus?: DayFocus;
  /** The person's cardio setting; days that name cardio ("+ Cardio", "Cardio + Core") always get it. */
  cardioPref?: CardioPref;
};

/** How much each muscle wants per session when it's a target (roughly "exercises' worth"). */
export const MUSCLE_PRIORITY: Record<string, number> = {
  chest: 2, quads: 2, lats: 1.6, hamstrings: 1.5, upper_back: 1.4, glutes: 1.3,
  side_delts: 1, biceps: 1, triceps: 1, front_delts: 0.6, abs: 0.8, rear_delts: 0.7, calves: 0.7,
  traps: 0.5, obliques: 0.5, lower_back: 0.4, adductors: 0.4, abductors: 0.4, forearms: 0.3,
};

/**
 * Staples: the lifts a coach would reach for first. Tier 1 are main lifts (they lead the session),
 * tier 2 are go-to accessories. Everything else in the library can still be picked, just less often.
 */
export const STAPLES: Record<string, 1 | 2> = {
  Barbell_Squat: 1, Barbell_Deadlift: 1, "Barbell_Bench_Press_-_Medium_Grip": 1, Standing_Military_Press: 1, Bent_Over_Barbell_Row: 1,
  Pullups: 1, "Chin-Up": 1, Romanian_Deadlift: 1, "Barbell_Incline_Bench_Press_-_Medium_Grip": 1, Front_Barbell_Squat: 1, Trap_Bar_Deadlift: 1,
  Barbell_Hip_Thrust: 1, Leg_Press: 1, Hack_Squat: 1, Dumbbell_Bench_Press: 1, Incline_Dumbbell_Press: 1, Dumbbell_Shoulder_Press: 1,
  Seated_Dumbbell_Press: 1, "Wide-Grip_Lat_Pulldown": 1, Seated_Cable_Rows: 1, "One-Arm_Dumbbell_Row": 1, Goblet_Squat: 1,
  "Stiff-Legged_Dumbbell_Deadlift": 1, Machine_Bench_Press: 1, Machine_Shoulder_Military_Press: 1, Smith_Machine_Squat: 1, "T-Bar_Row_with_Handle": 1,
  Dumbbell_Squat: 1, Dumbbell_Incline_Row: 1, "Lying_T-Bar_Row": 1, Machine_Seated_Row: 1, Pushups: 1, Bulgarian_Split_Squat: 1,
  Side_Lateral_Raise: 2, Cable_Lateral_Raise: 2, Machine_Lateral_Raise: 2, Seated_Side_Lateral_Raise: 2, Dumbbell_Bicep_Curl: 2, Hammer_Curls: 2,
  Barbell_Curl: 2, "EZ-Bar_Curl": 2, Incline_Dumbbell_Curl: 2, Standing_Biceps_Cable_Curl: 2, Preacher_Curl: 2, Triceps_Pushdown: 2,
  "Triceps_Pushdown_-_Rope_Attachment": 2, "EZ-Bar_Skullcrusher": 2, Triceps_Overhead_Extension_with_Rope: 2, Standing_Dumbbell_Triceps_Extension: 2,
  Seated_Triceps_Press: 2, Lying_Leg_Curls: 2, Seated_Leg_Curl: 2, Leg_Extensions: 2, Standing_Calf_Raises: 2, Seated_Calf_Raise: 2,
  Standing_Dumbbell_Calf_Raise: 2, Calf_Press_On_The_Leg_Press_Machine: 2, Face_Pull: 2, Cable_Crossover: 2, Dumbbell_Flyes: 2, Butterfly: 2,
  Incline_Dumbbell_Flyes: 2, Reverse_Flyes: 2, Reverse_Machine_Flyes: 2, Cable_Rear_Delt_Fly: 2, Dumbbell_Lunges: 2, Barbell_Walking_Lunge: 2, Dumbbell_Walking_Lunge: 2,
  Dumbbell_Rear_Lunge: 2, Split_Squat_with_Dumbbells: 2, Dumbbell_Step_Ups: 2, Hanging_Leg_Raise: 2, Cable_Crunch: 2, Plank: 2, Ab_Roller: 2,
  Pallof_Press: 2, Knee_Hip_Raise_On_Parallel_Bars: 2, Dumbbell_Shrug: 2, Barbell_Shrug: 2, Hyperextensions_Back_Extensions: 2,
  Dumbbell_Hip_Thrust: 2, Machine_Hip_Thrust: 2, Leverage_Iso_Row: 2, Leverage_High_Row: 2, Thigh_Abductor: 2, Thigh_Adductor: 2,
  "Dips_-_Triceps_Version": 2, "Dips_-_Chest_Version": 2, "Close-Grip_Barbell_Bench_Press": 2, Arnold_Dumbbell_Press: 2, Leverage_Incline_Chest_Press: 2,
  Smith_Machine_Incline_Bench_Press: 2, Underhand_Cable_Pulldowns: 2, "Close-Grip_Front_Lat_Pulldown": 2, "Straight-Arm_Pulldown": 2,
  Kettlebell_Swing: 2, Good_Morning: 2, Sumo_Deadlift: 2, Weighted_Pull_Ups: 2, Inverted_Row: 2, Suspended_Row: 2, Dead_Bug: 2, Side_Bridge: 2,
  Crunches: 2, Reverse_Crunch: 2, Russian_Twist: 2, Concentration_Curls: 2, Tricep_Dumbbell_Kickback: 2, "Push-Ups_With_Feet_Elevated": 2,
  Glute_Ham_Raise: 2, Pull_Through: 2, Single_Leg_Glute_Bridge: 2, Butt_Lift_Bridge: 2,
};

const LIFT_CATEGORIES = new Set(["strength", "powerlifting", "olympic_weightlifting"]);
/** Fine to log, but not something to suggest unasked. */
const NEVER_SUGGEST = new Set(["Battling_Ropes", "Power_Clean", "Handstand_Push-Ups", "Barbell_Ab_Rollout_-_On_Knees", "Bicycling", "Trail_Running_Walking"]);

const LEVELS: Record<Experience, Set<string>> = {
  beginner: new Set(["beginner"]),
  intermediate: new Set(["beginner", "intermediate"]),
  advanced: new Set(["beginner", "intermediate", "expert"]),
};

/** Small seeded random number generator (mulberry32) so Regenerate is repeatable. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which kind of day this is, from its name: "Upper Power", "Full Body + Cardio", "Cardio + Core". */
export function dayStyle(name: string): { cardio: CardioMode | null; focus: DayFocus } {
  const n = name.toLowerCase();
  return {
    cardio: /^cardio\b/.test(n) ? "main" : /\+\s*cardio/.test(n) ? "block" : null,
    focus: /\bpower\b/.test(n) ? "power" : /\bhypertrophy\b/.test(n) ? "hypertrophy" : null,
  };
}

export function cardioMinutes(mode: CardioMode, goal: Goal, sessionMinutes: number) {
  if (mode === "main") return Math.max(20, Math.round(sessionMinutes * 0.6 / 5) * 5);
  // A block is about a third of the session (10 min at least), never more than the goal's usual block:
  // a 30-minute fat-loss day gets 10 minutes of cardio, not 20 with the lifting squeezed into the rest.
  if (mode === "block") return Math.min(goal === "fat_loss" ? 20 : 15, Math.max(10, Math.round(sessionMinutes / 3 / 5) * 5));
  return 0;
}

/**
 * Cardio when the day doesn't say. "auto" follows the goal (fat loss most days, general fitness on longer
 * sessions); "more" adds a block every time; "none" leaves it to days that ask for it.
 */
export function defaultCardio(goal: Goal, sessionMinutes: number, pref: CardioPref = "auto"): CardioMode {
  if (pref === "none") return "none";
  if (pref === "more") return "block";
  if (goal === "fat_loss") return "block";
  if (goal === "general" && sessionMinutes >= 50) return "block";
  return "none";
}

export type Dose = { sets: number; rep_min: number; rep_max: number; rest_sec: number };
type Role = "main" | "compound" | "isolation" | "core";
/** Seconds of work per set, for time estimates. */
const WORK_SEC = 40;

/** Sets, reps and rest (plan doc → "Starting dose by goal"). */
export function dose(goal: Goal, role: "main" | "compound" | "isolation" | "core", experience: Experience, focus: DayFocus = null): Dose {
  const g: Goal = focus === "power" ? "strength" : focus === "hypertrophy" ? "hypertrophy" : goal;
  let d: Dose;
  if (role === "core") d = { sets: 3, rep_min: 10, rep_max: 15, rest_sec: 45 };
  else if (g === "strength")
    d = role === "main" ? { sets: 5, rep_min: 3, rep_max: 5, rest_sec: 180 } : role === "compound" ? { sets: 3, rep_min: 6, rep_max: 8, rest_sec: 150 } : { sets: 3, rep_min: 8, rep_max: 10, rest_sec: 90 };
  else if (g === "hypertrophy")
    d = role === "main" ? { sets: 4, rep_min: 6, rep_max: 10, rest_sec: 120 } : role === "compound" ? { sets: 3, rep_min: 8, rep_max: 12, rest_sec: 90 } : { sets: 3, rep_min: 10, rep_max: 15, rest_sec: 60 };
  else if (g === "fat_loss")
    d = role === "isolation" ? { sets: 3, rep_min: 12, rep_max: 15, rest_sec: 45 } : { sets: 3, rep_min: 10, rep_max: 12, rest_sec: 60 };
  else d = role === "isolation" ? { sets: 3, rep_min: 10, rep_max: 12, rest_sec: 60 } : { sets: 3, rep_min: 8, rep_max: 12, rest_sec: 90 };
  if (experience === "beginner") d = { ...d, sets: Math.min(d.sets, 3) };
  // Beginners build strength fine on 5–8 reps, without grinding near-max sets while technique settles.
  if (experience === "beginner" && g === "strength" && role === "main") d = { ...d, rep_min: 5, rep_max: 8, rest_sec: 150 };
  return d;
}

/** Minutes per lifting exercise, rest included. Fat loss supersets its accessories, so they take less. */
const MINUTES_PER_EXERCISE: Record<Goal, number> = { strength: 13, hypertrophy: 8, fat_loss: 4.5, general: 8 };

/**
 * Most of the benefit from one session comes in the first ~10 hard sets for a muscle; past that it's
 * mostly extra fatigue. Spread the rest across the day's other muscles (or another day).
 */
export const SESSION_SET_CAP = 10;
/** Hard sets one muscle can take in a session. Beginners recover slower, so they get a lower ceiling. */
export const setCapFor = (experience: Experience) => (experience === "beginner" ? 8 : SESSION_SET_CAP);

/** Tagged "compound" in the source data but trained like isolation work (light, higher reps, short rest). */
const ISOLATION_IDS = new Set(["Face_Pull", "Straight-Arm_Dumbbell_Pullover", "Incline_Dumbbell_Flyes"]);
export const isIsolation = (ex: Pick<Exercise, "id" | "mechanic" | "movement_pattern">) =>
  ex.mechanic !== "compound" || ex.movement_pattern === "isolation" || ISOLATION_IDS.has(ex.id);

/** Timed holds: dosed in seconds, not reps. */
export const isHold = (name: string) => /\bplank\b(?!\s*(jack|to|walk|up))|hollow (body )?hold|wall sit|l-sit|dead hang/i.test(name);

const FREE_WEIGHTS = new Set(["barbell", "dumbbells", "trap_bar", "ez_bar", "kettlebells"]);
const GUIDED = /machine|smith|cable|lever|pulldown|row_station|leg_press|hack_squat|pendulum|belt_squat|leg_extension|leg_curl|pec_deck|hip_abductor|hip_adductor|reverse_hyper/;
const LOWER_BODY = new Set(["quads", "hamstrings", "glutes"]);
/** Best kept to low reps and never supersetted outside heavy days: technique fades fast when tired. */
const HEAVY_ONLY = new Set(["Barbell_Deadlift", "Sumo_Deadlift", "Deficit_Deadlift", "Rack_Pulls"]);
/** Hinges usually done for 6–10 reps: an accessory to the main lifts, not a 3–5 rep main lift themselves. */
const ACCESSORY_HINGE = /romanian|stiff-legged|good morning|single-leg deadlift/i;
/** Loaded through the spine like a deadlift: one per session is plenty (trap bar + RDL is two). */
const SPINAL_HINGE = /deadlift|good morning|rack pull/i;
/** Never a heavy 3–5 rep lift: balance, grip or the dumbbell weight gives out before the muscles do. */
const NOT_HEAVY = /goblet|dumbbell squat|kettlebell|swing|lunge|step-?up|split squat|single-leg|one-leg/i;
/** Done one side at a time, so each set takes about twice as long. */
export const isUnilateral = (name: string) => /bulgarian|split squat|lunge|step-?up|single-leg|one-leg|single-arm|one-arm|concentration|kickback/i.test(name) && !/swing/i.test(name);
/** Squats you can't load heavily: fine for beginners and small gyms, a weak choice when a barbell or leg press is there. */
const LIGHT_SQUAT = new Set(["Goblet_Squat", "Dumbbell_Squat"]);
/** Free-weight lifts that take coaching to do safely: beginners get a machine or a simpler version first. */
const TECHNICAL = new Set(["T-Bar_Row_with_Handle", "Lying_T-Bar_Row", "Bent_Over_Barbell_Row", "Good_Morning", "Barbell_Hip_Thrust"]);
/** Pull-ups and chin-ups on your own bodyweight: most beginners can't do several yet. */
export const isBodyweightPull = (ex: Pick<Exercise, "name" | "movement_pattern" | "mechanic">, loadable: boolean) =>
  ex.movement_pattern === "vertical_pull" && ex.mechanic === "compound" && !loadable && !/assist|band|inverted/i.test(ex.name);
const isSwing = (name: string) => /swing/i.test(name);
/** Weighted pull-ups and chins: a strength lift, done for low reps by people past the beginner stage. */
const isWeightedPull = (id: string) => /^Weighted_(Pull|Chin)/i.test(id);
const SMITH = /smith/i;
/** Bench angle of a press, so a day gets one incline and one flat press rather than two of the same. */
const pressAngle = (name: string) => (/incline/i.test(name) ? "incline" : /decline/i.test(name) ? "decline" : "flat");
/**
 * Exercise tiers (Batch 11): staple (STAPLES 1, can lead the day), common (STAPLES 2 or flagged common),
 * specialist (everything else). Specialist lifts are rare for beginners and never lead a session.
 */
export const tierOf = (ex: Pick<Exercise, "id" | "is_common" | "owner_id">): "staple" | "common" | "specialist" =>
  STAPLES[ex.id] === 1 ? "staple" : STAPLES[ex.id] === 2 || ex.is_common || ex.owner_id ? "common" : "specialist";
/** Cardio that pounds the joints: fine in short bursts, a lot for a beginner or a 15–20 minute block. */
const HIGH_IMPACT = /jump|rope|run|sprint|burpee/i;

export function exerciseCount(goal: Goal, liftMinutes: number, targets: number) {
  const n = Math.round(liftMinutes / MINUTES_PER_EXERCISE[goal]);
  return Math.max(2, Math.min(9, n, Math.max(2, targets * 2)));
}

type Candidate = { ex: Exercise; primary: string[]; secondary: string[]; equipment: string; loadable: boolean; base: string; iso: boolean; free: boolean; barbell: boolean };

/** Things you train on but don't load with weight: exercises using only these can't be a heavy main lift. */
const UNLOADED = new Set([
  "pull_up_bar", "dip_station", "captains_chair", "flat_bench", "adjustable_bench", "decline_bench", "plyo_box", "stability_ball",
  "gymnastic_rings", "suspension_trainer", "resistance_bands", "ab_wheel", "jump_rope", "power_rack", "squat_stand",
]);

/**
 * "Seated Dumbbell Shoulder Press" and "Dumbbell Shoulder Press" (or "Cable Lateral Raise" and "Machine Lateral
 * Raise") are the same exercise for variety purposes: one per session is enough.
 */
export const baseName = (name: string) =>
  name
    .toLowerCase()
    .replace(/\b(seated|standing|alternating|alternate|single-arm|one-arm|single-leg|one-leg|cable|machine|dumbbell|barbell|smith|kettlebell|band|lever|leverage|goblet|trap bar|ez-bar|ez bar)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Score penalty for the 2nd, 3rd, 4th… exercise with the same movement pattern on the same muscles. */
const REPEAT_PENALTY = [0.6, 1.8, 3];

/** Arms get plenty from presses and rows, but still want direct work: a compound only counts half for them. */
const DIRECT_WORK = new Set(["biceps", "triceps"]);

function primaries(cat: GenCatalog, id: string) {
  return (cat.musclesOf.get(id) ?? []).filter((m) => m.role === "primary").map((m) => m.muscle_id);
}
function secondaries(cat: GenCatalog, id: string) {
  return (cat.musclesOf.get(id) ?? []).filter((m) => m.role === "secondary").map((m) => m.muscle_id);
}
const isCore = (c: Candidate) => c.ex.movement_pattern === "core";

/** Exercises the generator may use at this gym, for this person. */
export function liftPool(cat: GenCatalog, opts: Pick<GenOptions, "gymEquipment" | "experience" | "prefs">): Candidate[] {
  const out: Candidate[] = [];
  for (const ex of cat.exercises) {
    if (!ex.is_active || !LIFT_CATEGORIES.has(ex.category) || NEVER_SUGGEST.has(ex.id)) continue;
    if (opts.prefs?.get(ex.id)?.excluded) continue;
    if (!ex.owner_id && !LEVELS[opts.experience].has(ex.level)) continue;
    const needs = cat.needs.get(ex.id) ?? [];
    if (opts.gymEquipment && !isAvailable(needs, opts.gymEquipment)) continue;
    const primary = primaries(cat, ex.id);
    if (!primary.length) continue;
    out.push({
      ex, primary, secondary: secondaries(cat, ex.id), equipment: needs.map((n) => n.equipment_id).sort().join(","),
      loadable: needs.some((n) => !UNLOADED.has(n.equipment_id)), base: baseName(ex.name),
      iso: isIsolation(ex),
      free: needs.some((n) => FREE_WEIGHTS.has(n.equipment_id)) && !needs.some((n) => GUIDED.test(n.equipment_id)),
      barbell: needs.some((n) => n.equipment_id === "barbell" || n.equipment_id === "trap_bar"),
    });
  }
  return out;
}

export function generateWorkout(cat: GenCatalog, opts: GenOptions): { items: GenItem[]; targets: string[]; cardioMinutes: number } {
  const random = rng((opts.seed ?? 0) * 7919 + 17);
  const now = opts.now ?? Date.now();
  const targets = [...new Set(opts.targets)];
  const targetSet = new Set(targets);
  const mode = opts.cardio ?? defaultCardio(opts.goal, opts.sessionMinutes, opts.cardioPref);
  const cMin = cardioMinutes(mode, opts.goal, opts.sessionMinutes);
  const liftMinutes = Math.max(10, opts.sessionMinutes - cMin - 3);
  // n is a rough count used to size each muscle's "need"; the real stop is the clock (see below).
  const n = mode === "main" ? Math.min(3, Math.max(2, targets.length)) : exerciseCount(opts.goal, liftMinutes, targets.length);
  const maxN = mode === "main" ? n : opts.experience === "advanced" ? 10 : 9;
  const rec = (m: string) => opts.recovery?.get(m) ?? 100;
  const bigGym = !opts.gymEquipment || opts.gymEquipment.size >= 6;

  const pool = liftPool(cat, opts);
  // Scale what each muscle "needs" so longer sessions spread more work across the targets.
  const totalPriority = targets.reduce((a, m) => a + (MUSCLE_PRIORITY[m] ?? 0.8), 0);
  const scale = Math.max(1, n / Math.max(1, totalPriority));
  const need = new Map(targets.map((m) => [m, (MUSCLE_PRIORITY[m] ?? 0.8) * scale]));
  const chosen: Candidate[] = [];
  const jitter = new Map(pool.map((c) => [c.ex.id, random()]));
  const heavy = opts.goal === "strength" || opts.focus === "power";
  const mains = heavy ? 2 : 1;
  const preferFree = opts.experience !== "beginner";
  /** Rough sets an exercise will get, to keep each muscle under the per-session cap. */
  const estSets = (c: Candidate, i: number) => (!c.iso && c.loadable && i < mains ? (heavy ? 5 : 4) : 3);
  const setCap = setCapFor(opts.experience);
  const setsFor = new Map<string, number>();
  const hitDirect = new Set<string>();
  // Lower-body days want a knee-dominant lift (squat, leg press, lunge) AND a hip hinge for the hamstrings.
  const wantHinge = targetSet.has("hamstrings") && (targetSet.has("quads") || targetSet.has("glutes"));
  // Trap bar deadlifts work the quads but are a hinge: they don't count as the day's squat.
  const knee = (c: Candidate) => !c.iso && (c.ex.movement_pattern === "squat" || c.ex.movement_pattern === "lunge");
  const hip = (c: Candidate) => !c.iso && c.ex.movement_pattern === "hinge" && !/thrust|bridge/i.test(c.ex.name);
  // On a full-body day a back exercise matters more than the hinge; on lower days the hinge is a must.
  const upperToo = targets.some((m) => ["chest", "lats", "upper_back"].includes(m));
  const bwPull = (c: Candidate) => isBodyweightPull(c.ex, c.loadable);
  /** Barbell/dumbbell, machine/cable, or a bar you hang from: two rows or pulls should use different kinds. */
  const gearKind = (c: Candidate) => {
    const gear = c.equipment.split(",");
    return gear.some((e) => FREE_WEIGHTS.has(e)) ? "free" : gear.some((e) => GUIDED.test(e)) ? "guided" : gear.includes("pull_up_bar") ? "bar" : "other";
  };
  const canMain = (c: Candidate) =>
    c.loadable && !isSwing(c.ex.name) && (!heavy || ((c.free || !preferFree) && !ACCESSORY_HINGE.test(c.ex.name) && !NOT_HEAVY.test(c.ex.name) && !isUnilateral(c.ex.name)));
  const roleOf = (c: Candidate, i: number): Role => (isCore(c) ? "core" : c.iso ? "isolation" : i < mains && canMain(c) ? "main" : "compound");
  /** Minutes this exercise will take, rest included, before it's chosen. */
  const estMinutes = (c: Candidate, i: number) => {
    const d = dose(opts.goal, roleOf(c, i), opts.experience, opts.focus ?? null);
    const rest = opts.goal === "fat_loss" && i > 0 ? d.rest_sec * 0.5 : d.rest_sec;
    return (d.sets * (WORK_SEC * (isUnilateral(c.ex.name) ? 2 : 1) + rest)) / 60;
  };
  const easierPull = pool.some((c) => c.ex.movement_pattern === "vertical_pull" && !c.iso && !bwPull(c));
  // Target muscles worth their own exercise (forearms get enough from gripping).
  const coverable = targets.filter((m) => (MUSCLE_PRIORITY[m] ?? 0.8) >= 0.4);
  const uncovered = () => coverable.filter((m) => !hitDirect.has(m));
  let used = 0;

  const score = (c: Candidate) => {
    const prim = c.primary.map((m) => need.get(m) ?? 0).sort((a, b) => b - a);
    // It has to train something the session still needs as a main muscle.
    if (!prim[0]) return -Infinity;
    // Already near the per-session cap for one of its main muscles: pick something else.
    const i = chosen.length;
    if (c.primary.some((m) => targetSet.has(m) && (setsFor.get(m) ?? 0) + estSets(c, i) > setCap)) return -Infinity;
    // Only one deadlift-type lift per session.
    if (SPINAL_HINGE.test(c.ex.name) && chosen.some((o) => SPINAL_HINGE.test(o.ex.name))) return -Infinity;
    let s = prim[0] + 0.35 * prim.slice(1).reduce((a, b) => a + b, 0);
    // Every target muscle gets an exercise before any muscle gets a second one, and a second row,
    // press or pulldown waits until then too.
    const open = uncovered();
    if (open.length) {
      if (c.primary.some((m) => open.includes(m))) s += 1;
      else s -= 1;
      if (!c.iso && !isCore(c) && c.ex.movement_pattern !== "other" && chosen.some((o) => o.ex.movement_pattern === c.ex.movement_pattern && !o.iso)) s -= 2;
    }
    s += 0.2 * c.secondary.reduce((a, m) => a + (need.get(m) ?? 0), 0);
    const offTarget = c.primary.filter((m) => !targetSet.has(m)).length;
    s -= 0.6 * offTarget;
    const avgRec = c.primary.reduce((a, m) => a + rec(m), 0) / c.primary.length;
    s += 0.6 * (avgRec / 100 - 1);
    if (!c.iso && !isCore(c)) s += 0.3;
    if (wantHinge && !c.iso) {
      const hasKnee = chosen.some(knee);
      const hasHip = chosen.some(hip);
      const w = upperToo ? 0.4 : 1;
      if (hasKnee && !hasHip) s += hip(c) ? (1.2 + (c.primary.includes("hamstrings") ? 0.8 : 0)) * w : knee(c) ? -1 : 0;
      else if (hasHip && !hasKnee) s += knee(c) ? 1.2 * w : hip(c) ? -1 : 0;
      // Heavy lower days lead with a squat.
      else if (!hasKnee && heavy && !upperToo && knee(c) && canMain(c)) s += 0.8;
    }
    // The first lifts of the day carry the heaviest loading: free weights for anyone past the beginner stage.
    // (Barbells load heaviest, so at a full gym they lead; dumbbells are next.)
    if (i < mains && !c.iso && c.loadable && preferFree) s += c.free ? (heavy ? 0.6 : 0.3) + (bigGym && c.barbell ? 0.3 : 0) : heavy ? -0.4 : 0;
    if (!heavy && HEAVY_ONLY.has(c.ex.id)) s -= 1;
    // Heavy slots go to lifts that can actually be loaded heavy (not split squats, swings or goblet squats).
    if (heavy && i < mains && !c.iso && !canMain(c)) s -= 0.8;
    if (bigGym && LIGHT_SQUAT.has(c.ex.id) && opts.experience !== "beginner") s -= 0.6;
    // TRX rows and push-ups are for home and hotel gyms; a full gym has loadable versions.
    if (bigGym && !c.iso && !isCore(c) && !c.loadable && !bwPull(c)) s -= 0.5;
    if (opts.experience === "beginner") {
      // Beginners: machines and simple free-weight lifts first; pulldowns instead of pull-ups.
      if (bigGym && !c.iso && !c.free && c.loadable && c.equipment) s += 0.4;
      if (TECHNICAL.has(c.ex.id)) s -= 0.8;
      if (bwPull(c)) {
        if (easierPull) return -Infinity;
        s -= 1.5;
      }
    } else if (opts.goal === "fat_loss" && bwPull(c)) s -= 0.8;
    const tier = STAPLES[c.ex.id];
    if (tier === 1) s += chosen.length < 2 && !offTarget ? 0.8 : 0.5;
    else if (tier === 2) s += 0.35;
    // The day's lead lift is a staple (bench, squat, row, pull-up…), not JM press or a machine dip.
    if (i < mains && !c.iso && !isCore(c) && tier !== 1) s -= 0.8;
    // Specialist lifts by experience: rare for beginners, occasional otherwise.
    if (tierOf(c.ex) === "specialist") s -= opts.experience === "beginner" ? 1.2 : 0.3;
    // Weighted pull-ups are a low-rep strength lift: not for beginners or fat-loss circuits.
    if (isWeightedPull(c.ex.id) && (opts.experience === "beginner" || opts.goal === "fat_loss")) return -Infinity;
    // At a full gym, anyone past the beginner stage squats and presses with a free bar before a Smith machine.
    if (bigGym && preferFree && SMITH.test(c.ex.name) && !c.iso) s -= 0.7;
    // Presses: no two at the same bench angle, and never two inclines without a flat press.
    if (c.ex.movement_pattern === "horizontal_push" && !c.iso) {
      const angles = chosen.filter((o) => o.ex.movement_pattern === "horizontal_push" && !o.iso).map((o) => pressAngle(o.ex.name));
      const a = pressAngle(c.ex.name);
      if (a !== "flat" && angles.includes(a) && !angles.includes("flat")) return -Infinity;
      if (angles.includes(a)) s -= 1.5;
    }
    if (c.ex.movement_pattern === "other") s -= 0.2;
    if (!c.ex.is_common && !c.ex.owner_id) s -= 1.2;
    if (opts.prefs?.get(c.ex.id)?.favorite) s += 0.5;
    if (opts.avoid?.has(c.ex.id)) s -= 0.5;
    const last = opts.lastDone?.get(c.ex.id);
    if (last && now - last < 3 * 86_400_000) s -= 0.2;
    if (bigGym && !c.equipment && !isCore(c)) s -= 0.5;
    let samePattern = 0;
    for (const o of chosen) {
      const overlap = c.primary.some((m) => o.primary.includes(m));
      // Compound movements of one kind count as repeats when they share any muscle ("Machine Row" is
      // tagged lats-first, a T-bar row upper-back-first: still two rows). Isolation needs the same main muscle.
      const compoundPattern = c.ex.movement_pattern !== "isolation" && c.ex.movement_pattern !== "core";
      const related = overlap || (compoundPattern && [...c.primary, ...c.secondary].some((m) => o.primary.includes(m) || o.secondary.includes(m)));
      // Same exercise in another form (Barbell Row and Machine Row) counts as a repeat even when the tags differ.
      if (o.base === c.base && o.ex.movement_pattern === c.ex.movement_pattern) {
        s -= 1.5;
        continue;
      }
      if (!related) continue;
      if (overlap && (o.base === c.base || (o.equipment === c.equipment && o.primary.join() === c.primary.join() && o.ex.mechanic === c.ex.mechanic))) s -= 1.5;
      // A second row is fine; a third is too many. The penalty grows with each repeat of the movement.
      else if (o.ex.movement_pattern === c.ex.movement_pattern) {
        s -= REPEAT_PENALTY[Math.min(samePattern++, REPEAT_PENALTY.length - 1)];
        // A second row or pull should feel different: barbell then machine or cable, pull-up then pulldown.
        if (!c.iso && gearKind(o) === gearKind(c)) s -= 3;
      }
    }
    return s + 0.35 * (jitter.get(c.ex.id) ?? 0);
  };

  // Keep adding exercises while they fit the time. Uncovered target muscles may run a little over: the
  // sets get trimmed to fit afterwards.
  while (chosen.length < maxN) {
    let best: Candidate | null = null;
    let bestScore = -Infinity;
    const open = uncovered();
    for (const c of pool) {
      if (chosen.includes(c)) continue;
      if (mode !== "main" && chosen.length >= 2) {
        const slack = open.length && c.primary.some((m) => open.includes(m)) ? 1.25 : 1.05;
        if (used + estMinutes(c, chosen.length) > liftMinutes * slack) continue;
      }
      const s = score(c);
      if (s > bestScore) {
        best = c;
        bestScore = s;
      }
    }
    if (!best || bestScore < (chosen.length >= 3 ? 0.15 : -0.5)) break;
    for (const m of best.primary) setsFor.set(m, (setsFor.get(m) ?? 0) + estSets(best, chosen.length));
    used += estMinutes(best, chosen.length);
    chosen.push(best);
    const compound = !best.iso;
    for (const m of best.primary) if (need.has(m)) need.set(m, Math.max(0, need.get(m)! - (compound && DIRECT_WORK.has(m) ? 0.5 : 1)));
    for (const m of best.primary) hitDirect.add(m);
    // Rows work the rear delts and presses the triceps, but a target muscle still gets one direct exercise.
    for (const m of best.secondary) if (need.has(m)) need.set(m, Math.max(hitDirect.has(m) || (MUSCLE_PRIORITY[m] ?? 0.8) < 0.5 ? 0 : 0.4 * (MUSCLE_PRIORITY[m] ?? 0.8), need.get(m)! - 0.3));
  }

  // Main lifts first, then other compounds (bigger muscles first), then isolation, core last.
  const weight = (c: Candidate) => Math.max(...c.primary.map((m) => MUSCLE_PRIORITY[m] ?? 0.5));
  const rank = (c: Candidate) =>
    // Pull-ups and chins come straight after the main lifts (they're hardest when tired), before other compounds.
    isCore(c) ? 4 : c.iso ? 3 : bwPull(c) || isWeightedPull(c.ex.id) ? 0.5 : !c.loadable ? 2 : STAPLES[c.ex.id] === 1 ? 0 : 1;
  const freeFirst = (c: Candidate) => (preferFree && c.free ? 0 : 1);
  const legOrder = (c: Candidate) => (knee(c) ? (isUnilateral(c.ex.name) ? 0.7 : 0) : hip(c) ? 1 : 0.5);
  const uni = (c: Candidate) => (isUnilateral(c.ex.name) ? 1 : 0);
  chosen.sort((a, b) => rank(a) - rank(b) || (rank(a) <= 1 ? legOrder(a) - legOrder(b) || uni(a) - uni(b) || freeFirst(a) - freeFirst(b) : 0) || weight(b) - weight(a));

  let mainLeft = mains;
  const mainItems = new Set<GenItem>();
  const items: GenItem[] = chosen.map((c) => {
    // Heavy 3–5 rep work belongs on free weights; a machine or cable lift gets the "compound" dose instead.
    const role = isCore(c) ? "core" : c.iso ? "isolation" : canMain(c) && STAPLES[c.ex.id] === 1 && mainLeft-- > 0 ? "main" : "compound";
    const d = dose(opts.goal, role, opts.experience, opts.focus ?? null);
    const item: GenItem = { exercise_id: c.ex.id, ...d, superset_group: null, notes: null };
    if (isHold(c.ex.name)) return { ...item, rep_min: opts.experience === "beginner" ? 20 : 30, rep_max: opts.experience === "beginner" ? 30 : 45, notes: "seconds" };
    // Big leg lifts take longer to recover from between sets than presses and rows.
    if (role === "compound" && c.loadable && c.primary.some((m) => LOWER_BODY.has(m)) && !heavy) item.rest_sec = d.rest_sec + (opts.goal === "fat_loss" ? 15 : 30);
    if (role !== "main" && HEAVY_ONLY.has(c.ex.id)) return { ...item, rep_min: 5, rep_max: 8, rest_sec: Math.max(150, d.rest_sec), notes: "Stop each set with 2 reps in the tank" };
    // Swings are a power move: quick reps, short rest.
    if (isSwing(c.ex.name)) return { ...item, rep_min: 10, rep_max: 15, rest_sec: 60 };
    if (isWeightedPull(c.ex.id)) return { ...item, rep_min: 5, rep_max: 8, rest_sec: Math.max(120, d.rest_sec) };
    if (bwPull(c)) {
      if (opts.experience === "beginner") return { ...item, rep_min: 3, rep_max: 6, notes: "Use a band or a slow lowering if you can't do 3 yet" };
      if (!heavy) return { ...item, rep_min: 5, rep_max: 10 };
    }
    // Low-rep rows turn into heaving: heavy rows stay at 5–8.
    if (role === "main" && heavy && c.ex.movement_pattern === "horizontal_pull") { item.rep_min = 5; item.rep_max = 8; }
    if (role === "main") mainItems.add(item);
    return item;
  });

  // Fat loss: pair up the accessories as supersets to keep the pace up. Partners shouldn't share a main
  // muscle (chest press with a row, not with a fly), and heavy deadlifts stay on their own.
  if (opts.goal === "fat_loss" && opts.focus !== "power") {
    const byItem = new Map(chosen.map((c) => [c.ex.id, c]));
    // Pull-ups and chins stay on their own too: hard enough already, and they'd fight a curl for the biceps.
    const open = items.slice(1).filter((it) => !HEAVY_ONLY.has(it.exercise_id) && !isCore(byItem.get(it.exercise_id)!) && !bwPull(byItem.get(it.exercise_id)!) && !isWeightedPull(it.exercise_id));
    let group = 1;
    while (open.length >= 2) {
      const a = open.shift()!;
      const pa = byItem.get(a.exercise_id)!;
      const j = open.findIndex((b) => {
        const pb = byItem.get(b.exercise_id)!;
        const bothLegs = !pa.iso && !pb.iso && pa.primary.some((m) => LOWER_BODY.has(m)) && pb.primary.some((m) => LOWER_BODY.has(m));
        return !bothLegs && !pa.primary.some((m) => pb.primary.includes(m));
      });
      if (j < 0) continue;
      const [b] = open.splice(j, 1);
      a.superset_group = group;
      b.superset_group = group;
      group++;
    }
    // Keep partners next to each other.
    const order = new Map(items.map((it, k) => [it, k]));
    const anchor = (it: GenItem) => (it.superset_group === null ? order.get(it)! : Math.min(...items.filter((x) => x.superset_group === it.superset_group).map((x) => order.get(x)!)));
    items.sort((x, y) => anchor(x) - anchor(y) || order.get(x)! - order.get(y)!);
    // Pairing can pull a curl or fly ahead of the pull-ups: put them back right after the main lifts.
    const pulls = items.filter((it) => it.superset_group === null && (isWeightedPull(it.exercise_id) || bwPull(byItem.get(it.exercise_id)!)));
    if (pulls.length) {
      for (const it of pulls) items.splice(items.indexOf(it), 1);
      const lastMain = items.reduce((k, it, idx) => (mainItems.has(it) ? idx : k), 0);
      items.splice(lastMain + 1, 0, ...pulls);
    }
  }

  if (mode !== "main") fitToTime(items, chosen, liftMinutes, opts.experience, setCap, heavy, mainItems);

  // One warm-up set at most, and only when the first heavy lift really needs it (src/lib/warmup.ts).
  const firstMain = items.find((it) => mainItems.has(it));
  if (firstMain && warmupWorthy(cat.exercises.find((e) => e.id === firstMain.exercise_id), (cat.needs.get(firstMain.exercise_id) ?? []).map((n) => n.equipment_id), firstMain.rep_max)) {
    firstMain.notes = WARMUP_NOTE;
  }

  if (cMin > 0) {
    const cardio = pickCardio(cat, { ...opts, minutes: cMin }, random);
    if (cardio) items.push({ exercise_id: cardio, sets: 1, rep_min: null, rep_max: null, rest_sec: null, superset_group: null, notes: `${cMin} min` });
  }
  return { items, targets, cardioMinutes: cMin };
}

/** Rough minutes one exercise takes: ~40 s per set (twice for one-side-at-a-time lifts) plus rest. The
 *  first exercise of a superset has no rest: you go straight to its partner. */
export function itemMinutes(it: GenItem, name: string, items: GenItem[]) {
  const work = it.notes === "seconds" ? (it.rep_max ?? 40) : WORK_SEC;
  const partners = it.superset_group == null ? [] : items.filter((x) => x.superset_group === it.superset_group);
  const rest = partners.length > 1 && partners[0] !== it ? (it.rest_sec ?? 60) : partners.length > 1 ? 0 : (it.rest_sec ?? 60);
  return (it.sets * (work * (isUnilateral(name) ? 2 : 1) + rest)) / 60;
}

/**
 * Sets are adjusted to fill the session: too long and the biggest set counts come down (heavy lifts last);
 * time to spare and non-beginners get a 4th set on their exercises, as long as no muscle passes its cap.
 */
function fitToTime(items: GenItem[], chosen: Candidate[], minutes: number, experience: Experience, setCap: number, heavy: boolean, mainItems: Set<GenItem>) {
  const cand = new Map(chosen.map((c) => [c.ex.id, c]));
  const total = () => items.reduce((a, it) => a + itemMinutes(it, cand.get(it.exercise_id)!.ex.name, items), 0);
  const group = (it: GenItem) => (it.superset_group == null ? [it] : items.filter((x) => x.superset_group === it.superset_group));
  const isMain = (it: GenItem) => mainItems.has(it);
  for (let guard = 0; guard < 30 && total() > minutes * 1.08; guard++) {
    // Most sets first; among equals, trim from the end of the workout (isolation and core before compounds).
    const it = [...items].filter((x) => x.sets > (isMain(x) ? 3 : 2)).sort((a, b) => b.sets - a.sets || items.indexOf(b) - items.indexOf(a))[0];
    if (!it) break;
    for (const x of group(it)) x.sets = Math.max(isMain(x) ? 3 : 2, x.sets - 1);
  }
  // Still over (short sessions, heavy days with long rests): heavy lifts drop to 2 sets, then the last
  // accessory goes, as long as two exercises are left.
  for (let guard = 0; guard < 10 && total() > minutes * 1.08; guard++) {
    const it = [...items].reverse().find((x) => isMain(x) && x.sets > 2);
    if (!it) break;
    it.sets--;
  }
  for (let guard = 0; guard < 10 && total() > minutes * 1.08 && items.length > 2; guard++) {
    const last = [...items].reverse().find((x) => !isMain(x));
    if (!last) break;
    for (const x of group(last)) items.splice(items.indexOf(x), 1);
    if (last.superset_group != null) for (const x of items) if (x.superset_group === last.superset_group) x.superset_group = null;
  }
  if (experience === "beginner") return;
  const setsOn = (m: string) => items.reduce((a, it) => a + (cand.get(it.exercise_id)!.primary.includes(m) ? it.sets : 0), 0);
  const fits = (x: GenItem) => cand.get(x.exercise_id)!.primary.every((m) => setsOn(m) + 1 <= setCap);
  for (let guard = 0; guard < 30 && total() < minutes * 0.85; guard++) {
    // Compounds before isolation, in workout order; heavy days keep their accessories at 3.
    const it = items.find((x) => x.notes !== "seconds" && !isMain(x) && x.sets < 4 && !heavy && group(x).every((y) => y.sets < 4 && fits(y)));
    if (!it) break;
    for (const x of group(it)) x.sets++;
  }
}

/** A cardio exercise this gym supports, favoring favorites and the common machines. High-impact options
 *  (jump rope, running) are kept for short blocks and people past the beginner stage. */
export function pickCardio(
  cat: GenCatalog,
  opts: Pick<GenOptions, "gymEquipment" | "prefs"> & { experience?: Experience; minutes?: number },
  random: () => number = Math.random,
): string | null {
  const options = cat.exercises.filter(
    (e) => e.is_active && e.category === "cardio" && !opts.prefs?.get(e.id)?.excluded &&
      (!opts.gymEquipment || isAvailable(cat.needs.get(e.id) ?? [], opts.gymEquipment)),
  );
  const impact = (name: string) => HIGH_IMPACT.test(name) && !/walk/i.test(name);
  // Beginners skip jump rope and treadmill running when there's anything gentler (even a walk outside).
  const machines = options.filter((e) => (cat.needs.get(e.id) ?? []).length > 0 && !(opts.experience === "beginner" && impact(e.name)));
  const list = machines.length ? machines : options;
  if (!list.length) return null;
  const scored = list
    .map((e) => {
      const penalty = impact(e.name) ? (opts.experience === "beginner" ? 1.5 : (opts.minutes ?? 0) >= 15 ? 0.6 : 0) : 0;
      return { id: e.id, s: (e.is_common ? 1 : 0) + (opts.prefs?.get(e.id)?.favorite ? 2 : 0) + random() * 0.9 - penalty };
    })
    .sort((a, b) => b.s - a.s);
  return scored[0].id;
}

const EQUIPMENT_WORDS = new Set(["barbell", "dumbbell", "cable", "machine", "smith", "kettlebell", "band", "ez-bar", "seated", "standing"]);
const words = (name: string) => name.toLowerCase().split(/[\s/()-]+/).filter((w) => w.length > 2 && !EQUIPMENT_WORDS.has(w));

const jaccard = (a: string[], b: string[]) => {
  if (!a.length && !b.length) return 0;
  const sa = new Set(a);
  const inter = b.filter((x) => sa.has(x)).length;
  return inter / (a.length + b.length - inter);
};

export type Ranked = { id: string; score: number };

/** Why a swap is wanted, from the "Why?" chips. Shapes the ranking (and the AI's picks). */
export type SwapWhy = "busy" | "hurts" | "hard" | "different" | "impact" | "outdoors" | null;

const CARDIO_MACHINE = new Set(["treadmill", "stationary_bike", "recumbent_bike", "rower", "elliptical", "stair_climber", "air_bike", "ski_erg"]);
const OUTDOOR_GEAR = new Set(["bicycle", "skates", "jump_rope"]);
const HIGH_IMPACT_CARDIO = /run|jog|sprint|jump|rope|burpee|prowler/i;

/** Cardio this gym supports, best first: favorites, common machines, then the rest. */
export function rankCardio(
  cat: GenCatalog,
  opts: Pick<GenOptions, "gymEquipment" | "prefs"> & { from?: string; exclude?: Set<string>; why?: SwapWhy },
): Ranked[] {
  const from = opts.from ? cat.exercises.find((e) => e.id === opts.from) : undefined;
  const fromNeeds = new Set((opts.from ? cat.needs.get(opts.from) ?? [] : []).map((n) => n.equipment_id));
  const out: Ranked[] = [];
  for (const e of cat.exercises) {
    if (!e.is_active || e.category !== "cardio" || e.id === opts.from || opts.exclude?.has(e.id) || opts.prefs?.get(e.id)?.excluded) continue;
    const needs = cat.needs.get(e.id) ?? [];
    if (opts.gymEquipment && !isAvailable(needs, opts.gymEquipment)) continue;
    const machine = needs.some((n) => CARDIO_MACHINE.has(n.equipment_id));
    let score = (e.is_common ? 1 : 0) + (opts.prefs?.get(e.id)?.favorite ? 2 : 0) + (machine ? 0.6 : 0);
    const sameGear = needs.some((n) => fromNeeds.has(n.equipment_id));
    if (opts.why === "busy" || opts.why === "different") score += sameGear ? -2 : 0.4;
    else if (sameGear) score += 0.5; // e.g. treadmill run → incline treadmill walk
    if (opts.why === "impact") score += HIGH_IMPACT_CARDIO.test(e.name) ? -2 : 1;
    if (opts.why === "outdoors") score += needs.every((n) => OUTDOOR_GEAR.has(n.equipment_id)) ? (needs.length ? 2 : 2.5) : -1.5;
    if (from && from.name.split(" ")[0] === e.name.split(" ")[0]) score += 0.2;
    out.push({ id: e.id, score });
  }
  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/**
 * Replacements for an exercise at this gym, best first: same main muscles, same kind of movement,
 * favoring staples and favorites, avoiding what's already in the workout. Cardio gets other cardio.
 */
export function rankSwaps(
  cat: GenCatalog,
  exerciseId: string,
  opts: Pick<GenOptions, "gymEquipment" | "experience" | "prefs"> & { exclude?: Set<string>; why?: SwapWhy; inWorkout?: string[] },
): Ranked[] {
  const ex = cat.exercises.find((e) => e.id === exerciseId);
  if (!ex) return [];
  if (ex.category === "cardio") return rankCardio(cat, { ...opts, from: exerciseId });
  const p = primaries(cat, exerciseId);
  const s = secondaries(cat, exerciseId);
  const fromWords = new Set(words(ex.name));
  const fromNeeds = new Set((cat.needs.get(exerciseId) ?? []).map((n) => n.equipment_id));
  const todayBases = new Set((opts.inWorkout ?? []).filter((id) => id !== exerciseId).map((id) => baseName(cat.exercises.find((e) => e.id === id)?.name ?? "")));
  const out: Ranked[] = [];
  for (const c of liftPool(cat, { ...opts, experience: "advanced" })) {
    if (c.ex.id === exerciseId || opts.exclude?.has(c.ex.id)) continue;
    const pj = jaccard(p, c.primary);
    if (pj === 0) continue;
    let score = 3 * pj + jaccard(s, c.secondary);
    // The closest swap does the same movement with the same kind of gear: Barbell Row → Dumbbell Row beats Barbell Row → Pull-Up.
    if (c.ex.movement_pattern === ex.movement_pattern) score += 2;
    if (c.iso === isIsolation(ex)) score += 0.5;
    if (c.ex.is_common || c.ex.owner_id) score += 0.6;
    const cIds = c.equipment ? c.equipment.split(",") : [];
    const guidedKind = (ids: Iterable<string>) => [...ids].some((id) => GUIDED.test(id));
    if (cIds.length && cIds.every((id) => fromNeeds.has(id))) score += 1;
    else if (cIds.some((id) => fromNeeds.has(id))) score += 0.5;
    else if (guidedKind(cIds) === guidedKind(fromNeeds) && c.free === (cat.needs.get(exerciseId) ?? []).some((n) => FREE_WEIGHTS.has(n.equipment_id))) score += 0.4;
    if (!LEVELS[opts.experience].has(c.ex.level) && !c.ex.owner_id) score -= 0.8;
    if (opts.prefs?.get(c.ex.id)?.favorite) score += 0.3;
    if (STAPLES[c.ex.id]) score += STAPLES[c.ex.id] === 1 ? 0.5 : 0.25;
    // Similar names are usually the closest swap: "Bench Press" → "Dumbbell Bench Press".
    score += 0.3 * words(c.ex.name).filter((w) => fromWords.has(w)).length;
    // Already doing a version of it today: a different exercise is more useful.
    if (todayBases.has(c.base)) score -= 1.2;
    const sameGear = c.equipment !== "" && c.equipment.split(",").every((id) => fromNeeds.has(id));
    if (opts.why === "busy") score += sameGear ? -2 : 0;
    if (opts.why === "different") score += (sameGear ? -0.8 : 0) - 0.3 * words(c.ex.name).filter((w) => fromWords.has(w)).length;
    if (opts.why === "hurts" || opts.why === "hard") {
      // Machines and cables guide the path and are easier to control; free-weight compounds less so.
      const guided = c.equipment.split(",").some((id) => /machine|cable|smith|leverage|lever/.test(id));
      score += (guided ? 0.8 : 0) + (c.iso ? 0.4 : 0) + (c.ex.level === "beginner" ? 0.5 : -0.4) - (HEAVY_ONLY.has(c.ex.id) ? 1.5 : 0);
    }
    out.push({ id: c.ex.id, score });
  }
  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/**
 * The closest exercise this gym can do: same main muscles, same kind of movement.
 * Returns null when nothing sensible is available.
 */
export function closestMatch(
  cat: GenCatalog,
  exerciseId: string,
  opts: Pick<GenOptions, "gymEquipment" | "experience" | "prefs"> & { exclude?: Set<string> },
): string | null {
  const ex = cat.exercises.find((e) => e.id === exerciseId);
  if (!ex) return null;
  if (ex.category === "cardio") return pickCardio(cat, opts, () => 0);
  const best = rankSwaps(cat, exerciseId, opts)[0];
  return best && best.score >= 2 ? best.id : null;
}

/** Opposite muscles: a push-heavy session is better balanced with a little upper back and rear delt work. */
const BALANCE: Record<string, string[]> = {
  chest: ["upper_back", "rear_delts"], front_delts: ["rear_delts"], quads: ["hamstrings"], hamstrings: ["quads"],
};

/**
 * Exercises worth adding to a workout in progress, best first. Fills what today's muscles still need
 * (e.g. direct triceps work on a push day), adds a little balance (rear delts after lots of pressing)
 * and core if there is none. With an empty workout it leans on the freshest big muscles.
 */
export function rankAdditions(
  cat: GenCatalog,
  inWorkout: string[],
  opts: Pick<GenOptions, "gymEquipment" | "experience" | "prefs" | "recovery">,
): Ranked[] {
  const rec = (m: string) => opts.recovery?.get(m) ?? 100;
  const have = new Map<string, number>();
  const theme = new Set<string>();
  const lifts = inWorkout.filter((id) => cat.exercises.find((e) => e.id === id)?.category !== "cardio");
  for (const id of lifts) {
    const found = cat.exercises.find((e) => e.id === id);
    const compound = found ? !isIsolation(found) : false;
    for (const m of primaries(cat, id)) {
      theme.add(m);
      have.set(m, (have.get(m) ?? 0) + (compound && DIRECT_WORK.has(m) ? 0.5 : 1));
    }
    for (const m of secondaries(cat, id)) have.set(m, (have.get(m) ?? 0) + 0.25);
  }
  const need = new Map<string, number>();
  if (theme.size) {
    for (const m of theme) need.set(m, MUSCLE_PRIORITY[m] ?? 0.8);
    // Arms ride along with their compound partners: a push day wants triceps, a pull day biceps.
    if (theme.has("chest") || theme.has("front_delts")) need.set("triceps", Math.max(need.get("triceps") ?? 0, 1));
    if (theme.has("lats") || theme.has("upper_back")) need.set("biceps", Math.max(need.get("biceps") ?? 0, 1));
    for (const m of theme) for (const b of BALANCE[m] ?? []) if (!theme.has(b)) need.set(b, Math.max(need.get(b) ?? 0, 0.5));
    if (![...theme].some((m) => m === "abs" || m === "obliques")) need.set("abs", Math.max(need.get("abs") ?? 0, 0.6));
  } else {
    for (const [m, pr] of Object.entries(MUSCLE_PRIORITY)) need.set(m, pr * (rec(m) / 100));
  }
  const bases = new Set(inWorkout.map((id) => baseName(cat.exercises.find((e) => e.id === id)?.name ?? "")));
  const pool = liftPool(cat, opts).filter((c) => !inWorkout.includes(c.ex.id) && !bases.has(c.base));
  const scoreOf = (c: Candidate) => {
    let gain = 0;
    for (const m of c.primary) {
      const gap = Math.max(0, (need.get(m) ?? 0) - (have.get(m) ?? 0));
      // Muscles that aren't today's focus and are still tired from earlier days count for less.
      gain += theme.has(m) ? gap : gap * Math.min(1, rec(m) / 80);
    }
    if (gain <= 0) return -Infinity;
    let score = gain * 2;
    if (theme.size && c.iso) score += 0.4; // late in a session, accessories fit best
    if (!theme.size && !c.iso) score += 0.4;
    if (theme.size && HEAVY_ONLY.has(c.ex.id)) score -= 1.5; // not a mid-workout add-on
    if (c.ex.is_common || c.ex.owner_id) score += 0.5;
    if (opts.prefs?.get(c.ex.id)?.favorite) score += 0.5;
    if (STAPLES[c.ex.id]) score += STAPLES[c.ex.id] === 1 ? 0.4 : 0.5;
    return score;
  };
  const firstScore = new Map(pool.map((c) => [c.ex.id, scoreOf(c)]));
  // Greedy, like the generator: each pick covers some of what's needed, so the next one looks elsewhere.
  const out: Ranked[] = [];
  const left = [...pool];
  const pickedBases = new Set<string>();
  while (out.length < 8 && left.length) {
    let bi = -1;
    let bs = -Infinity;
    left.forEach((c, i) => {
      if (pickedBases.has(c.base)) return;
      const sc = scoreOf(c);
      if (sc > bs) [bi, bs] = [i, sc];
    });
    if (bi < 0 || bs === -Infinity) break;
    const [c] = left.splice(bi, 1);
    pickedBases.add(c.base);
    out.push({ id: c.ex.id, score: bs });
    for (const m of c.primary) have.set(m, (have.get(m) ?? 0) + 1);
  }
  // After the varied first picks, everything else that would help, best first (more choice for the AI).
  const rest = left
    .filter((c) => (firstScore.get(c.ex.id) ?? -Infinity) > -Infinity)
    .map((c) => ({ id: c.ex.id, score: firstScore.get(c.ex.id)! }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return [...out, ...rest];
}

/** Top `n` from a ranking, skipping exercises that are just versions of one already picked. */
export function topDistinct(cat: GenCatalog, ranked: Ranked[], n: number): string[] {
  const names = new Map(cat.exercises.map((e) => [e.id, e.name]));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of ranked) {
    const b = baseName(names.get(r.id) ?? r.id);
    if (seen.has(b)) continue;
    seen.add(b);
    out.push(r.id);
    if (out.length >= n) break;
  }
  return out;
}

export type Swap = { from: string; to: string | null };

/** Swaps anything the gym can't support for the closest match. Unmatched exercises are dropped. */
export function adaptToGym<T extends { exercise_id: string }>(
  cat: GenCatalog,
  items: T[],
  opts: Pick<GenOptions, "gymEquipment" | "experience" | "prefs">,
): { items: T[]; swaps: Swap[] } {
  if (!opts.gymEquipment) return { items, swaps: [] };
  const swaps: Swap[] = [];
  const used = new Set(items.map((i) => i.exercise_id));
  const out: T[] = [];
  for (const item of items) {
    if (isAvailable(cat.needs.get(item.exercise_id) ?? [], opts.gymEquipment)) {
      out.push(item);
      continue;
    }
    const to = closestMatch(cat, item.exercise_id, { ...opts, exclude: used });
    swaps.push({ from: item.exercise_id, to });
    if (to) {
      used.add(to);
      out.push({ ...item, exercise_id: to });
    }
  }
  return { items: out, swaps };
}

export type DayTemplate = { name: string; target_muscle_ids: string[] };

const PREVIEW_TARGETS = ["chest", "lats", "upper_back", "side_delts", "quads", "hamstrings", "glutes", "abs"];

/**
 * What a session of this length looks like, from the generator itself (onboarding's hint): a full-body
 * day at a full gym, median of a few shuffles. Lifts counts exercises; cardio is the block's minutes.
 */
export function previewSession(
  cat: GenCatalog,
  opts: { goal: Goal; experience: Experience; sessionMinutes: number; cardioPref?: CardioPref },
): { lifts: number; sets: number; cardioMinutes: number } {
  const runs = [0, 1, 2].map((seed) =>
    generateWorkout(cat, { ...opts, targets: PREVIEW_TARGETS, gymEquipment: null, prefs: new Map(), seed } as GenOptions),
  );
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const lifts = runs.map((r) => r.items.filter((i) => !/min$/.test(i.notes ?? "")));
  return {
    lifts: median(lifts.map((l) => l.length)),
    sets: median(lifts.map((l) => l.reduce((a, i) => a + i.sets, 0))),
    cardioMinutes: runs[0].cardioMinutes,
  };
}

/**
 * Builds every day of a plan from a split. Repeated days (Push A / Push B) steer away from each
 * other's exercises so the week has some variety.
 */
export function buildPlanDays(
  cat: GenCatalog,
  days: DayTemplate[],
  opts: Omit<GenOptions, "targets" | "avoid" | "cardio" | "focus" | "recovery" | "lastDone">,
): { name: string; target_muscle_ids: string[]; items: GenItem[] }[] {
  const out: { name: string; target_muscle_ids: string[]; items: GenItem[] }[] = [];
  const usedFor = new Map<string, Set<string>>();
  days.forEach((d, i) => {
    const key = [...d.target_muscle_ids].sort().join(",");
    const style = dayStyle(d.name);
    const avoid = usedFor.get(key) ?? new Set<string>();
    const { items } = generateWorkout(cat, {
      ...opts,
      targets: d.target_muscle_ids,
      avoid,
      seed: (opts.seed ?? 0) * 31 + i,
      cardio: style.cardio ?? undefined,
      focus: style.focus,
    });
    usedFor.set(key, new Set([...avoid, ...items.map((x) => x.exercise_id)]));
    out.push({ name: d.name, target_muscle_ids: d.target_muscle_ids, items });
  });
  return out;
}
