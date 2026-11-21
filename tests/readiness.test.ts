import { describe, expect, it } from "vitest";
import { F_MAX, scoreFor, stateFor, type MuscleRecovery } from "@/lib/recovery";
import { FIXED_VIEWS, formatWait, groupReadiness, groupsFor, planGroups, targetGroups, READY_AVG } from "@/lib/readiness";
// Real split definitions, so the "My plan" grouping is tested against what the app actually builds.
import { MUSCLES, SPLITS } from "../scripts/catalog-data.mjs";

const ALL = MUSCLES.map((m: unknown[]) => m[0] as string);
const TAU = new Map<string, number>(MUSCLES.map((m: unknown[]) => [m[0] as string, m[4] as number]));
const known = new Set(ALL);

/** Recovery map from target scores (everything not listed is 100%). */
function rec(scores: Record<string, number>) {
  const map = new Map<string, MuscleRecovery>();
  for (const id of ALL) {
    const score = scores[id] ?? 100;
    const fatigue = (1 - score / 100) * F_MAX;
    map.set(id, { muscleId: id, score: scoreFor(fatigue), state: stateFor(score), fatigue, autoScore: score, autoFatigue: fatigue, adjusted: false, lastTrained: null, primarySets: 0, secondarySets: 0 });
  }
  return map;
}
const days = (id: string) => (SPLITS.find((s: { id: string }) => s.id === id)!.dayList as [string, string[]][]).map(([name, target_muscle_ids]) => ({ name, target_muscle_ids }));
const names = (id: string) => planGroups(days(id), known)?.map((g) => g.name) ?? null;

describe("My plan groups", () => {
  it("use the plan's own days, merging repeats", () => {
    expect(names("ppl_3")).toEqual(["Push", "Pull", "Legs"]);
    expect(names("ppl_6")).toEqual(["Push", "Pull", "Legs"]);
    expect(names("upper_lower_4")).toEqual(["Upper", "Lower"]);
    expect(names("phul_4")).toEqual(["Upper", "Lower"]);
    expect(names("torso_limbs_4")).toEqual(["Torso", "Limbs"]);
    expect(names("bro_5")).toEqual(["Chest", "Back", "Shoulders", "Arms", "Legs"]);
    expect(names("arnold_6")).toEqual(["Chest & Back", "Shoulders & Arms", "Legs"]);
    expect(names("ul_ppl_5")).toEqual(["Upper", "Lower", "Push", "Pull", "Legs"]);
    expect(names("hybrid_4")).toEqual(["Upper", "Lower", "Full Body", "Core"]);
  });

  it("fall back to Upper / Lower / Core for full-body plans or no plan", () => {
    expect(names("full_body_2")).toBeNull();
    expect(names("full_body_3")).toBeNull();
    expect(planGroups([], known)).toBeNull();
    expect(groupsFor("plan", null)).toEqual(FIXED_VIEWS.upper_lower);
  });

  it("every fixed view only uses real muscles", () => {
    for (const groups of Object.values(FIXED_VIEWS)) for (const g of groups) for (const m of g.muscles) expect(known.has(m)).toBe(true);
  });
});

describe("group readiness", () => {
  const push = FIXED_VIEWS.ppl[0];

  it("is ready when the average is 80%+ and nothing is fatigued", () => {
    const r = groupReadiness(push, rec({ chest: 82, triceps: 78 }), TAU);
    expect(r.ready).toBe(true);
    expect(r.hoursToReady).toBe(0);
  });

  it("one fatigued muscle holds the group back even with a good average", () => {
    const back = FIXED_VIEWS.body_part[1]; // lats, upper back, traps, lower back
    const r = groupReadiness(back, rec({ lower_back: 50 }), TAU);
    expect(r.score).toBeGreaterThanOrEqual(READY_AVG);
    expect(r.ready).toBe(false);
    expect(r.hoursToReady).toBeGreaterThan(0);
  });

  it("projects the wait: a hard leg day is ready in about two days, a light one sooner", () => {
    const hard = groupReadiness(FIXED_VIEWS.ppl[2], rec({ quads: 25, glutes: 30, hamstrings: 40, adductors: 50, calves: 70 }), TAU);
    const light = groupReadiness(FIXED_VIEWS.ppl[2], rec({ quads: 70, glutes: 72 }), TAU);
    expect(hard.hoursToReady).toBeGreaterThan(24);
    expect(hard.hoursToReady).toBeLessThan(72);
    expect(light.hoursToReady).toBeLessThan(hard.hoursToReady);
    // Once that time has passed, the projection agrees it's ready.
    expect(groupReadiness(FIXED_VIEWS.ppl[2], rec({}), TAU).ready).toBe(true);
  });

  it("formats the wait", () => {
    expect(formatWait(0.4)).toBe("<1 h");
    expect(formatWait(23.4)).toBe("~23 h");
    expect(formatWait(47)).toBe("~47 h");
    expect(formatWait(50)).toBe("~2 days");
    expect(formatWait(60)).toBe("~2½ days");
    expect(formatWait(200)).toBe("7+ days");
    expect(formatWait(Infinity)).toBe("7+ days");
  });
});

describe("targetGroups (rows on the Up Next card)", () => {
  it("groups an upper day by body part, in the order the muscles appear", () => {
    expect(targetGroups(["chest", "front_delts", "side_delts", "rear_delts", "biceps", "triceps", "lats", "upper_back"])).toEqual([
      { name: "Chest", muscles: ["chest"] },
      { name: "Shoulders", muscles: ["front_delts", "side_delts", "rear_delts"] },
      { name: "Arms", muscles: ["biceps", "triceps"] },
      { name: "Back", muscles: ["lats", "upper_back"] },
    ]);
  });
  it("holds only the workout's own muscles (push day: Arms is just triceps)", () => {
    expect(targetGroups(["chest", "front_delts", "side_delts", "triceps"]).map((g) => [g.name, g.muscles.length])).toEqual([["Chest", 1], ["Shoulders", 2], ["Arms", 1]]);
  });
  it("a leg day is Legs plus Core", () => {
    expect(targetGroups(["quads", "hamstrings", "glutes", "calves", "adductors", "abductors", "abs"])).toEqual([
      { name: "Legs", muscles: ["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"] },
      { name: "Core", muscles: ["abs"] },
    ]);
  });
  it("puts every muscle in exactly one row, and no row is empty", () => {
    const rows = targetGroups(ALL);
    expect(rows.flatMap((g) => g.muscles).sort()).toEqual([...ALL].sort());
    expect(rows.every((g) => g.muscles.length > 0)).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(6);
  });
  it("gives an unknown muscle its own row; nothing in, nothing out", () => {
    expect(targetGroups(["chest", "mystery"])).toEqual([{ name: "Chest", muscles: ["chest"] }, { name: "mystery", muscles: ["mystery"] }]);
    expect(targetGroups([])).toEqual([]);
  });
});
