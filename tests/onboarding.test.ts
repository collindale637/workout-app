import { describe, expect, it } from "vitest";
import { recommendSplit, splitChoices, type SplitInfo } from "@/lib/onboarding";
import { defaultCardio, generateWorkout } from "@/lib/generator";
import { catalog, commercialGym } from "./fixtures/catalog";

const SPLITS: SplitInfo[] = [
  ["full_body_2", 2], ["full_body_3", 3], ["ppl_3", 3], ["upper_lower_4", 4], ["torso_limbs_4", 4], ["phul_4", 4], ["hybrid_4", 4],
  ["ul_ppl_5", 5], ["bro_5", 5], ["ppl_6", 6], ["arnold_6", 6],
].map(([id, d], i) => ({ id: id as string, name: id as string, days_per_week: d as number, description: "", sort_order: i }));

describe("onboarding", () => {
  it("recommends a split that fits the week, goal and experience", () => {
    expect(recommendSplit(2, "hypertrophy", "intermediate", "auto")).toBe("full_body_2");
    expect(recommendSplit(3, "hypertrophy", "beginner", "auto")).toBe("full_body_3");
    expect(recommendSplit(3, "hypertrophy", "advanced", "auto")).toBe("ppl_3");
    expect(recommendSplit(4, "hypertrophy", "intermediate", "auto")).toBe("upper_lower_4");
    expect(recommendSplit(4, "strength", "intermediate", "auto")).toBe("phul_4");
    expect(recommendSplit(4, "hypertrophy", "intermediate", "more")).toBe("hybrid_4");
    expect(recommendSplit(5, "hypertrophy", "intermediate", "auto")).toBe("ul_ppl_5");
    expect(recommendSplit(7, "hypertrophy", "advanced", "auto")).toBe("ppl_6");
    for (const d of [1, 2, 3, 4, 5, 6, 7]) for (const g of ["strength", "hypertrophy", "fat_loss", "general"] as const) {
      expect(SPLITS.some((s) => s.id === recommendSplit(d, g, "beginner", "none"))).toBe(true);
    }
  });

  it("lists the recommended split first, then others for that many days (or one fewer)", () => {
    const list = splitChoices(SPLITS, 4, "phul_4");
    expect(list[0].id).toBe("phul_4");
    expect(list.every((s) => s.days_per_week === 4 || s.days_per_week === 3)).toBe(true);
    expect(list.slice(1, 4).every((s) => s.days_per_week === 4)).toBe(true);
  });

  it("cardio setting: none never adds it on its own, more always does, auto follows the goal", () => {
    expect(defaultCardio("fat_loss", 60, "none")).toBe("none");
    expect(defaultCardio("strength", 60, "more")).toBe("block");
    expect(defaultCardio("fat_loss", 60)).toBe("block");
    expect(defaultCardio("hypertrophy", 60, "auto")).toBe("none");
    const base = { targets: ["chest", "triceps"], gymEquipment: commercialGym, goal: "strength" as const, experience: "intermediate" as const, sessionMinutes: 60 };
    expect(generateWorkout(catalog, { ...base, cardioPref: "more" }).cardioMinutes).toBeGreaterThan(0);
    expect(generateWorkout(catalog, { ...base, goal: "fat_loss", cardioPref: "none" }).cardioMinutes).toBe(0);
    // A day that asks for cardio still gets it.
    expect(generateWorkout(catalog, { ...base, cardioPref: "none", cardio: "block" }).cardioMinutes).toBeGreaterThan(0);
  });
});
