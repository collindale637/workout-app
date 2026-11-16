import { describe, expect, it } from "vitest";
import { effectiveBodyweight, estimateStartingWeight, type StartingProfile } from "@/lib/starting-weights";
import { suggestNext } from "@/lib/progression";
import { cmToInches, formatHeight, inchesToCm, splitFeetInches } from "@/lib/units";

const needs = (...ids: string[]) => ids.map((equipment_id) => ({ exercise_id: "x", option_group: 0, equipment_id }));
const man: StartingProfile = { bodyweightLb: 180, heightIn: 70, sex: "male", experience: "beginner" };
const woman: StartingProfile = { bodyweightLb: 140, heightIn: 65, sex: "female", experience: "beginner" };

const est = (who: StartingProfile, over: Partial<Parameters<typeof estimateStartingWeight>[0]> = {}) =>
  estimateStartingWeight({
    name: "Barbell Bench Press", pattern: "horizontal_push", primaryMuscles: ["chest"], needs: needs("barbell", "flat_bench"),
    gymRows: null, repMin: 8, repMax: 10, who, ...over,
  });

describe("estimateStartingWeight", () => {
  it("gives a sensible, plate-loadable barbell weight", () => {
    const w = est(man)!;
    expect(w).toBeGreaterThanOrEqual(55);
    expect(w).toBeLessThanOrEqual(85);
    expect((w - 45) % 5).toBe(0); // bar plus 2.5 lb plates in pairs
  });

  it("starts women and 'prefer not to say' lighter, never below the empty bar", () => {
    expect(est(woman)).toBe(45);
    const unsaid = est({ ...man, sex: null })!;
    expect(unsaid).toBeLessThan(est(man)!);
    expect(unsaid).toBeGreaterThanOrEqual(45);
  });

  it("goes up with experience and with bodyweight", () => {
    const sq = (w: StartingProfile) => est(w, { name: "Barbell Squat", pattern: "squat", primaryMuscles: ["quads"], needs: needs("barbell", "power_rack") })!;
    expect(sq({ ...man, experience: "intermediate" })).toBeGreaterThan(sq(man));
    expect(sq({ ...man, experience: "advanced" })).toBeGreaterThan(sq({ ...man, experience: "intermediate" }));
    expect(sq({ ...man, bodyweightLb: 220, heightIn: 74 })).toBeGreaterThan(sq(man));
  });

  it("gives lighter weights for more reps", () => {
    expect(est({ ...man, experience: "intermediate" }, { repMin: 12, repMax: 15 })!).toBeLessThan(est({ ...man, experience: "intermediate" }, { repMin: 4, repMax: 6 })!);
  });

  it("uses a per-hand weight in the gym's dumbbell steps, within its range", () => {
    const db = (rows: { equipment_id: string; details: object }[] | null, who = man) =>
      est(who, { name: "Dumbbell Bench Press", needs: needs("dumbbells", "flat_bench"), gymRows: rows })!;
    const w = db([{ equipment_id: "dumbbells", details: { dumbbell_step: 2.5, dumbbell_min: 5, dumbbell_max: 50 } }]);
    expect(w).toBeLessThan(est(man)!);
    expect((w * 10) % 25).toBe(0);
    expect(w).toBeGreaterThanOrEqual(5);
    const light = db([{ equipment_id: "dumbbells", details: { dumbbell_step: 5, dumbbell_min: 10, dumbbell_max: 15 } }], { ...man, experience: "advanced", bodyweightLb: 250, heightIn: 80 });
    expect(light).toBe(15); // clamped to the heaviest dumbbell here
  });

  it("picks a kettlebell from the gym's ladder", () => {
    const w = est(man, { name: "Goblet Squat", pattern: "squat", primaryMuscles: ["quads"], needs: needs("kettlebells"), gymRows: [{ equipment_id: "kettlebells", details: { kettlebells: [18, 26, 35, 44] } }] })!;
    expect([18, 26, 35, 44]).toContain(w);
  });

  it("returns null when there's nothing sensible to suggest", () => {
    expect(est({ ...man, bodyweightLb: null })).toBeNull();
    expect(est(man, { name: "Pull-Up", pattern: "vertical_pull", primaryMuscles: ["lats"], needs: needs("pull_up_bar") })).toBeNull(); // bodyweight
    expect(est(man, { name: "Push-Up", pattern: "horizontal_push", needs: [] })).toBeNull();
    expect(est(man, { name: "Kettlebell Swing", pattern: "hinge", needs: needs("kettlebells") })).toBeNull(); // power lift, not modelled
    expect(est(man, { name: "Treadmill", pattern: "cardio", needs: needs("treadmill") })).toBeNull();
  });

  it("caps machine weights at the stack", () => {
    const w = est({ ...man, experience: "advanced", bodyweightLb: 250, heightIn: 78 }, {
      name: "Leg Press", pattern: "squat", primaryMuscles: ["quads"], needs: needs("leg_press"), gymRows: [{ equipment_id: "leg_press", details: { stack_max: 100 } }],
    })!;
    expect(w).toBe(100);
  });
});

describe("effectiveBodyweight", () => {
  it("caps at the BMI-30 weight for the height, and leaves lighter people alone", () => {
    expect(effectiveBodyweight(300, 70)).toBeCloseTo((30 * 70 * 70) / 703, 5);
    expect(effectiveBodyweight(160, 70)).toBe(160);
    expect(effectiveBodyweight(300, null)).toBe(300);
  });
});

describe("suggestNext with an estimate", () => {
  const load = { increment: 5 };
  it("uses the estimate only when there's no history", () => {
    expect(suggestNext([], 8, 10, load, 65)).toMatchObject({ weight: 65, reps: 10, change: "new", estimated: true });
    expect(suggestNext([], 8, 10, load)).toMatchObject({ weight: null, change: "new" });
    const hist = [{ weight: 100, reps: 10, type: "working" as const }, { weight: 100, reps: 10, type: "working" as const }];
    expect(suggestNext(hist, 8, 10, load, 65)).toMatchObject({ weight: 105, change: "up" });
  });
});

describe("height units", () => {
  it("converts and formats", () => {
    expect(splitFeetInches(70.5)).toEqual({ ft: 5, inch: 10.5 });
    expect(formatHeight(70, "lb")).toBe(`5'10"`);
    expect(formatHeight(70, "kg")).toBe("178 cm");
    expect(cmToInches(inchesToCm(68))).toBeCloseTo(68, 0);
    expect(formatHeight(null, "lb")).toBe("");
  });
});
