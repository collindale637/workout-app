import { describe, expect, it } from "vitest";
import { rankAdditions, rankCardio, rankSwaps, topDistinct } from "@/lib/generator";
import { isAvailable } from "@/lib/availability";
import { catalog, commercialGym, homeGym } from "./fixtures/catalog";

const byId = new Map(catalog.exercises.map((e) => [e.id, e]));
const primaryOf = (id: string) => (catalog.musclesOf.get(id) ?? []).filter((m) => m.role === "primary").map((m) => m.muscle_id);
const needs = (id: string) => (catalog.needs.get(id) ?? []).map((n) => n.equipment_id);
const PUSH_DAY = ["Barbell_Bench_Press_-_Medium_Grip", "Dumbbell_Shoulder_Press", "Side_Lateral_Raise", "Triceps_Pushdown_-_Rope_Attachment", "Running_Treadmill"];
const opts = { gymEquipment: commercialGym, experience: "intermediate" as const };

describe("smart swaps", () => {
  it("swaps a lift for one that trains the same main muscles, at this gym, not already in the workout", () => {
    const ids = topDistinct(catalog, rankSwaps(catalog, "Dumbbell_Bench_Press", { ...opts, inWorkout: PUSH_DAY, exclude: new Set(PUSH_DAY) }), 5);
    expect(ids).toHaveLength(5);
    for (const id of ids) {
      expect(primaryOf(id)).toContain("chest");
      expect(PUSH_DAY).not.toContain(id);
      expect(byId.get(id)!.category).not.toBe("cardio");
    }
    const home = topDistinct(catalog, rankSwaps(catalog, "Barbell_Squat", { ...opts, gymEquipment: homeGym }), 5);
    for (const id of home) expect(isAvailable(catalog.needs.get(id) ?? [], homeGym), id).toBe(true);
    expect(primaryOf(home[0])).toContain("quads");
  });

  it("'equipment taken' steers away from the same equipment; 'hurts' prefers guided machines", () => {
    const busy = topDistinct(catalog, rankSwaps(catalog, "Dumbbell_Bench_Press", { ...opts, why: "busy" }), 3);
    const from = new Set(needs("Dumbbell_Bench_Press"));
    for (const id of busy) expect(needs(id).every((n) => from.has(n)), id).toBe(false);
    const hurts = topDistinct(catalog, rankSwaps(catalog, "Dumbbell_Bench_Press", { ...opts, why: "hurts" }), 3);
    expect(hurts.filter((id) => needs(id).some((n) => /machine|cable|smith|leverage/.test(n))).length).toBeGreaterThanOrEqual(2);
  });

  it("swapping cardio offers other cardio, and the reasons reshape it", () => {
    const plain = topDistinct(catalog, rankSwaps(catalog, "Running_Treadmill", opts), 5);
    for (const id of plain) expect(byId.get(id)!.category).toBe("cardio");
    expect(plain).not.toContain("Running_Treadmill");
    const impact = topDistinct(catalog, rankCardio(catalog, { ...opts, from: "Running_Treadmill", why: "impact" }), 3);
    for (const id of impact) expect(byId.get(id)!.name).not.toMatch(/run|jog|jump|rope|sprint/i);
    expect(rankCardio(catalog, { ...opts, from: "Running_Treadmill", why: "outdoors" })[0].id).toBe("Trail_Running_Walking");
    const busy = topDistinct(catalog, rankCardio(catalog, { ...opts, from: "Running_Treadmill", why: "busy" }), 3);
    for (const id of busy) expect(needs(id)).not.toContain("treadmill");
  });

  it("additions fill what the workout is missing and vary across muscles", () => {
    const ids = topDistinct(catalog, rankAdditions(catalog, PUSH_DAY, opts), 4);
    expect(ids).toHaveLength(4);
    for (const id of ids) expect(PUSH_DAY).not.toContain(id);
    const hit = ids.flatMap(primaryOf);
    // A push day with no core and no pulling gets some of each, not four chest exercises.
    expect(hit.some((m) => m === "abs" || m === "obliques")).toBe(true);
    expect(hit.some((m) => m === "rear_delts" || m === "upper_back")).toBe(true);
    expect(new Set(ids.map((id) => primaryOf(id)[0])).size).toBeGreaterThanOrEqual(3);
    // Never suggests legs on a push day (the treadmill's muscles don't count).
    expect(hit).not.toContain("quads");
    expect(rankAdditions(catalog, [], opts).length).toBeGreaterThan(5);
  });
});
