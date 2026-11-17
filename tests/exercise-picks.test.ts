import { describe, expect, it } from "vitest";
import { buildPlanDays, STAPLES, isIsolation, tierOf } from "@/lib/generator";
import { catalog, commercialGym, nameOf } from "./fixtures/catalog";
import { SPLITS } from "../scripts/catalog-data.mjs";

/*
  Batch 11 (Fable review, "Template exercise picks and order are erratic"): sweep every split, goal and
  level over several shuffles at a full gym and check the specific problems the review saw.
*/
const angle = (n: string) => (/incline/i.test(n) ? "incline" : /decline/i.test(n) ? "decline" : "flat");
const plans = (() => {
  const out: { goal: string; experience: string; day: string; items: { exercise_id: string; rep_max: number | null; notes: string | null }[] }[] = [];
  for (const goal of ["fat_loss", "hypertrophy", "strength", "general"] as const)
    for (const experience of ["beginner", "intermediate"] as const)
      for (const seed of [0, 1, 2, 3, 4, 5])
        for (const s of SPLITS as unknown as { dayList: [string, string[]][] }[]) {
          const days = buildPlanDays(
            catalog,
            s.dayList.map(([name, target_muscle_ids], i) => ({ name, target_muscle_ids, day_order: i + 1 })) as never,
            { gymEquipment: commercialGym, goal, experience, sessionMinutes: 60, prefs: new Map(), seed, cardioPref: "auto" } as never,
          );
          for (const d of days) out.push({ goal, experience, day: d.name, items: d.items.filter((x) => !/min$/.test(x.notes ?? "")) });
        }
  return out;
})();
const exOf = (id: string) => catalog.exercises.find((e) => e.id === id)!;

describe("template exercise picks", () => {
  it("never pairs two incline (or decline) presses without a flat press, or repeats a bench angle", () => {
    const bad = plans.filter((p) => {
      const angles = p.items.map((x) => exOf(x.exercise_id)).filter((e) => e.movement_pattern === "horizontal_push" && !isIsolation(e)).map((e) => angle(e.name));
      return new Set(angles).size < angles.length;
    });
    expect(bad.map((p) => `${p.day}: ${p.items.map((x) => nameOf(x.exercise_id)).join(", ")}`)).toEqual([]);
  });

  it("weighted pull-ups are low-rep and only for non-beginners outside fat loss", () => {
    for (const p of plans)
      for (const x of p.items.filter((i) => /^Weighted_(Pull|Chin)/.test(i.exercise_id))) {
        expect(p.goal).not.toBe("fat_loss");
        expect(p.experience).not.toBe("beginner");
        expect(x.rep_max).toBeLessThanOrEqual(8);
      }
  });

  it("no Smith machine squat for non-beginners at a full gym", () => {
    expect(plans.filter((p) => p.experience !== "beginner" && p.items.some((x) => /smith machine squat/i.test(exOf(x.exercise_id).name))).length).toBe(0);
  });

  it("days lead with a staple (arms and core days excepted) and never pick specialist lifts", () => {
    const lead = plans.filter((p) => !/arms|core/i.test(p.day) && p.items[0] && STAPLES[p.items[0].exercise_id] !== 1);
    expect(lead.map((p) => `${p.day}: ${nameOf(p.items[0].exercise_id)}`)).toEqual([]);
    expect(plans.flatMap((p) => p.items.map((x) => exOf(x.exercise_id))).filter((e) => tierOf(e) === "specialist").map((e) => e.name)).toEqual([]);
  });

  it("pull-ups and chins come before isolation work", () => {
    for (const p of plans) {
      const exs = p.items.map((x) => exOf(x.exercise_id));
      const firstIso = exs.findIndex((e) => isIsolation(e));
      exs.forEach((e, i) => {
        if (/pull-?up|chin-?up/i.test(e.name) && firstIso >= 0) expect(i, `${p.goal} ${p.day}: ${exs.map((x) => x.name).join(", ")}`).toBeLessThan(firstIso);
      });
    }
  });
});
