import { describe, expect, it } from "vitest";
import { buildPlanDays } from "@/lib/generator";
import { AVOID_AREAS, areasHit, injuryExcluded, loadsArea, withInjuries, type AvoidArea } from "@/lib/injuries";
import { avoidLines } from "@/lib/ai/prompts";
import { catalog, commercialGym, nameOf } from "./fixtures/catalog";
import { SPLITS } from "../scripts/catalog-data.mjs";

const primaryOf = (id: string) => (catalog.musclesOf.get(id) ?? []).filter((m) => m.role === "primary").map((m) => m.muscle_id);
const active = catalog.exercises.filter((e) => e.is_active && ["strength", "powerlifting", "olympic_weightlifting"].includes(e.category));
const byName = (id: string) => catalog.exercises.find((e) => e.id === id)!;

describe("injury rules", () => {
  it("flags the obvious exercises and leaves the safe ones", () => {
    expect(loadsArea(byName("Barbell_Squat"), "knees")).toBe(true);
    expect(loadsArea(byName("Barbell_Bench_Press_-_Medium_Grip"), "knees")).toBe(false);
    expect(loadsArea(byName("Barbell_Deadlift"), "lower_back")).toBe(true);
    expect(loadsArea(byName("Leg_Press"), "knees")).toBe(false);
    expect(areasHit(byName("Barbell_Squat"), ["knees", "lower_back", "wrists"])).toEqual(["knees", "lower_back"]);
  });

  it("each area rules out something, but never most of the library", () => {
    for (const a of AVOID_AREAS) {
      const n = injuryExcluded(active, primaryOf, [a]).size;
      expect(n, a).toBeGreaterThan(0);
      expect(n / active.length, a).toBeLessThan(0.45);
    }
  });

  it("all areas at once still leaves plenty to train with", () => {
    const left = active.filter((e) => !injuryExcluded(active, primaryOf, [...AVOID_AREAS]).has(e.id) && e.is_common);
    expect(left.length).toBeGreaterThan(60);
  });

  it("withInjuries marks ruled-out exercises never-suggest and drops favorites on them", () => {
    const prefs = new Map([["Barbell_Squat", { exercise_id: "Barbell_Squat", favorite: true, excluded: false }]]);
    const out = withInjuries(prefs, new Set(["Barbell_Squat", "Leg_Press"]));
    expect(out.get("Barbell_Squat")).toMatchObject({ excluded: true, favorite: false });
    expect(out.get("Leg_Press")?.excluded).toBe(true);
    expect(withInjuries(prefs, new Set())).toBe(prefs);
  });
});

describe("plans steer around flagged areas", () => {
  const areaSets: AvoidArea[][] = [["knees"], ["lower_back"], ["shoulders"], ["knees", "lower_back", "wrists"]];
  for (const areas of areaSets) {
    it(`never picks an exercise that loads ${areas.join(" + ")}`, () => {
      const prefs = withInjuries(new Map(), injuryExcluded(catalog.exercises.filter((e) => e.is_active), primaryOf, areas));
      const bad: string[] = [];
      for (const goal of ["hypertrophy", "fat_loss", "strength"] as const)
        for (const seed of [0, 1, 2]) {
          const s = (SPLITS as unknown as { dayList: [string, string[]][] }[])[0];
          const days = buildPlanDays(catalog, s.dayList.map(([name, target_muscle_ids], i) => ({ name, target_muscle_ids, day_order: i + 1 })) as never, {
            gymEquipment: commercialGym, goal, experience: "intermediate", sessionMinutes: 60, prefs, seed, cardioPref: "auto",
          } as never);
          for (const d of days) for (const x of d.items) if (prefs.get(x.exercise_id)?.excluded) bad.push(`${d.name}: ${nameOf(x.exercise_id)}`);
        }
      expect(bad).toEqual([]);
    });
  }
});

describe("AI prompt", () => {
  const base = { goal: "hypertrophy", experience: "beginner", days_per_week: 3, session_minutes: 45, units: "lb", default_rpe: 8 } as const;
  it("says nothing when there's nothing to avoid", () => {
    expect(avoidLines({ ...base })).toEqual([]);
  });
  it("lists areas, ignores unknown ones, and keeps the note short and on one line", () => {
    const lines = avoidLines({ ...base, avoid_areas: ["knees", "soul"], injury_note: `left shoulder\n\npinches ${"x".repeat(400)}` }).join("\n");
    expect(lines).toContain("go easy on: knees.");
    expect(lines).not.toContain("soul");
    expect(lines).toContain("left shoulder pinches");
    expect(lines.length).toBeLessThan(700);
    expect(lines).not.toMatch(/\n\n.*pinches/);
  });
});
