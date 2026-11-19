import { describe, expect, it } from "vitest";
import { checkImportSchedule } from "@/lib/ai/weeks";
import { taskBlock } from "@/lib/ai/prompts";
import { runAi, type Call } from "@/lib/ai/run";
import type { AiImport, AiRequest, AllowedExercise } from "@/lib/ai/types";

/* Imports that run several weeks (Batch 20e): week 1 plus each later week that differs, read in parallel. */

const allowList: AllowedExercise[] = [
  { id: "Bench", name: "Bench Press", muscles: ["chest"], type: "compound" },
  { id: "Squat", name: "Squat", muscles: ["quads"], type: "compound" },
];
const line = (written: string, id: string | null, extra: Record<string, unknown> = {}) => ({
  written, standard_name: written, exercise_id: id, match: id ? "exact" : "none", is_cardio: false,
  sets: 3, rep_min: 10, rep_max: 10, rest_sec: 90, superset_group: null, notes: null, ...extra,
});
const base: AiRequest = {
  kind: "import", prompt: "Week 1: Bench 3x10, Squat 3x10\nWeek 2: same\nWeek 3: Bench 4x6, Squat 4x6", exercises: allowList, gym: null,
  profile: { goal: "strength", experience: "intermediate", days_per_week: 2, session_minutes: 60, units: "lb", default_rpe: 8 },
};
const reply = (input: unknown, tool: string): Call => ({
  input, toolUseId: "tu", content: [{ type: "tool_use", id: "tu", name: tool, input }], usage: { input_tokens: 100, output_tokens: 50 }, truncated: false,
});
const week1 = (schedule: unknown) => ({
  name: "Coach plan", goal: "strength", weeks: 4, summary: "s", progression: "p", problems: null,
  days: [{ name: "Day 1", exercises: [line("Bench", "Bench"), line("Squat", "Squat")] }],
  schedule,
});

describe("an imported plan's later weeks", () => {
  it("keeps weeks 2–12 in order, each once", () => {
    const r = checkImportSchedule([{ week: 3, focus: "4 × 6" }, { week: 3, focus: "again" }, { week: 1, focus: "x" }, { week: 14, focus: "x" }, { week: 2, focus: "" }]);
    expect(r.schedule).toEqual([{ week: 2, focus: "" }, { week: 3, focus: "4 × 6" }]);
    expect(r.errors).toHaveLength(3);
    expect(checkImportSchedule(undefined)).toEqual({ schedule: [], errors: [] });
  });

  it("asks for the schedule instead of folding later weeks into week 1", () => {
    const t = taskBlock(base);
    expect(t).toContain(`"days" are week 1 only`);
    expect(t).toContain("Day 1–30");
    expect(t).not.toContain("use week 1 and describe");
  });

  it("reads each later week in its own call, with the source again, and keeps the weeks in order", async () => {
    const asked: { tool: string; blocks: Record<string, unknown>[] }[] = [];
    const r = await runAi({ ...base, images: [{ media_type: "image/png", data: "img" }] }, async ({ tool, messages }) => {
      const blocks = messages[0].content as Record<string, unknown>[];
      asked.push({ tool: tool.name, blocks });
      if (tool.name === "save_import_week") {
        const text = String(blocks.at(-1)!.text);
        const week = Number(/WEEK (\d+) of the workout plan/.exec(text)![1]);
        return reply({ problems: null, days: [{ name: "Day 1", exercises: [line("Bench", "Bench", { sets: week + 1, rep_min: 6, rep_max: 6 })] }] }, "save_import_week");
      }
      return reply(week1([{ week: 4, focus: "5 × 6" }, { week: 3, focus: "4 × 6" }]), "save_import");
    });
    expect(asked.map((a) => a.tool).sort()).toEqual(["save_import", "save_import_week", "save_import_week"]);
    const weekCall = asked.find((a) => a.tool === "save_import_week")!;
    expect(weekCall.blocks[0]).toMatchObject({ type: "image" });
    expect(String(weekCall.blocks.at(-1)!.text)).toContain("PASTED TEXT");
    const imp = r.value as AiImport;
    expect(imp.later_weeks?.map((w) => [w.week, w.days[0].lines[0].sets])).toEqual([[3, 4], [4, 5]]);
    expect(r.errors).toEqual([]);
  });

  it("a week that can't be read is reported by number, and the import still comes back", async () => {
    const r = await runAi(base, async ({ tool }) => {
      if (tool.name === "save_import_week") throw new Error("timed out");
      return reply(week1([{ week: 3, focus: "4 × 6" }]), "save_import");
    });
    expect((r.value as AiImport).days).toHaveLength(1);
    expect((r.value as AiImport).later_weeks).toEqual([]);
    expect(r.errors[0]).toMatch(/^Couldn't read week 3/);
  });

  it("a one-week source makes one call, as before", async () => {
    let calls = 0;
    const r = await runAi(base, async () => {
      calls++;
      return reply(week1([]), "save_import");
    });
    expect(calls).toBe(1);
    expect((r.value as AiImport).later_weeks).toBeUndefined();
  });
});
