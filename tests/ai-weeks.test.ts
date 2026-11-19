import { describe, expect, it } from "vitest";
import { MAX_NEW_WEEKS, assembleWeeks, checkSchedule, checkWeek, deloadDays, draftDaysForWeek, scheduleOf } from "@/lib/ai/weeks";
import { draftSnapshot, draftWeekDays } from "@/lib/ai/apply";
import { taskBlock } from "@/lib/ai/prompts";
import { runAi, type Call } from "@/lib/ai/run";
import { daysForWeek } from "@/lib/plan-weeks";
import type { AiDay, AiPlan, AiRequest, AllowedExercise } from "@/lib/ai/types";

/* AI plans whose workouts change from week to week (Batch 20d). */

const allowList: AllowedExercise[] = [
  { id: "Bench", name: "Bench Press", muscles: ["chest"], type: "compound" },
  { id: "Incline", name: "Incline Press", muscles: ["chest"], type: "compound" },
  { id: "Row", name: "Row", muscles: ["lats"], type: "compound" },
  { id: "Squat", name: "Squat", muscles: ["quads"], type: "compound" },
  { id: "FrontSquat", name: "Front Squat", muscles: ["quads"], type: "compound" },
  { id: "Bike", name: "Bike", muscles: [], type: "cardio" },
];
const allow = new Map(allowList.map((e) => [e.id, e]));
const item = (exercise_id: string, extra: Record<string, unknown> = {}) => ({
  exercise_id, sets: 4, rep_min: 6, rep_max: 8, rest_sec: 120, superset_group: null, notes: null, ...extra,
});
const day = (name: string, ids: string[], sets = 4): AiDay => ({
  name, ref_day_id: null, items: ids.map((id) => ({ exercise_id: id, sets, rep_min: 6, rep_max: 8, rest_sec: 120, superset_group: null, notes: null })),
});
const week1 = [day("Upper", ["Bench", "Row"]), day("Lower", ["Squat"])];

describe("the AI's week schedule", () => {
  it("keeps weeks 2 to the plan's length (up to 12), in order, and reports the rest", () => {
    const r = checkSchedule(
      [{ week: 5, kind: "deload", focus: "" }, { week: 3, kind: "new", focus: "Incline instead of flat" }, { week: 1, kind: "new", focus: "x" }, { week: 9, kind: "new", focus: "x" }, { week: 3, kind: "new", focus: "again" }],
      8,
    );
    expect(r.schedule).toEqual([{ week: 3, kind: "new", focus: "Incline instead of flat" }, { week: 5, kind: "deload", focus: "" }]);
    expect(r.errors).toHaveLength(3);
  });

  it("asks for a focus on new weeks, and caps how many weeks get new workouts", () => {
    expect(checkSchedule([{ week: 2, kind: "new", focus: "" }], 4).errors[0]).toMatch(/focus/);
    const many = Array.from({ length: 8 }, (_, i) => ({ week: i + 2, kind: "new", focus: "f" }));
    const r = checkSchedule(many, 12);
    expect(r.schedule.filter((e) => e.kind === "new")).toHaveLength(MAX_NEW_WEEKS);
    expect(r.errors.some((e) => /At most/.test(e))).toBe(true);
  });

  it("has nothing to schedule on a one-week plan, and treats a missing schedule as every week the same", () => {
    expect(checkSchedule(undefined, 8)).toEqual({ schedule: [], errors: [] });
    expect(checkSchedule([{ week: 2, kind: "new", focus: "f" }], 1).errors[0]).toMatch(/empty/);
  });
});

