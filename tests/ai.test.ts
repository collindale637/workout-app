import { describe, expect, it } from "vitest";
import { checkImport, checkItems, checkPicks, checkPlan, checkWorkout, normalizeSupersets } from "@/lib/ai/validate";
import { buildMatchIndex, matchLine, normalize } from "@/lib/ai/match";
import { contextBlock, taskBlock } from "@/lib/ai/prompts";
import { draftSnapshot, planNotes, targetsFor } from "@/lib/ai/apply";
import { runAi, type Call, type Msg } from "@/lib/ai/run";
import type { AiRequest, AllowedExercise } from "@/lib/ai/types";
import { catalog, exercises, muscles } from "./fixtures/catalog";

const allowList: AllowedExercise[] = [
  { id: "Barbell_Bench_Press_-_Medium_Grip", name: "Bench Press", muscles: ["chest"], type: "compound" },
  { id: "Side_Lateral_Raise", name: "Lateral Raise", muscles: ["side_delts"], type: "isolation" },
  { id: "Triceps_Pushdown", name: "Triceps Pushdown", muscles: ["triceps"], type: "isolation" },
  { id: "Plank", name: "Plank", muscles: ["abs"], type: "core" },
  { id: "Running_Treadmill", name: "Treadmill Run", muscles: [], type: "cardio" },
];
const allow = new Map(allowList.map((e) => [e.id, e]));
const item = (exercise_id: string, extra: Record<string, unknown> = {}) => ({
  exercise_id, sets: 3, rep_min: 8, rep_max: 12, rest_sec: 90, superset_group: null, notes: null, ...extra,
});

