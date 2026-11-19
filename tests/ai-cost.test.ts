import { describe, expect, it } from "vitest";
import { costUsd, withAnswerLine } from "@/lib/ai/claude-pricing";
import { varyDefault } from "@/lib/ai/weeks";
import { runAi, type Call } from "@/lib/ai/run";
import type { AiRequest, AllowedExercise } from "@/lib/ai/types";

/* Spending fewer Claude credits without changing what Claude sees (Batch 21). */

const allowList: AllowedExercise[] = [{ id: "Bench", name: "Bench Press", muscles: ["chest"], type: "compound" }];
const item = { exercise_id: "Bench", sets: 3, rep_min: 8, rep_max: 10, rest_sec: 90, superset_group: null, notes: null };
const base: AiRequest = {
  kind: "plan", prompt: "", exercises: allowList, gym: null,
  profile: { goal: "strength", experience: "intermediate", days_per_week: 1, session_minutes: 45, units: "lb", default_rpe: 8 },
  options: { goal: "strength", days_per_week: 1, weeks: 8, session_minutes: 45, vary: true },
};
const plan = (schedule: unknown) => ({
  name: "P", goal: "strength", weeks: 8, summary: "", progression: "", changes: [], schedule,
  days: [{ name: "Push", ref_day_id: null, exercises: [item] }],
});
const reply = (input: unknown, tool: string): Call => ({
  input, toolUseId: "tu", content: [{ type: "tool_use", id: "tu", name: tool, input }], usage: { input_tokens: 10, output_tokens: 5 }, truncated: false,
});

describe("prompt caching", () => {
  it("prices cached tokens: writes at 1.25×, reads at a tenth", () => {
    // Sonnet: $2 in, $10 out per million.
    expect(costUsd("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(2);
    expect(costUsd("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 0, cache_write: 1_000_000 })).toBeCloseTo(2.5);
    expect(costUsd("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 0, cache_read: 1_000_000 })).toBeCloseTo(0.2);
  });

  it("a build with changing weeks sends the same tools to every call and marks the shared part for the cache", async () => {
    const seen: { tool: string; tools: string[]; system: string; cache: unknown }[] = [];
    await runAi(base, async ({ tool, tools, system, messages }) => {
      const blocks = messages[0].content as Record<string, unknown>[];
      seen.push({ tool: tool.name, tools: (tools ?? []).map((t) => t.name), system, cache: blocks.find((b) => b.cache_control)?.cache_control });
      return tool.name === "save_week" ? reply({ days: [{ name: "Push", exercises: [item] }] }, "save_week") : reply(plan([{ week: 3, kind: "new", focus: "variations" }]), "save_plan");
    });
    expect(seen.map((s) => s.tool)).toEqual(["save_plan", "save_week"]);
    expect(seen[0].tools).toEqual(["save_plan", "save_week"]);
    expect(seen[1].tools).toEqual(seen[0].tools);
    expect(seen[1].system).toBe(seen[0].system);
    expect(seen.every((s) => JSON.stringify(s.cache) === JSON.stringify({ type: "ephemeral" }))).toBe(true);
  });

  it("one-call requests are sent as before (no cache write to pay for)", async () => {
    let tools: unknown = "unset";
    let cache = false;
    await runAi({ ...base, options: { ...base.options!, vary: false } }, async (o) => {
      tools = o.tools;
      cache = (o.messages[0].content as Record<string, unknown>[]).some((b) => b.cache_control);
      return reply(plan([]), "save_plan");
    });
    expect(tools).toBeUndefined();
    expect(cache).toBe(false);
  });

  it("says which tool to answer with after the cached part, so the start stays the same", () => {
    const [m] = withAnswerLine([{ role: "user", content: [{ type: "text", text: "context" }, { type: "text", text: "task" }] }], "save_week");
    const blocks = m.content as { text: string }[];
    expect(blocks.map((b) => b.text)).toEqual(["context", "task", "Answer ONLY by calling the save_week tool, with no other text."]);
  });
});

describe("Workouts each week default", () => {
  it("is the same each week on 4-week plans and Change it up on longer ones, until you pick", () => {
    expect(varyDefault(4, null)).toBe(false);
    expect(varyDefault(6, null)).toBe(true);
    expect(varyDefault(12, null)).toBe(true);
    expect(varyDefault(4, true)).toBe(true);
    expect(varyDefault(8, false)).toBe(false);
  });
});