describe("writing a later week", () => {
  it("must have the same days as week 1; a day that fails keeps week 1's workout", () => {
    const r = checkWeek({ days: [{ name: "Upper", exercises: [item("Incline"), item("Row")] }] }, allow, 3, week1);
    expect(r.days.map((d) => d.items.map((i) => i.exercise_id))).toEqual([["Incline", "Row"], ["Squat"]]);
    expect(r.errors[0]).toMatch(/exactly 2 days/);
  });

  it("drops exercises that aren't on the gym's list", () => {
    const r = checkWeek({ days: [{ name: "Upper", exercises: [item("Made_Up")] }, { name: "Lower", exercises: [item("FrontSquat")] }] }, allow, 3, week1);
    expect(r.days[0].items.map((i) => i.exercise_id)).toEqual(["Bench", "Row"]);
    expect(r.days[1].items.map((i) => i.exercise_id)).toEqual(["FrontSquat"]);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("putting the weeks together", () => {
  it("halves the sets on a deload week (cardio stays) and goes back to full sets after", () => {
    const withBike = [...week1, day("Cardio", ["Bike"], 1)];
    expect(deloadDays(withBike).map((d) => d.items.map((i) => i.sets))).toEqual([[2, 2], [2], [1]]);
    const written = new Map([[3, [day("Upper", ["Incline", "Row"]), day("Lower", ["FrontSquat"])]]]);
    const r = assembleWeeks([{ week: 3, kind: "new", focus: "variations" }, { week: 6, kind: "deload", focus: "" }], written, week1, 8);
    expect(r.weeks.map((w) => [w.week, w.kind])).toEqual([[3, "new"], [6, "deload"], [7, "back"]]);
    // The deload and the week after it are built from week 3's workouts, not week 1's.
    expect(r.weeks[1].days[0].items.map((i) => [i.exercise_id, i.sets])).toEqual([["Incline", 2], ["Row", 2]]);
    expect(r.weeks[2].days[1].items[0]).toMatchObject({ exercise_id: "FrontSquat", sets: 4 });
    expect(r.errors).toEqual([]);
  });

  it("a deload in the last week, or one followed by new workouts, adds no extra week", () => {
    const written = new Map([[5, week1]]);
    expect(assembleWeeks([{ week: 4, kind: "deload", focus: "" }, { week: 5, kind: "new", focus: "f" }], written, week1, 8).weeks.map((w) => w.week)).toEqual([4, 5]);
    expect(assembleWeeks([{ week: 4, kind: "deload", focus: "" }], new Map(), week1, 4).weeks.map((w) => w.week)).toEqual([4]);
  });

  it("a week that couldn't be written repeats the week before, and says so", () => {
    const r = assembleWeeks([{ week: 3, kind: "new", focus: "f" }], new Map(), week1, 8);
    expect(r.weeks).toEqual([]);
    expect(r.errors[0]).toMatch(/Week 3/);
  });
});

describe("a draft with changing weeks", () => {
  const plan: AiPlan = {
    name: "P", goal: "strength", weeks: 8, summary: "", progression: "", changes: [], days: week1,
    later_weeks: [
      { week: 3, kind: "new", focus: "variations", days: [day("Upper", ["Incline", "Row"]), day("Lower", ["FrontSquat"])] },
      { week: 6, kind: "deload", focus: "", days: deloadDays(week1) },
      { week: 7, kind: "back", focus: "", days: week1 },
    ],
  };

  it("shows each week's own days, or the latest earlier week's", () => {
    expect(draftDaysForWeek(plan, 2)).toMatchObject({ from: 1 });
    expect(draftDaysForWeek(plan, 4).from).toBe(3);
    expect(draftDaysForWeek(plan, 4).days[0].items[0].exercise_id).toBe("Incline");
    expect(draftDaysForWeek(plan, 8).from).toBe(7);
  });

  it("saves every week's days, and the saved plan reads back the same week by week", () => {
    const rows = draftWeekDays(plan);
    expect(rows.map((r) => r.week)).toEqual([1, 1, 3, 3, 6, 6, 7, 7]);
    // Number the days within each week, as plans.create does, then read them back like the app.
    const counts = new Map<number, number>();
    const saved = rows.map((r, i) => {
      const n = (counts.get(r.week) ?? 0) + 1;
      counts.set(r.week, n);
      return { id: `d${i}`, week: r.week, day_order: n, first: r.day.items[0].exercise_id, sets: r.day.items[0].sets };
    });
    expect(daysForWeek(saved, 4).map((d) => d.first)).toEqual(["Incline", "FrontSquat"]);
    expect(daysForWeek(saved, 6).map((d) => d.sets)).toEqual([2, 2]);
    expect(daysForWeek(saved, 8).map((d) => [d.first, d.sets])).toEqual([["Bench", 4], ["Squat", 4]]);
  });

  it("sends its later weeks with a follow-up, and its schedule leaves out the app's own weeks", () => {
    expect(draftSnapshot(plan).later?.map((w) => w.week)).toEqual([3, 6, 7]);
    expect(scheduleOf(plan)).toEqual([{ week: 3, kind: "new", focus: "variations" }, { week: 6, kind: "deload", focus: "" }]);
  });
});

describe("the AI pipeline for plans with changing weeks", () => {
  const base: AiRequest = {
    kind: "plan", prompt: "change it up every few weeks", exercises: allowList, gym: null,
    profile: { goal: "strength", experience: "intermediate", days_per_week: 2, session_minutes: 60, units: "lb", default_rpe: 8 },
    options: { goal: "strength", days_per_week: 2, weeks: 8, session_minutes: 60, vary: true },
  };
  const planAnswer = (schedule: unknown) => ({
    name: "Strength 8", goal: "strength", weeks: 8, summary: "s", progression: "p", changes: [],
    days: [{ name: "Upper", ref_day_id: null, exercises: [item("Bench"), item("Row")] }, { name: "Lower", ref_day_id: null, exercises: [item("Squat")] }],
    schedule,
  });
  const reply = (input: unknown, tool = "save_plan"): Call => ({
    input, toolUseId: "tu", content: [{ type: "tool_use", id: "tu", name: tool, input }], usage: { input_tokens: 100, output_tokens: 50 }, truncated: false,
  });
  const weekAnswer = { days: [{ name: "Upper", exercises: [item("Incline"), item("Row")] }, { name: "Lower", exercises: [item("FrontSquat")] }] };

  it("tells Claude to schedule changing weeks when asked to change it up, and to leave it empty otherwise", () => {
    expect(taskBlock(base)).toMatch(/want the workouts to change/);
    expect(taskBlock({ ...base, options: { ...base.options!, vary: false } })).toMatch(/leave "schedule" empty, UNLESS/);
  });

  it("writes each new week in its own call and works out the deload", async () => {
    const asked: { tool: string; text: string }[] = [];
    const r = await runAi(base, async ({ tool, messages }) => {
      const blocks = messages[0].content as { text?: string }[];
      asked.push({ tool: tool.name, text: String(blocks.at(-1)?.text ?? "") });
      return tool.name === "save_week" ? reply(weekAnswer, "save_week") : reply(planAnswer([{ week: 3, kind: "new", focus: "Incline and front squats" }, { week: 6, kind: "deload", focus: "" }]));
    });
    expect(r.calls).toBe(2);
    expect(asked[1].tool).toBe("save_week");
    expect(asked[1].text).toContain("WEEK 3 FOCUS: Incline and front squats");
    expect(r.errors).toEqual([]);
    const plan = r.value as AiPlan;
    expect(plan.later_weeks?.map((w) => [w.week, w.kind])).toEqual([[3, "new"], [6, "deload"], [7, "back"]]);
    expect(plan.later_weeks?.[1].days[0].items.map((i) => [i.exercise_id, i.sets])).toEqual([["Incline", 2], ["Row", 2]]);
    expect(r.tokens).toEqual({ input_tokens: 200, output_tokens: 100 });
  });

  it("keeps the plan when one week fails, and that week repeats the one before", async () => {
    const r = await runAi(base, async ({ tool }) => {
      if (tool.name === "save_week") throw new Error("timed out");
      return reply(planAnswer([{ week: 3, kind: "new", focus: "f" }]));
    });
    expect((r.value as AiPlan).later_weeks).toEqual([]);
    expect((r.value as AiPlan).days).toHaveLength(2);
    expect(r.errors.some((e) => /Week 3 couldn't be written/.test(e))).toBe(true);
  });

  it("an edit of a saved plan ignores any schedule (its other weeks stay as they are)", async () => {
    let calls = 0;
    const r = await runAi(
      { ...base, kind: "edit", prompt: "shorter", options: undefined, plan: { name: "P", goal: "strength", weeks: 8, notes: null, days: [] } },
      async () => {
        calls++;
        return reply(planAnswer([{ week: 3, kind: "new", focus: "f" }]));
      },
    );
    expect(calls).toBe(1);
    expect((r.value as AiPlan).later_weeks).toBeUndefined();
  });

  it("a follow-up on a draft revises each earlier-written week instead of starting it over", async () => {
    const texts: string[] = [];
    await runAi(
      {
        ...base, kind: "edit", prompt: "swap rows for pull-ups", options: undefined, draft: true,
        plan: {
          name: "P", goal: "strength", weeks: 8, notes: null,
          days: [{ id: "draft-1", name: "Upper", items: week1[0].items }, { id: "draft-2", name: "Lower", items: week1[1].items }],
          later: [{ week: 3, kind: "new", focus: "f", days: [{ name: "Upper", items: week1[0].items }, { name: "Lower", items: week1[1].items }] }],
        },
      },
      async ({ tool, messages }) => {
        const blocks = messages[0].content as { text?: string }[];
        texts.push(String(blocks.at(-1)?.text ?? ""));
        return tool.name === "save_week" ? reply(weekAnswer, "save_week") : reply(planAnswer([{ week: 3, kind: "new", focus: "f" }]));
      },
    );
    expect(texts[0]).toContain("Its current schedule");
    expect(texts[1]).toContain("WEEK 3 NOW");
    expect(texts[1]).toContain("swap rows for pull-ups");
  });
});
