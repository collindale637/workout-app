import type { Exercise, ExercisePref } from "@/lib/db/types";

/*
  "Anything to avoid?": body areas that are sore or injured. An exercise that loads a flagged area is treated
  like "Never suggest", so plans, swaps, Today and AI all steer around it without each needing to know.
  The rules are deliberately cautious and name-based (the catalog has no joint data); they are a guide only.
  Leg press, leg extension and hip thrusts stay available as gentler options.
*/

export const AVOID_AREAS = ["knees", "lower_back", "shoulders", "elbows", "wrists", "hips", "neck", "ankles"] as const;
export type AvoidArea = (typeof AVOID_AREAS)[number];

export const AREA_LABELS: Record<AvoidArea, string> = {
  knees: "Knees",
  lower_back: "Lower back",
  shoulders: "Shoulders",
  elbows: "Elbows",
  wrists: "Wrists",
  hips: "Hips",
  neck: "Neck",
  ankles: "Ankles",
};

export const INJURY_NOTE_MAX = 300;
export const INJURY_DISCLAIMER = "Consult a doctor if you experience any pain. Not medical advice.";

const IMPACT = /jump|hop\b|hops\b|skip|plyo|bound|burpee|jacks?\b|box |sprint|\brun(ning)?\b|jog|rope|stair|skater|clap/i;

const RULES: Record<AvoidArea, { name: RegExp; patterns?: string[]; primary?: string[] }> = {
  knees: { name: new RegExp(`squat|lunge|step-?up|pistol|sissy|hack|${IMPACT.source}`, "i") },
  lower_back: {
    name: /deadlift|good ?morning|bent[- ]over|barbell row|t-bar|pendlay|clean|snatch|jerk|swing|back extension|hyperextension|superman|sit-?up|russian twist|jefferson|zercher|(back|front|overhead) squat/i,
  },
  shoulders: { name: /overhead|military|arnold|upright row|behind[- ]the[- ]neck|snatch|jerk|push press|handstand|dip|pull-?over|fly\b|flye/i, patterns: ["vertical_push"] },
  elbows: { name: /skull|crusher|french|lying (triceps|tricep)|triceps extension|overhead.*(triceps|tricep)|\bdips?\b|close[- ]grip|preacher/i },
  wrists: { name: /push-?up|plank|front squat|clean|snatch|handstand|wrist|reverse curl|crawl|mountain climber|burpee|bench dip/i },
  hips: { name: /sumo|lunge|split squat|bulgarian|cossack|hip (abduct|adduct)|abduction|adduction|hanging leg raise|pistol/i, primary: ["adductors", "abductors"] },
  neck: { name: /shrug|neck|behind[- ]the[- ]neck|bridge|upright row|headstand/i, primary: ["traps"] },
  ankles: { name: new RegExp(`calf raise|${IMPACT.source}`, "i"), primary: ["calves"] },
};

type Basic = Pick<Exercise, "name" | "movement_pattern">;

/** Does this exercise load the area? `primary` is the exercise's primary muscle ids (helps hips, neck, ankles). */
export function loadsArea(ex: Basic, area: AvoidArea, primary: readonly string[] = []): boolean {
  const rule = RULES[area];
  return rule.name.test(ex.name) || Boolean(ex.movement_pattern && rule.patterns?.includes(ex.movement_pattern)) || Boolean(rule.primary?.some((m) => primary.includes(m)));
}

/** Which of the flagged areas this exercise loads (for "Steering around: Knees"). */
export function areasHit(ex: Basic, areas: readonly AvoidArea[], primary: readonly string[] = []): AvoidArea[] {
  return areas.filter((a) => loadsArea(ex, a, primary));
}

export const isAvoidArea = (v: unknown): v is AvoidArea => typeof v === "string" && (AVOID_AREAS as readonly string[]).includes(v);

/** The ids of every exercise the flagged areas rule out. */
export function injuryExcluded(
  exercises: readonly (Basic & { id: string; is_active?: boolean })[],
  primaryOf: (id: string) => readonly string[],
  areas: readonly AvoidArea[],
): Set<string> {
  const out = new Set<string>();
  if (!areas.length) return out;
  for (const ex of exercises) if (areasHit(ex, areas, primaryOf(ex.id)).length) out.add(ex.id);
  return out;
}

/** Your "Never suggest" list plus everything the flagged areas rule out. Favorites on a ruled-out exercise are ignored. */
export function withInjuries(prefs: Map<string, ExercisePref>, ruledOut: Set<string>): Map<string, ExercisePref> {
  if (!ruledOut.size) return prefs;
  const out = new Map(prefs);
  for (const id of ruledOut) out.set(id, { exercise_id: id, favorite: false, excluded: true });
  return out;
}
