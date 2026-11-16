import { describe, expect, it } from "vitest";
import { generateWorkout, type GenOptions } from "@/lib/generator";
import { WARMUP_NOTE, WARMUP_SLOT, plannedWarmupId, warmupDose, warmupWorthy } from "@/lib/warmup";
import { filledSets, nextSlot } from "@/lib/set-slots";
import { catalog, bodyweightGym, commercialGym, homeGym, hotelGym } from "./fixtures/catalog";

const byId = new Map(catalog.exercises.map((e) => [e.id, e]));
const needs = (id: string) => (catalog.needs.get(id) ?? []).map((n) => n.equipment_id);
const compound = { mechanic: "compound" as const, category: "strength" };

describe("which lifts deserve a warm-up", () => {
  it("barbell compounds at normal reps do; at 15 reps they don't", () => {
    expect(warmupWorthy(compound, ["barbell", "flat_bench"], 12)).toBe(true);
    expect(warmupWorthy(compound, ["trap_bar"], 8)).toBe(true);
    expect(warmupWorthy(compound, ["barbell"], 15)).toBe(false);
  });
  it("dumbbells and machines only when heavy", () => {
    expect(warmupWorthy(compound, ["dumbbells", "incline_bench"], 12)).toBe(false);
    expect(warmupWorthy(compound, ["dumbbells"], 6)).toBe(true);
    expect(warmupWorthy(compound, ["leg_press_machine"], 10)).toBe(false);
  });
  it("never isolation, bodyweight or cardio", () => {
    expect(warmupWorthy({ mechanic: "isolation", category: "strength" }, ["barbell"], 10)).toBe(false);
    expect(warmupWorthy(compound, [], 5)).toBe(false);
    expect(warmupWorthy({ mechanic: "compound", category: "cardio" }, ["barbell"], 5)).toBe(false);
  });
});

describe("generator marks at most one warm-up, only when it's worth it", () => {
  const base: GenOptions = { targets: ["chest", "front_delts", "side_delts", "triceps"], gymEquipment: commercialGym, goal: "hypertrophy", experience: "intermediate", sessionMinutes: 60 };
  const days = [["chest", "front_delts", "triceps"], ["lats", "upper_back", "biceps"], ["quads", "hamstrings", "glutes", "abs"]];
  const goals = ["strength", "hypertrophy", "fat_loss", "general"] as const;
  const gyms = [commercialGym, homeGym, hotelGym, bodyweightGym];
  for (const goal of goals)
    for (const [g, gym] of gyms.entries())
      it(`${goal} · gym ${g}`, () => {
        for (const targets of days)
          for (const seed of [0, 1, 2, 3]) {
            const items = generateWorkout(catalog, { ...base, goal, targets, gymEquipment: gym, seed }).items;
            const marked = items.filter((it) => it.notes?.startsWith("Warm up"));
            expect(marked.length).toBeLessThanOrEqual(1);
            for (const it of marked) {
              expect(it.notes).toBe(WARMUP_NOTE);
              expect(warmupWorthy(byId.get(it.exercise_id), needs(it.exercise_id), it.rep_max)).toBe(true);
            }
          }
      });

  it("a barbell bench day in a full gym gets one", () => {
    const hits = [0, 1, 2, 3, 4, 5].filter((seed) =>
      generateWorkout(catalog, { ...base, goal: "strength", seed }).items.some((it) => it.notes === WARMUP_NOTE),
    );
    expect(hits.length).toBeGreaterThan(0);
  });

  it("a bodyweight gym never gets one", () => {
    for (const seed of [0, 1, 2, 3]) expect(generateWorkout(catalog, { ...base, gymEquipment: bodyweightGym, seed }).items.some((it) => it.notes === WARMUP_NOTE)).toBe(false);
  });
});

describe("live workout picks one planned warm-up, old notes included", () => {
  const bench = catalog.exercises.find((e) => needs(e.id).includes("barbell") && e.mechanic === "compound" && e.category !== "cardio")!;
  const wex = (id: string, notes: string | null, rep_max = 10) => ({ id, exercise_id: bench.id, notes, rep_max });
  const find = (rows: ReturnType<typeof wex>[]) => plannedWarmupId(rows, (id) => byId.get(id), needs);

  it("only the first noted lift, even when an old plan noted two", () => {
    expect(find([wex("a", "Warm up: 2–3 lighter sets first", 5), wex("b", "Warm up: 1–2 lighter sets first")])).toBe("a");
  });
  it("no note, no warm-up", () => {
    expect(find([wex("a", null), wex("b", "Stop each set with 2 reps in the tank")])).toBeNull();
  });
  it("a noted lift at 15 reps is skipped", () => {
    expect(find([wex("a", "Warm up: 1–2 lighter sets first", 15)])).toBeNull();
  });
});

describe("warm-up dose", () => {
  it("half the working weight for 8, rounded to 5 lb", () => {
    expect(warmupDose(135, 12, ["barbell"])).toMatchObject({ weight: 70, reps: 8 });
  });
  it("heavy days: 60% for 5", () => {
    expect(warmupDose(225, 5, ["barbell"])).toMatchObject({ weight: 135, reps: 5 });
  });
  it("never under the empty bar, never over the working weight", () => {
    expect(warmupDose(55, 10, ["barbell"]).weight).toBe(45);
    expect(warmupDose(40, 10, ["barbell"]).weight).toBe(40);
  });
  it("no working weight yet: weight left blank", () => {
    expect(warmupDose(null, 10, ["barbell"]).weight).toBeNull();
  });
});

describe("skipping the warm-up doesn't touch working sets", () => {
  it("slot 0 isn't a planned set", () => {
    expect(filledSets([], 3, [WARMUP_SLOT])).toBe(0);
    expect(nextSlot([], 3, [WARMUP_SLOT])).toBe(1);
  });
});
