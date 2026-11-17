import { describe, expect, it } from "vitest";
import { buildPlanDays, itemMinutes } from "@/lib/generator";
import { catalog, commercialGym, homeGym, nameOf } from "./fixtures/catalog";

import { SPLITS } from "../scripts/catalog-data.mjs";

/** Batch 11: template days must fit the session length people pick in onboarding. */
describe("plan days fit the session length", () => {
  it("every split, goal, level and length stays within 10% and keeps at least two lifts", () => {
    const problems: string[] = [];
    for (const goal of ["fat_loss", "hypertrophy", "strength", "general"] as const)
      for (const experience of ["beginner", "intermediate"] as const)
        for (const sessionMinutes of [30, 45, 60])
          for (const s of SPLITS as unknown as { id: string; dayList: [string, string[]][] }[])
            for (const gym of [commercialGym, homeGym]) {
              const days = buildPlanDays(
                catalog,
                s.dayList.map(([name, target_muscle_ids], i) => ({ name, target_muscle_ids, day_order: i + 1 })) as never,
                { gymEquipment: gym, goal, experience, sessionMinutes, prefs: new Map(), seed: 0, cardioPref: "auto" } as never,
              );
              for (const d of days) {
                const isCardio = (x: { notes: string | null }) => /min$/.test(x.notes ?? "");
                const lifts = d.items.filter((x) => !isCardio(x));
                const cardio = d.items.filter(isCardio).reduce((a, x) => a + parseInt(x.notes!), 0);
                const total = lifts.reduce((a, it) => a + itemMinutes(it, nameOf(it.exercise_id), d.items), 0) + cardio + 3;
                const main = /^cardio\b/i.test(d.name);
                if (total > sessionMinutes * 1.1 || (!main && lifts.length < 2)) problems.push(`${goal}/${experience}/${sessionMinutes}m ${s.id} ${d.name}: ${Math.round(total)} min, ${lifts.length} lifts`);
              }
            }
    expect(problems).toEqual([]);
  });
});

describe("previewSession (onboarding hint)", () => {
  it("grows with the session and shows the cardio block", async () => {
    const { previewSession } = await import("@/lib/generator");
    const short = previewSession(catalog, { goal: "hypertrophy", experience: "intermediate", sessionMinutes: 30 });
    const long = previewSession(catalog, { goal: "hypertrophy", experience: "intermediate", sessionMinutes: 90 });
    expect(long.lifts).toBeGreaterThan(short.lifts);
    expect(short.cardioMinutes).toBe(0);
    expect(previewSession(catalog, { goal: "fat_loss", experience: "beginner", sessionMinutes: 30 }).cardioMinutes).toBe(10);
  });
});
