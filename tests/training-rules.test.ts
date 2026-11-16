import { describe, expect, it } from "vitest";
import { SESSION_SET_CAP, generateWorkout, setCapFor, isHold, isIsolation, type GenOptions } from "@/lib/generator";
import { suggestNext } from "@/lib/progression";
import { defaultTargets } from "@/lib/defaults";
import { catalog, commercialGym, homeGym, hotelGym } from "./fixtures/catalog";

/*
  Batch 5 training audit: the coaching rules the generator must keep. Each test runs several seeds so it
  checks the rule, not one lucky workout.
*/

const byId = new Map(catalog.exercises.map((e) => [e.id, e]));
const primaryOf = (id: string) => (catalog.musclesOf.get(id) ?? []).filter((m) => m.role === "primary").map((m) => m.muscle_id);
const needs = (id: string) => (catalog.needs.get(id) ?? []).map((n) => n.equipment_id);
const SEEDS = [0, 1, 2, 3, 4, 5];
const FULL = ["chest", "lats", "upper_back", "side_delts", "quads", "hamstrings", "glutes", "abs"];
const PUSH = ["chest", "front_delts", "side_delts", "triceps"];
const PULL = ["lats", "upper_back", "rear_delts", "biceps", "traps", "forearms"];
const LEGS = ["quads", "hamstrings", "glutes", "calves", "adductors", "abductors", "abs"];
const LOWER = ["quads", "hamstrings", "glutes", "calves", "lower_back", "abs", "obliques"];
const UPPER = ["chest", "lats", "upper_back", "front_delts", "side_delts", "rear_delts", "biceps", "triceps"];
const base: GenOptions = { targets: PUSH, gymEquipment: commercialGym, goal: "hypertrophy", experience: "intermediate", sessionMinutes: 60 };
const gen = (o: Partial<GenOptions>, seed: number) => generateWorkout(catalog, { ...base, ...o, seed }).items;
const lifts = (items: ReturnType<typeof gen>) => items.filter((i) => byId.get(i.exercise_id)?.category !== "cardio");
const compound = (id: string) => !isIsolation(byId.get(id)!);