describe("AI answer checks", () => {
  it("rejects exercises that aren't on the gym's list (so the AI can't invent or use missing equipment)", () => {
    const errors: string[] = [];
    const items = checkItems([item("Barbell_Bench_Press_-_Medium_Grip"), item("Made_Up_Machine_Press"), item("Barbell_Squat")], allow, "Day 1", errors);
    expect(items.map((i) => i.exercise_id)).toEqual(["Barbell_Bench_Press_-_Medium_Grip"]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/Made_Up_Machine_Press/);
  });

  it("checks numbers, fixes swapped rep ranges, and fills a missing end of the range", () => {
    const errors: string[] = [];
    const [a, b, c] = checkItems(
      [item("Barbell_Bench_Press_-_Medium_Grip", { sets: 40 }), item("Side_Lateral_Raise", { rep_min: 15, rep_max: 10 }), item("Triceps_Pushdown", { rep_min: null, rep_max: 12, rest_sec: null })],
      allow, "Day 1", errors,
    );
    expect(a.sets).toBe(10);
    expect(errors.some((e) => /sets must be 1–10/.test(e))).toBe(true);
    expect([b.rep_min, b.rep_max]).toEqual([10, 15]);
    expect([c.rep_min, c.rep_max, c.rest_sec]).toEqual([12, 12, 60]);
  });

  it("turns cardio into minutes, and asks for minutes when they're missing", () => {
    const errors: string[] = [];
    const [run] = checkItems([item("Running_Treadmill", { minutes: 20, notes: "easy pace" })], allow, "Day 1", errors);
    expect(run).toMatchObject({ sets: 1, rep_min: null, rep_max: null, rest_sec: null, notes: "20 min · easy pace" });
    expect(errors).toEqual([]);
    const e2: string[] = [];
    checkItems([item("Running_Treadmill")], allow, "Day 1", e2);
    expect(e2[0]).toMatch(/minutes/);
  });

  it("drops duplicate exercises in a day and lone supersets, and renumbers supersets", () => {
    const errors: string[] = [];
    const items = checkItems(
      [item("Barbell_Bench_Press_-_Medium_Grip", { superset_group: 4 }), item("Barbell_Bench_Press_-_Medium_Grip"), item("Side_Lateral_Raise", { superset_group: 7 }), item("Triceps_Pushdown", { superset_group: 7 })],
      allow, "Day 1", errors,
    );
    expect(items.map((i) => i.superset_group)).toEqual([null, 1, 1]);
    expect(errors.some((e) => /twice/.test(e))).toBe(true);
    expect(normalizeSupersets([{ superset_group: 2 }, { superset_group: 2 }, { superset_group: 5 }])).toEqual([{ superset_group: 1 }, { superset_group: 1 }, { superset_group: null }]);
  });

  it("checks a whole plan: goal, weeks, days, and edit day ids", () => {
    const raw = {
      name: "Arms Up", goal: "hypertrophy", weeks: 8, summary: "s", progression: "p", changes: ["Shorter day 2"],
      days: [
        { name: "Push", ref_day_id: "day-a", exercises: [item("Barbell_Bench_Press_-_Medium_Grip"), item("Triceps_Pushdown")] },
        { name: "Sneaky", ref_day_id: "not-a-real-day", exercises: [item("Side_Lateral_Raise")] },
        { name: "Empty", ref_day_id: null, exercises: [item("Nope")] },
      ],
    };
    const { plan, errors } = checkPlan(raw, allow, { fallbackGoal: "general", fallbackWeeks: 6, dayIds: new Set(["day-a"]) });
    expect(plan.days.map((d) => [d.name, d.ref_day_id])).toEqual([["Push", "day-a"], ["Sneaky", null]]);
    expect(plan.changes).toEqual(["Shorter day 2"]);
    expect(errors.some((e) => /Empty/.test(e))).toBe(true);

    const bad = checkPlan({ name: "", goal: "bulk", weeks: 99, days: [] }, allow, { fallbackGoal: "general", fallbackWeeks: 6 });
    expect(bad.plan).toMatchObject({ goal: "general", weeks: 6, days: [] });
    expect(bad.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("checks a single workout", () => {
    const ok = checkWorkout({ name: "Quick Push", summary: "x", exercises: [item("Barbell_Bench_Press_-_Medium_Grip")] }, allow);
    expect(ok.errors).toEqual([]);
    expect(checkWorkout(null, allow).errors.length).toBeGreaterThan(0);
  });

  it("keeps every imported line, clearing ids that aren't in the library", () => {
    const { result, errors } = checkImport(
      {
        name: "Coach plan", goal: "strength", weeks: 12, summary: "", progression: "Add 5 lb a week", problems: null,
        days: [{
          name: "Day 1",
          exercises: [
            { written: "Bench", standard_name: "Bench Press", exercise_id: "Barbell_Bench_Press_-_Medium_Grip", match: "exact", is_cardio: false, sets: 5, rep_min: 5, rep_max: 5, rest_sec: 180, superset_group: null, notes: null },
            { written: "Zercher thing", standard_name: "Zercher Squat", exercise_id: "Zercher_Squat_Invented", match: "exact", is_cardio: false, sets: 3, rep_min: 8, rep_max: null, rest_sec: null, superset_group: 1, notes: null },
            { written: "Run", standard_name: "Treadmill Run", exercise_id: "Running_Treadmill", match: "close", is_cardio: true, sets: null, rep_min: null, rep_max: null, rest_sec: null, minutes: 25, superset_group: null, notes: null },
          ],
        }],
      },
      allow,
    );
    expect(errors).toEqual([]);
    const [bench, zercher, run] = result.days[0].lines;
    expect(bench).toMatchObject({ exercise_id: "Barbell_Bench_Press_-_Medium_Grip", match: "exact", sets: 5 });
    expect(zercher).toMatchObject({ exercise_id: null, match: "none", rep_min: 8, rep_max: 8, superset_group: null });
    expect(run).toMatchObject({ is_cardio: true, sets: 1, notes: "25 min" });
    expect(result.weeks).toBe(12);
  });
});

describe("import matching", () => {
  const index = buildMatchIndex(exercises);
  const line = (written: string, standard_name = written, exercise_id: string | null = null, match: "exact" | "close" | "none" = "none") => ({ written, standard_name, exercise_id, match });

  it("expands gym shorthand", () => {
    expect(normalize("DB RDL")).toEqual(["dumbbell", "romanian", "deadlift"]);
    expect(normalize("Lat Pulldowns")).toEqual(["lat", "pulldown"]);
  });

  it("confirms exact names and shorthand automatically", () => {
    expect(matchLine(index, line("RDL"))).toMatchObject({ status: "matched", exerciseId: "Romanian_Deadlift" });
    expect(matchLine(index, line("DB RDL"))).toMatchObject({ status: "matched", exerciseId: "Stiff-Legged_Dumbbell_Deadlift" });
    expect(matchLine(index, line("OHP"))).toMatchObject({ status: "matched", exerciseId: "Standing_Military_Press" });
    expect(matchLine(index, line("Skull crushers"))).toMatchObject({ status: "matched", exerciseId: "EZ-Bar_Skullcrusher" });
    expect(matchLine(index, line("Lat pulldowns"))).toMatchObject({ status: "matched", exerciseId: "Wide-Grip_Lat_Pulldown" });
    // The library's original name works too.
    expect(matchLine(index, line("Barbell Bench Press - Medium Grip"))).toMatchObject({ status: "matched", exerciseId: "Barbell_Bench_Press_-_Medium_Grip" });
  });

  it("trusts Claude's pick when it says it's exact, and offers suggestions when it's close", () => {
    expect(matchLine(index, line("Flat bench (comp grip)", "Bench Press thing", "Barbell_Bench_Press_-_Medium_Grip", "exact"))).toMatchObject({ status: "matched" });
    const close = matchLine(index, line("Cable lat raise, lean away", "Cable Lateral Raise variation", "Cable_Lateral_Raise", "close"));
    expect(close.status).toBe("unsure");
    expect(close.exerciseId).toBe("Cable_Lateral_Raise");
    expect(close.candidates.length).toBeGreaterThan(1);
    expect(close.candidates.length).toBeLessThanOrEqual(3);
  });

  it("is unsure about partial names and gives up on nonsense", () => {
    const curl = matchLine(index, line("Curls"));
    expect(curl.status).toBe("unsure");
    expect(curl.candidates.every((id) => /curl/i.test(id))).toBe(true);
    expect(matchLine(index, line("Tire flips with a goat"))).toMatchObject({ status: "missing", exerciseId: null });
  });
});

describe("prompts and helpers", () => {
  const req: AiRequest = {
    kind: "plan", prompt: "bigger arms", exercises: allowList,
    profile: { goal: "hypertrophy", experience: "intermediate", days_per_week: 4, session_minutes: 60, units: "lb", default_rpe: 8 },
    gym: { name: "Main Gym", equipment: ["Barbell + plates", "Dumbbells"] },
    options: { goal: "hypertrophy", days_per_week: 4, weeks: 8, session_minutes: 60 },
    recovery: { chest: 52 },
    history: ["Nov 14 · Push: Bench Press 3 × 8 @ 185 lb"],
  };

  it("gives Claude the exercise list, gym and recovery", () => {
    const ctx = contextBlock(req, { gymFiltered: true });
    expect(ctx).toContain("Barbell_Bench_Press_-_Medium_Grip | Bench Press | chest | compound");
    expect(ctx).toContain("GYM: Main Gym");
    expect(ctx).toContain("chest 52");
    expect(taskBlock(req)).toContain("Return exactly 4 distinct training days");
    expect(taskBlock({ ...req, kind: "edit", prompt: "shorter", plan: { name: "P", goal: "general", weeks: 8, notes: null, days: [{ id: "d1", name: "A", items: [] }] } })).toContain('"id":"d1"');
  });

  it("works out what a day trains from its exercises", () => {
    const t = targetsFor({ musclesOf: catalog.musclesOf, muscles }, [{ exercise_id: "Barbell_Bench_Press_-_Medium_Grip" }, { exercise_id: "Running_Treadmill" }]);
    expect(t).toContain("chest");
    expect(t.length).toBeGreaterThanOrEqual(1);
  });

  it("saves the overview and progression together, and gives drafts stand-in day ids", () => {
    expect(planNotes({ summary: "A plan.", progression: "Add reps." })).toBe("A plan.\n\nProgression: Add reps.");
    expect(planNotes({ summary: "", progression: "" })).toBeNull();
    const snap = draftSnapshot({ name: "X", goal: "general", weeks: 4, summary: "", progression: "", changes: [], days: [{ name: "A", ref_day_id: null, items: [] }] });
    expect(snap.days[0].id).toBe("draft-1");
  });
});

describe("the AI request pipeline", () => {
  const base: AiRequest = {
    kind: "workout", prompt: "quick push", exercises: allowList, gym: null,
    profile: { goal: "hypertrophy", experience: "intermediate", days_per_week: 4, session_minutes: 45, units: "lb", default_rpe: 8 },
  };
  const reply = (input: unknown, extra: Partial<Call> = {}): Call => ({
    input, toolUseId: "tu_1", content: [{ type: "tool_use", id: "tu_1", name: "save_workout", input }], usage: { input_tokens: 1000, output_tokens: 200 }, truncated: false, ...extra,
  });

  it("sends invalid answers back once with the problems, then uses the fixed answer", async () => {
    const seen: Msg[][] = [];
    const answers = [
      reply({ name: "Push", summary: "", exercises: [item("Invented_Press"), item("Triceps_Pushdown")] }),
      reply({ name: "Push", summary: "", exercises: [item("Barbell_Bench_Press_-_Medium_Grip"), item("Triceps_Pushdown")] }),
    ];
    const r = await runAi(base, async ({ messages }) => {
      seen.push(messages);
      return answers.shift()!;
    });
    expect(r.calls).toBe(2);
    expect(r.errors).toEqual([]);
    expect(r.kind === "workout" && r.value.items.map((i) => i.exercise_id)).toEqual(["Barbell_Bench_Press_-_Medium_Grip", "Triceps_Pushdown"]);
    expect(r.tokens).toMatchObject({ input_tokens: 2000, output_tokens: 400 });
    const fix = seen[1].at(-1)!.content as Record<string, unknown>[];
    expect(fix[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_1", is_error: true });
    expect(String(fix[0].content)).toContain("Invented_Press");
  });

  it("asks again when Claude answers in plain text instead of calling the tool", async () => {
    const answers = [
      reply(null, { toolUseId: null, content: [{ type: "text", text: "Here's a workout..." }] }),
      reply({ name: "Push", summary: "", exercises: [item("Barbell_Bench_Press_-_Medium_Grip")] }),
    ];
    const r = await runAi(base, async () => answers.shift()!);
    expect(r.calls).toBe(2);
    expect(r.errors).toEqual([]);
    expect(r.empty).toBe(false);
  });

  it("only retries once, then returns the cleaned answer with the problems listed", async () => {
    const bad = () => reply({ name: "Push", summary: "", exercises: [item("Invented_Press"), item("Side_Lateral_Raise")] });
    const r = await runAi(base, async () => bad());
    expect(r.calls).toBe(2);
    expect(r.errors.length).toBe(1);
    expect(r.empty).toBe(false);
    expect(r.kind === "workout" && r.value.items.map((i) => i.exercise_id)).toEqual(["Side_Lateral_Raise"]);
  });

  it("asks again with more room when the answer was cut off", async () => {
    const budgets: number[] = [];
    const answers = [reply(null, { truncated: true }), reply({ name: "Push", summary: "", exercises: [item("Triceps_Pushdown")] })];
    const r = await runAi(base, async ({ maxTokens }) => {
      budgets.push(maxTokens);
      return answers.shift()!;
    });
    expect(budgets[1]).toBeGreaterThan(budgets[0]);
    expect(r.empty).toBe(false);
  });

  it("puts photos before the text for imports", async () => {
    let first: Msg | undefined;
    await runAi({ ...base, kind: "import", prompt: "", images: [{ media_type: "image/jpeg", data: "abc" }] }, async ({ messages }) => {
      first = messages[0];
      return reply({ name: "X", goal: null, weeks: null, summary: "", progression: "", problems: null, days: [] });
    });
    const blocks = first!.content as Record<string, unknown>[];
    expect(blocks[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "abc" } });
    expect(String(blocks.at(-1)!.text)).toContain("No pasted text");
  });

  it("sends an imported PDF to Claude as a document block, before the text", async () => {
    let first: Msg | undefined;
    await runAi({ ...base, kind: "import", prompt: "", pdf: { media_type: "application/pdf", data: "JVBERi0x" } }, async ({ messages }) => {
      first = messages[0];
      return reply({ name: "X", goal: null, weeks: null, summary: "", progression: "", problems: null, days: [] });
    });
    const blocks = first!.content as Record<string, unknown>[];
    expect(blocks[0]).toMatchObject({ type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0x" } });
    expect(blocks.some((b) => b.type === "text")).toBe(true);
  });
});

describe("AI swap and add suggestions", () => {
  const today = {
    name: "Push",
    items: [
      { id: "Barbell_Bench_Press_-_Medium_Grip", name: "Bench Press", muscles: ["chest"], type: "compound" as const, sets_done: 3, sets_planned: 3 },
      { id: "Side_Lateral_Raise", name: "Lateral Raise", muscles: ["side_delts"], type: "isolation" as const, sets_done: 1, sets_planned: 3 },
    ],
  };
  const req: AiRequest = {
    kind: "swap", prompt: "", exercises: allowList, gym: { name: "Home", equipment: [] },
    profile: { goal: "hypertrophy", experience: "intermediate", days_per_week: 4, session_minutes: 45, units: "lb", default_rpe: 8 },
    today, swap: { exercise_id: "Side_Lateral_Raise", why: "busy" },
  };
  const pickReply = (input: unknown): Call => ({ input, toolUseId: "tu_1", content: [{ type: "tool_use", id: "tu_1", name: "save_picks", input }], usage: { input_tokens: 900, output_tokens: 120 }, truncated: false });

  it("only accepts candidates, never the exercise being swapped or one already in the workout", () => {
    const exclude = new Set(today.items.map((t) => t.id));
    const r = checkPicks({ picks: [
      { exercise_id: "Plank", reason: "Core, nothing today yet" },
      { exercise_id: "Side_Lateral_Raise", reason: "same" },
      { exercise_id: "Made_Up", reason: "x" },
      { exercise_id: "Plank", reason: "twice" },
      { exercise_id: "Triceps_Pushdown", reason: "a".repeat(200) },
    ] }, allow, { exclude, max: 3 });
    expect(r.picks.map((p) => p.exercise_id)).toEqual(["Plank", "Triceps_Pushdown"]);
    expect(r.picks[1].reason.length).toBeLessThanOrEqual(110);
    expect(r.errors).toHaveLength(3);
    expect(checkPicks({ nope: 1 }, allow, { exclude, max: 3 }).errors.length).toBe(1);
  });

  it("describes the workout, the exercise being replaced and why, and uses the quick-pick tool and model", async () => {
    let sent: { model?: string; system: string; tool: { name: string }; messages: Msg[] } | null = null;
    const r = await runAi(req, async (opts) => {
      sent = opts;
      return pickReply({ picks: [{ exercise_id: "Triceps_Pushdown", reason: "Different station" }] });
    }, "claude-haiku-5-5");
    expect(r.kind).toBe("swap");
    expect(r.value).toEqual([{ exercise_id: "Triceps_Pushdown", reason: "Different station" }]);
    expect(sent!.model).toBe("claude-haiku-5-5");
    expect(sent!.tool.name).toBe("save_picks");
    const text = JSON.stringify(sent!.messages);
    expect(text).toContain("Lateral Raise");
    expect(text).toContain("1/3 sets done");
    expect(text).toContain("equipment is taken");
    expect(text).toContain("CANDIDATES");
  });

  it("asks for additions to the workout, and reports an empty answer", async () => {
    const r = await runAi({ ...req, kind: "suggest", swap: undefined }, async () => pickReply({ picks: [] }));
    expect(r.empty).toBe(true);
    expect(r.calls).toBe(2); // the empty answer goes back once
  });
});
