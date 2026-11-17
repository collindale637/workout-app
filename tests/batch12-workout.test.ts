import { describe, expect, it } from "vitest";
import { cuesFor, shortCue } from "@/lib/exercise-cues";
import { rankSwaps, topDistinct } from "@/lib/generator";
import { catalog, commercialGym } from "./fixtures/catalog";

const byId = new Map(catalog.exercises.map((e) => [e.id, e]));
const needs = (id: string) => (catalog.needs.get(id) ?? []).map((n) => n.equipment_id);

describe("how-to cues", () => {
  it("takes the first sentence of each step and trims long ones at a word", () => {
    expect(shortCue("Lie down on the floor. Your legs should be bent.")).toBe("Lie down on the floor.");
    const long = shortCue(`Hold the bar with a pronated grip ${"and keep your elbows tucked tight ".repeat(5)}at your sides.`);
    expect(long.length).toBeLessThanOrEqual(112);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toMatch(/\s…$/);
  });
  it("shows three cues and offers more only when there is more", () => {
    expect(cuesFor(["A.", "B.", "C.", "D."])).toEqual({ cues: ["A.", "B.", "C."], hasMore: true });
    expect(cuesFor(["A.", "B."])).toEqual({ cues: ["A.", "B."], hasMore: false });
    expect(cuesFor(["Do this. Then that.", "B."]).hasMore).toBe(true);
    expect(cuesFor([])).toEqual({ cues: [], hasMore: false });
  });
});

describe("swap ranking: same movement, same kind of gear first", () => {
  const top = (id: string, n = 4) => topDistinct(catalog, rankSwaps(catalog, id, { gymEquipment: commercialGym, experience: "intermediate" }), n);

  it("a dumbbell press swaps to presses before other chest work", () => {
    for (const id of top("Dumbbell_Bench_Press")) expect(byId.get(id)!.movement_pattern, id).toBe("horizontal_push");
  });

  it("a machine lift ranks guided gear above free weights, and a barbell lift ranks barbell variations first", () => {
    const ranked = (id: string) => rankSwaps(catalog, id, { gymEquipment: commercialGym, experience: "intermediate" }).map((r) => r.id);
    const legPress = ranked("Leg_Press");
    expect(legPress.indexOf("Smith_Machine_Squat")).toBeLessThan(legPress.indexOf("Barbell_Squat"));
    const squat = top("Barbell_Squat", 3);
    expect(squat.some((id) => needs(id).includes("barbell"))).toBe(true);
  });
});
