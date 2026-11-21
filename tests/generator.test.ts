import { describe, expect, it } from "vitest";
import { adaptToGym, baseName, closestMatch, dayStyle, generateWorkout, isTimed, pickCardio, type GenOptions } from "@/lib/generator";
import { isAvailable } from "@/lib/availability";
import { loadFor, suggestNext } from "@/lib/progression";
import { bodyweightGym, catalog, commercialGym, homeGym, hotelGym } from "./fixtures/catalog";

const PUSH = ["chest", "front_delts", "side_delts", "triceps"];
const LEGS = ["quads", "hamstrings", "glutes", "calves", "adductors", "abductors", "abs"];
const base: GenOptions = { targets: PUSH, gymEquipment: commercialGym, goal: "hypertrophy", experience: "intermediate", sessionMinutes: 60 };
const primaryOf = (id: string) => (catalog.musclesOf.get(id) ?? []).filter((m) => m.role === "primary").map((m) => m.muscle_id);
const byId = new Map(catalog.exercises.map((e) => [e.id, e]));

describe("generator", () => {
  it("is repeatable for the same inputs, and Regenerate (a new seed) changes it", () => {
    const a = generateWorkout(catalog, { ...base, seed: 3 });
    const b = generateWorkout(catalog, { ...base, seed: 3 });
    expect(a).toEqual(b);
    const others = [4, 5, 6].map((seed) => generateWorkout(catalog, { ...base, seed }).items.map((i) => i.exercise_id).join());
    expect(others.some((o) => o !== a.items.map((i) => i.exercise_id).join())).toBe(true);
  });

  it("covers every main target on a push day, starting with a loaded chest press", () => {
    for (const seed of [0, 1, 2, 3, 4]) {
      const { items } = generateWorkout(catalog, { ...base, seed });
      const hit = new Set(items.flatMap((i) => primaryOf(i.exercise_id)));
      for (const m of ["chest", "side_delts", "triceps"]) expect(hit.has(m), `seed ${seed} misses ${m}`).toBe(true);
      expect(primaryOf(items[0].exercise_id)).toContain("chest");
      expect(byId.get(items[0].exercise_id)!.mechanic).toBe("compound");
      expect(items.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("only uses equipment the gym has", () => {
    for (const gym of [homeGym, hotelGym, bodyweightGym]) {
      for (const targets of [PUSH, LEGS]) {
        const { items } = generateWorkout(catalog, { ...base, targets, gymEquipment: gym });
        for (const i of items) expect(isAvailable(catalog.needs.get(i.exercise_id) ?? [], gym), i.exercise_id).toBe(true);
      }
    }
  });

  it("never suggests an excluded exercise", () => {
    const first = generateWorkout(catalog, base).items[0].exercise_id;
    const prefs = new Map([[first, { exercise_id: first, favorite: false, excluded: true }]]);
    expect(generateWorkout(catalog, { ...base, prefs }).items.map((i) => i.exercise_id)).not.toContain(first);
  });

  it("respects experience level", () => {
    const { items } = generateWorkout(catalog, { ...base, targets: LEGS, experience: "beginner" });
    for (const i of items) expect(byId.get(i.exercise_id)!.level).toBe("beginner");
  });

  it("doses by goal: strength is heavy with long rests, beginners get at most 3 sets", () => {
    const s = generateWorkout(catalog, { ...base, goal: "strength" }).items[0];
    expect(s).toMatchObject({ sets: 5, rep_min: 3, rep_max: 5, rest_sec: 180 });
    const b = generateWorkout(catalog, { ...base, goal: "strength", experience: "beginner" }).items;
    expect(Math.max(...b.map((i) => i.sets))).toBeLessThanOrEqual(3);
  });

  it("session length sets how many exercises", () => {
    const short = generateWorkout(catalog, { ...base, targets: LEGS, sessionMinutes: 30 }).items.length;
    const long = generateWorkout(catalog, { ...base, targets: LEGS, sessionMinutes: 75 }).items.length;
    expect(short).toBeLessThan(long);
  });

  it("adds cardio for fat loss and supersets the accessories", () => {
    const { items, cardioMinutes } = generateWorkout(catalog, { ...base, goal: "fat_loss", sessionMinutes: 50 });
    const last = items[items.length - 1];
    expect(byId.get(last.exercise_id)!.category).toBe("cardio");
    expect(last.notes).toBe(`${cardioMinutes} min`);
    expect(items.some((i) => i.superset_group !== null)).toBe(true);
  });

  it("reads the day name: power days are heavy, + Cardio days get a cardio block", () => {
    expect(dayStyle("Upper Power")).toEqual({ cardio: null, focus: "power" });
    expect(dayStyle("Full Body + Cardio").cardio).toBe("block");
    expect(dayStyle("Cardio + Core").cardio).toBe("main");
    const power = generateWorkout(catalog, { ...base, targets: LEGS, focus: "power" }).items[0];
    expect(power.rep_max).toBe(5);
  });

  it("leans away from fatigued muscles when choosing between exercises", () => {
    const fresh = generateWorkout(catalog, { ...base, targets: ["chest", "triceps", "front_delts", "side_delts", "biceps"] }).items;
    const tired = generateWorkout(catalog, {
      ...base, targets: ["chest", "triceps", "front_delts", "side_delts", "biceps"], recovery: new Map([["triceps", 20]]),
    }).items;
    const count = (list: typeof fresh) => list.filter((i) => primaryOf(i.exercise_id).includes("triceps")).length;
    expect(count(tired)).toBeLessThanOrEqual(count(fresh));
  });
});

describe("generator tuning (Phase 4)", () => {
  const PULL = ["lats", "upper_back", "rear_delts", "biceps", "traps"];
  const UPPER = ["chest", "lats", "upper_back", "front_delts", "side_delts", "rear_delts", "biceps", "triceps"];
  const names = (items: { exercise_id: string }[]) => items.map((i) => byId.get(i.exercise_id)!);

  it("treats equipment variants as the same exercise", () => {
    expect(baseName("Cable Lateral Raise")).toBe(baseName("Machine Lateral Raise"));
    expect(baseName("Goblet Squat")).toBe(baseName("Dumbbell Squat"));
    expect(baseName("Incline Dumbbell Press")).not.toBe(baseName("Dumbbell Bench Press"));
  });

  it("never doubles up the same exercise in another form (two lateral raises on push)", () => {
    for (const gym of [commercialGym, homeGym, hotelGym]) {
      for (const targets of [PUSH, PULL, UPPER, LEGS]) {
        for (const seed of [0, 1, 2, 3, 4]) {
          const bases = names(generateWorkout(catalog, { ...base, targets, gymEquipment: gym, seed }).items).filter((e) => e.category !== "cardio").map((e) => baseName(e.name));
          expect(new Set(bases).size, bases.join(" · ")).toBe(bases.length);
        }
      }
    }
  });

  it("pull days: at most two rows, a vertical pull, and direct biceps work", () => {
    for (const gym of [commercialGym, homeGym]) {
      for (const seed of [0, 1, 2, 3, 4]) {
        const exs = names(generateWorkout(catalog, { ...base, targets: PULL, gymEquipment: gym, seed }).items);
        expect(exs.filter((e) => e.movement_pattern === "horizontal_pull").length, exs.map((e) => e.name).join(" · ")).toBeLessThanOrEqual(2);
        expect(exs.some((e) => e.movement_pattern === "vertical_pull")).toBe(true);
        expect(exs.some((e) => e.mechanic === "isolation" && primaryOf(e.id).includes("biceps")), exs.map((e) => e.name).join(" · ")).toBe(true);
      }
    }
  });

  it("a bodyweight-only gym can still build pull and shoulder work", () => {
    const pull = generateWorkout(catalog, { ...base, targets: PULL, gymEquipment: bodyweightGym }).items;
    expect(pull.length).toBeGreaterThanOrEqual(2);
    const push = generateWorkout(catalog, { ...base, targets: PUSH, gymEquipment: bodyweightGym }).items;
    expect(push.some((i) => primaryOf(i.exercise_id).includes("front_delts"))).toBe(true);
  });
});

describe("gym swaps", () => {
  it("finds the closest match at a dumbbell-only gym", () => {
    const to = closestMatch(catalog, "Barbell_Bench_Press_-_Medium_Grip", { gymEquipment: hotelGym, experience: "intermediate" });
    expect(to).not.toBeNull();
    expect(primaryOf(to!)).toContain("chest");
    expect(byId.get(to!)!.movement_pattern).toBe("horizontal_push");
    expect(closestMatch(catalog, "Barbell_Bench_Press_-_Medium_Grip", { gymEquipment: homeGym, experience: "intermediate" })).toBe("Dumbbell_Bench_Press");
  });

  it("keeps what's available, swaps the rest and reports it", () => {
    const items = [{ exercise_id: "Barbell_Squat" }, { exercise_id: "Dumbbell_Lunges" }, { exercise_id: "Lying_Leg_Curls" }];
    const r = adaptToGym(catalog, items, { gymEquipment: homeGym, experience: "intermediate" });
    expect(r.items[1].exercise_id).toBe("Dumbbell_Lunges");
    expect(r.swaps.map((s) => s.from)).toEqual(["Barbell_Squat", "Lying_Leg_Curls"]);
    for (const i of r.items) expect(isAvailable(catalog.needs.get(i.exercise_id) ?? [], homeGym)).toBe(true);
    expect(new Set(r.items.map((i) => i.exercise_id)).size).toBe(r.items.length);
  });
});

describe("cardio needs the gear (Batch 1)", () => {
  const outdoorGear = ["Bicycling", "Skating"];
  it("never picks an outdoor bike ride or skating unless the gym has a bike / skates", () => {
    for (const gym of [commercialGym, homeGym, hotelGym, bodyweightGym]) {
      for (let i = 0; i < 50; i++) {
        let seed = i + 1;
        const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        expect(outdoorGear).not.toContain(pickCardio(catalog, { gymEquipment: gym }, random));
      }
    }
    expect(pickCardio(catalog, { gymEquipment: bodyweightGym })).toBe("Trail_Running_Walking");
    expect(pickCardio(catalog, { gymEquipment: new Set(["bicycle"]) })).toBe("Bicycling");
  });

  it("swaps a treadmill run for something the new gym can actually do", () => {
    const to = closestMatch(catalog, "Running_Treadmill", { gymEquipment: bodyweightGym, experience: "intermediate" });
    expect(to).toBe("Trail_Running_Walking");
  });
});

describe("weight suggestions (double progression)", () => {
  const w = (weight: number | null, reps: number) => ({ weight, reps, type: "working" as const });
  const barbell = loadFor([{ exercise_id: "x", option_group: 1, equipment_id: "barbell" }], [{ equipment_id: "barbell", details: { plate_increment: 2.5 } }]);

  it("adds the smallest jump after hitting the top of the range on every set", () => {
    expect(suggestNext([w(135, 10), w(135, 10), w(135, 10)], 6, 10, barbell)).toEqual({ weight: 140, reps: 6, change: "up", from: 135 });
  });

  it("otherwise keeps the weight and aims for one more rep", () => {
    expect(suggestNext([w(135, 10), w(135, 9), w(135, 8)], 6, 10, barbell)).toEqual({ weight: 135, reps: 9, change: "same", from: 135 });
  });

  it("no history: no weight yet", () => {
    expect(suggestNext([], 8, 12, barbell)).toMatchObject({ weight: null, change: "new", reps: 12 });
  });

  it("uses the gym's dumbbell steps and stops at the heaviest pair", () => {
    const db = loadFor([{ exercise_id: "x", option_group: 1, equipment_id: "dumbbells" }], [{ equipment_id: "dumbbells", details: { dumbbell_step: 2.5, dumbbell_max: 50 } }]);
    expect(suggestNext([w(40, 12), w(40, 12)], 8, 12, db).weight).toBe(42.5);
    expect(suggestNext([w(50, 12), w(50, 12)], 8, 12, db)).toMatchObject({ weight: 50, reps: 13 });
  });

  it("bodyweight: chase reps", () => {
    expect(suggestNext([w(null, 8), w(null, 7)], 6, 10, { increment: 5 })).toMatchObject({ weight: null, reps: 9 });
  });
});

describe("isTimed", () => {
  it("planks and holds count seconds; the generator's seconds tag does too", () => {
    expect(isTimed("Plank")).toBe(true);
    expect(isTimed("Side Plank")).toBe(true);
    expect(isTimed("Bench Press", "seconds")).toBe(true);
    expect(isTimed("Bench Press", null)).toBe(false);
    expect(isTimed("Plank Jacks")).toBe(false);
  });
});