describe("training rules (Batch 5 audit)", () => {
  it("lower, leg and full-body days have a knee-dominant lift and a hamstring hinge", () => {
    for (const [targets, gym] of [[LOWER, commercialGym], [LEGS, commercialGym], [FULL, commercialGym], [FULL, homeGym], [LOWER, homeGym]] as const) {
      for (const seed of SEEDS) {
        for (const goal of ["hypertrophy", "strength", "general"] as const) {
          const ids = lifts(gen({ targets: [...targets], gymEquipment: gym, goal }, seed)).map((i) => i.exercise_id);
          const label = `${goal} ${targets.length} seed ${seed}: ${ids.join(", ")}`;
          expect(ids.some((id) => compound(id) && primaryOf(id).includes("quads")), label).toBe(true);
          expect(ids.some((id) => compound(id) && primaryOf(id).includes("hamstrings")), label).toBe(true);
        }
      }
    }
  });

  it("no muscle gets more than ~10 hard sets in one session", () => {
    for (const targets of [PUSH, PULL, LEGS, UPPER, LOWER, FULL]) {
      for (const sessionMinutes of [45, 60, 90]) {
        for (const seed of SEEDS) {
          const sets = new Map<string, number>();
          for (const i of lifts(gen({ targets, sessionMinutes }, seed))) for (const m of primaryOf(i.exercise_id)) sets.set(m, (sets.get(m) ?? 0) + i.sets);
          for (const [m, n] of sets) expect(n, `${m} in ${targets.join("/")} ${sessionMinutes} min seed ${seed}`).toBeLessThanOrEqual(SESSION_SET_CAP);
        }
      }
    }
  });

  it("beginners get a lower per-muscle cap, and short strength sessions fit the clock", () => {
    expect(setCapFor("beginner")).toBeLessThan(setCapFor("intermediate"));
    for (const targets of [PUSH, PULL, LEGS, UPPER, LOWER, FULL]) {
      for (const seed of SEEDS) {
        const sets = new Map<string, number>();
        for (const i of lifts(gen({ targets, experience: "beginner", sessionMinutes: 90 }, seed))) for (const m of primaryOf(i.exercise_id)) sets.set(m, (sets.get(m) ?? 0) + i.sets);
        for (const [m, n] of sets) expect(n, `${m} ${targets.join("/")} seed ${seed}`).toBeLessThanOrEqual(setCapFor("beginner"));
      }
    }
    // A 45-minute heavy session is three big lifts, not four (5 sets with 3-minute rests add up fast).
    for (const seed of SEEDS) expect(lifts(gen({ goal: "strength", targets: UPPER, sessionMinutes: 45 }, seed)).length).toBe(3);
  });

  it("heavy 3–5 rep main lifts are free weights, never machines, cables or RDLs", () => {
    for (const targets of [UPPER, LOWER, PUSH, PULL, FULL]) {
      for (const o of [{ goal: "strength" as const }, { focus: "power" as const }]) {
        for (const seed of SEEDS) {
          for (const i of lifts(gen({ targets, ...o }, seed)).filter((x) => x.rep_max === 5)) {
            const n = needs(i.exercise_id);
            expect(n.some((e) => ["barbell", "dumbbells", "trap_bar", "ez_bar", "kettlebells"].includes(e)), i.exercise_id).toBe(true);
            expect(n.some((e) => /machine|cable|smith|lever|leg_press|hack_squat/.test(e)), i.exercise_id).toBe(false);
            expect(byId.get(i.exercise_id)!.name).not.toMatch(/romanian|stiff-legged|good morning/i);
          }
        }
      }
    }
  });

  it("the first lift leads with a warm-up note; heavy days ask for more warm-up", () => {
    const hyp = lifts(gen({ targets: UPPER }, 0));
    expect(hyp[0].notes).toMatch(/warm up: 1–2/i);
    const str = lifts(gen({ targets: UPPER, goal: "strength" }, 0));
    expect(str[0].notes).toMatch(/warm up: 2–3/i);
  });

  it("isolation moves get isolation reps and rest, even when the data calls them compound", () => {
    expect(isIsolation(byId.get("Face_Pull")!)).toBe(true);
    expect(isIsolation(byId.get("Incline_Dumbbell_Flyes")!)).toBe(true);
    for (const seed of SEEDS) {
      for (const targets of [PUSH, PULL, UPPER]) {
        for (const i of gen({ targets, goal: "strength" }, seed)) {
          if (isIsolation(byId.get(i.exercise_id)!) && !isHold(byId.get(i.exercise_id)!.name)) {
            expect(i.rep_min!, i.exercise_id).toBeGreaterThanOrEqual(8);
            expect(i.rest_sec!, i.exercise_id).toBeLessThanOrEqual(90);
          }
        }
      }
    }
  });

  it("every main target muscle gets a direct exercise (rear delts on a pull day)", () => {
    for (const seed of SEEDS) {
      const hit = new Set(gen({ targets: PULL }, seed).flatMap((i) => primaryOf(i.exercise_id)));
      expect(hit.has("rear_delts"), `seed ${seed}`).toBe(true);
    }
  });

  it("timed holds are dosed in seconds", () => {
    expect(isHold("Plank")).toBe(true);
    expect(isHold("Side Plank")).toBe(true);
    expect(isHold("Plank Jack")).toBe(false);
    expect(isHold("Plank to Push-Up")).toBe(false);
    expect(isHold("Bench Press")).toBe(false);
    expect(defaultTargets("hypertrophy", "isolation", { hold: true })).toEqual({ sets: 3, repMin: 30, repMax: 45, rest: 45 });
    for (const seed of SEEDS) {
      for (const i of gen({ targets: ["abs", "obliques"], cardio: "main", goal: "general" }, seed)) {
        if (isHold(byId.get(i.exercise_id)?.name ?? "")) expect(i).toMatchObject({ rep_min: 30, rep_max: 45, notes: "seconds" });
      }
    }
  });

  it("fat-loss supersets pair exercises that don't share a main muscle, and keep deadlifts out", () => {
    for (const targets of [FULL, UPPER, LOWER, PUSH]) {
      for (const gym of [commercialGym, hotelGym]) {
        for (const seed of SEEDS) {
          const items = gen({ targets, goal: "fat_loss", gymEquipment: gym, sessionMinutes: 45 }, seed);
          const groups = new Map<number, string[]>();
          for (const i of items) if (i.superset_group !== null) groups.set(i.superset_group, [...(groups.get(i.superset_group) ?? []), i.exercise_id]);
          for (const [, [a, b]] of groups) {
            expect(primaryOf(a).some((m) => primaryOf(b).includes(m)), `${a} + ${b}`).toBe(false);
            expect(["Barbell_Deadlift", "Sumo_Deadlift"]).not.toContain(a);
            expect(["Barbell_Deadlift", "Sumo_Deadlift"]).not.toContain(b);
          }
          // Partners sit next to each other.
          items.forEach((it, k) => {
            if (it.superset_group !== null && items.filter((x) => x.superset_group === it.superset_group).indexOf(it) === 0) {
              expect(items[k + 1]?.superset_group).toBe(it.superset_group);
            }
          });
        }
      }
    }
  });

  it("fat-loss sessions fit 4+ lifts alongside the cardio block", () => {
    for (const seed of SEEDS) expect(lifts(gen({ targets: FULL, goal: "fat_loss", sessionMinutes: 45 }, seed)).length).toBeGreaterThanOrEqual(4);
  });

  it("conventional deadlifts stay at 5–8 reps outside heavy days", () => {
    for (const seed of SEEDS) {
      for (const goal of ["hypertrophy", "general", "fat_loss"] as const) {
        for (const i of gen({ targets: FULL, goal }, seed)) if (i.exercise_id === "Barbell_Deadlift") expect(i.rep_max).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe("progression", () => {
  const load = { increment: 5 };
  const w = (weight: number, reps: number) => ({ weight, reps, type: "working" as const });

  it("drops one step when every set fell 2+ reps short of the range", () => {
    expect(suggestNext([w(185, 5), w(185, 4), w(185, 4)], 8, 12, load)).toEqual({ weight: 180, reps: 8, change: "down", from: 185 });
  });

  it("holds the weight when just short of the range, and goes up at the top", () => {
    expect(suggestNext([w(185, 7), w(185, 6), w(185, 6)], 8, 12, load).change).toBe("same");
    expect(suggestNext([w(185, 12), w(185, 12), w(185, 12)], 8, 12, load)).toMatchObject({ weight: 190, change: "up" });
  });

  it("steps down a kettlebell ladder, and never below zero", () => {
    expect(suggestNext([w(35, 3), w(35, 3)], 8, 12, { increment: 5, ladder: [18, 26, 35, 44] })).toMatchObject({ weight: 26, change: "down" });
    expect(suggestNext([w(5, 3), w(5, 3)], 8, 12, load).change).toBe("same");
  });
});
