import { IMPORT_TOOL, PICK_SYSTEM, PICK_TOOL, PLAN_TOOL, SYSTEM, WORKOUT_TOOL, contextBlock, pickBlock, taskBlock } from "./prompts";
import { checkImport, checkPicks, checkPlan, checkWorkout } from "./validate";
import type { AiImport, AiKind, AiPick, AiPlan, AiRequest, AiWorkout, AllowedExercise } from "./types";

/*
  One AI request from start to finish: build the prompt, ask Claude, check the answer, send problems back
  once to fix, and add up the tokens. The Claude call is passed in so this can be tested without the API.
*/

type Block = Record<string, unknown>;
export type Msg = { role: "user" | "assistant"; content: string | Block[] };
export type Call = { input: unknown; toolUseId: string | null; content: Block[]; usage: { input_tokens: number; output_tokens: number }; truncated: boolean };
export type CallFn = (opts: { model?: string; system: string; messages: Msg[]; tool: { name: string; description: string; input_schema: Record<string, unknown> }; maxTokens: number }) => Promise<Call>;

export const MAX_TOKENS: Record<AiKind, number> = { plan: 8000, edit: 8000, workout: 3000, day: 3000, import: 10000, swap: 700, suggest: 900 };

export type RunResult =
  | { kind: "plan" | "edit"; value: AiPlan; errors: string[]; empty: boolean; tokens: { input_tokens: number; output_tokens: number }; calls: number }
  | { kind: "workout" | "day"; value: AiWorkout; errors: string[]; empty: boolean; tokens: { input_tokens: number; output_tokens: number }; calls: number }
  | { kind: "import"; value: AiImport; errors: string[]; empty: boolean; tokens: { input_tokens: number; output_tokens: number }; calls: number }
  | { kind: "swap" | "suggest"; value: AiPick[]; errors: string[]; empty: boolean; tokens: { input_tokens: number; output_tokens: number }; calls: number };

/** The follow-up that sends problems back to Claude to fix. */
export function fixMessages(call: Call, errors: string[]): Msg[] {
  const text = `That answer has problems. Fix them and call the tool again with the complete corrected answer:\n${errors
    .slice(0, 25)
    .map((e) => `- ${e}`)
    .join("\n")}`;
  return [
    { role: "assistant", content: call.content },
    { role: "user", content: call.toolUseId ? [{ type: "tool_result", tool_use_id: call.toolUseId, is_error: true, content: text }] : text },
  ];
}

export async function runAi(req: AiRequest, callTool: CallFn, model?: string): Promise<RunResult> {
  const allow = new Map<string, AllowedExercise>(req.exercises.map((e) => [e.id, e]));
  const isPlan = req.kind === "plan" || req.kind === "edit";
  const isPick = req.kind === "swap" || req.kind === "suggest";
  const tool = isPick ? PICK_TOOL : req.kind === "import" ? IMPORT_TOOL : isPlan ? PLAN_TOOL : WORKOUT_TOOL;
  const system = isPick ? PICK_SYSTEM : SYSTEM;
  const content: Block[] = [];
  if (req.pdf) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: req.pdf.data } });
  for (const img of req.images ?? []) content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
  if (isPick) content.push({ type: "text", text: pickBlock(req) });
  else {
    content.push({ type: "text", text: contextBlock(req, { gymFiltered: req.kind !== "import" }) });
    content.push({ type: "text", text: taskBlock(req) });
  }
  const messages: Msg[] = [{ role: "user", content }];
  const pickExclude = new Set([...(req.today?.items.map((t) => t.id) ?? []), ...(req.swap ? [req.swap.exercise_id] : [])]);

  const check = (input: unknown): { value: AiPlan | AiWorkout | AiImport | AiPick[]; errors: string[] } => {
    if (isPick) {
      const r = checkPicks(input, allow, { exclude: pickExclude, max: req.kind === "swap" ? 3 : 4 });
      return { value: r.picks, errors: r.errors };
    }
    if (req.kind === "import") {
      const r = checkImport(input, allow);
      return { value: r.result, errors: r.errors };
    }
    if (isPlan) {
      const r = checkPlan(input, allow, {
        fallbackGoal: req.options?.goal ?? req.plan?.goal ?? req.profile.goal,
        fallbackWeeks: req.options?.weeks ?? req.plan?.weeks ?? 8,
        dayIds: new Set(req.plan?.days.map((d) => d.id) ?? []),
      });
      return { value: r.plan, errors: r.errors };
    }
    const r = checkWorkout(input, allow);
    return { value: r.workout, errors: r.errors };
  };

  const tokens = { input_tokens: 0, output_tokens: 0 };
  let calls = 0;
  const ask = async (msgs: Msg[], maxTokens: number) => {
    const c = await callTool({ model, system, messages: msgs, tool, maxTokens });
    tokens.input_tokens += c.usage.input_tokens;
    tokens.output_tokens += c.usage.output_tokens;
    calls++;
    return c;
  };

  const maxTokens = MAX_TOKENS[req.kind];
  let call = await ask(messages, maxTokens);
  // Ran out of room mid-answer: ask again with more room.
  if (call.truncated) call = await ask(messages, Math.round(maxTokens * 1.6));
  let { value, errors } = check(call.input);
  // Anything invalid goes back to Claude once to fix.
  if (errors.length && !call.truncated) {
    const retry = await ask([...messages, ...fixMessages(call, errors)], Math.round(maxTokens * 1.6));
    if (!retry.truncated) ({ value, errors } = check(retry.input));
  }
  const empty = isPick ? !(value as AiPick[]).length : req.kind === "import" ? false : isPlan ? !(value as AiPlan).days.length : !(value as AiWorkout).items.length;
  return { kind: req.kind, value, errors, empty, tokens, calls } as RunResult;
}
