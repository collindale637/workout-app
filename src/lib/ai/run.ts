import { IMPORT_TOOL, IMPORT_WEEK_TOOL, PICK_SYSTEM, PICK_TOOL, PLAN_TOOL, SYSTEM, WEEK_TOOL, WORKOUT_TOOL, contextBlock, importWeekTaskBlock, pickBlock, taskBlock, weekTaskBlock } from "./prompts";
import { checkImport, checkImportDays, checkPicks, checkPlan, checkWorkout } from "./validate";
import { assembleWeeks, checkImportSchedule, checkSchedule, checkWeek } from "./weeks";
import type { AiDay, AiImport, ImportWeek, AiKind, AiPick, AiPlan, AiRequest, AiWorkout, AllowedExercise, WeekChange } from "./types";

/*
  One AI request from start to finish: build the prompt, ask Claude, check the answer, send problems back
  once to fix, and add up the tokens. The Claude call is passed in so this can be tested without the API.
*/

type Block = Record<string, unknown>;
export type Msg = { role: "user" | "assistant"; content: string | Block[] };
export type Usage = { input_tokens: number; output_tokens: number; cache_write?: number; cache_read?: number };
export type Call = { input: unknown; toolUseId: string | null; content: Block[]; usage: Usage; truncated: boolean };
type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
/**
 * `tool` is the one to answer with. `tools`, when given, is the whole list sent with the call: a build that makes
 * several calls sends the same list every time so the prompt cache can be reused (tools are the start of the cache).
 */
export type CallFn = (opts: { model?: string; system: string; messages: Msg[]; tool: ToolDef; tools?: ToolDef[]; maxTokens: number }) => Promise<Call>;

export const MAX_TOKENS: Record<AiKind, number> = { plan: 8000, edit: 8000, workout: 3000, day: 3000, import: 10000, swap: 700, suggest: 900 };
/** One later week of a plan whose workouts change (about the size of a whole one-week plan). */
export const WEEK_MAX_TOKENS = 8000;
/** Past this, later weeks skip the second try to fix problems, so the whole build stays inside the server's time limit. */
const WEEK_RETRY_CUTOFF_MS = 120_000;
type Tool = Parameters<CallFn>[0]["tool"];

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
  // The PDF and photos go first; an import's later weeks are read from them again.
  const source: Block[] = [];
  if (req.pdf) source.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: req.pdf.data } });
  for (const img of req.images ?? []) source.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
  // Builds that can take several calls (changing weeks, multi-week imports) cache the shared start of the request:
  // the PDF or photos, then the person, gym and exercise list. Later calls read it back at a tenth of the price.
  const cached = req.kind === "import" || (req.kind === "plan" && req.options?.vary === true) || (req.kind === "edit" && req.draft === true);
  const toolset = cached ? (req.kind === "import" ? [IMPORT_TOOL, IMPORT_WEEK_TOOL] : [PLAN_TOOL, WEEK_TOOL]) : undefined;
  const contextText = (gymFiltered: boolean): Block => ({
    type: "text", text: contextBlock(req, { gymFiltered }), ...(cached ? { cache_control: { type: "ephemeral" } } : {}),
  });
  const content: Block[] = [...source];
  if (isPick) content.push({ type: "text", text: pickBlock(req) });
  else {
    content.push(contextText(req.kind !== "import"));
    content.push({ type: "text", text: taskBlock(req) });
  }
  const messages: Msg[] = [{ role: "user", content }];
  const pickExclude = new Set([...(req.today?.items.map((t) => t.id) ?? []), ...(req.swap ? [req.swap.exercise_id] : [])]);

  // A plan's schedule (the weeks whose workouts change) is read with the plan; saved-plan edits keep their weeks as they are.
  const scheduled = req.kind === "plan" || (req.kind === "edit" && req.draft === true);
  let schedule: WeekChange[] = [];
  let importSchedule: { week: number; focus: string }[] = [];

  const check = (input: unknown): { value: AiPlan | AiWorkout | AiImport | AiPick[]; errors: string[] } => {
    if (isPick) {
      const r = checkPicks(input, allow, { exclude: pickExclude, max: req.kind === "swap" ? 3 : 4 });
      return { value: r.picks, errors: r.errors };
    }
    if (req.kind === "import") {
      const r = checkImport(input, allow);
      const s = checkImportSchedule(typeof input === "object" && input !== null ? (input as Record<string, unknown>).schedule : undefined);
      importSchedule = s.schedule;
      return { value: r.result, errors: [...r.errors, ...s.errors] };
    }
    if (isPlan) {
      const r = checkPlan(input, allow, {
        fallbackGoal: req.options?.goal ?? req.plan?.goal ?? req.profile.goal,
        fallbackWeeks: req.options?.weeks ?? req.plan?.weeks ?? 8,
        dayIds: new Set(req.plan?.days.map((d) => d.id) ?? []),
      });
      if (!scheduled) return { value: r.plan, errors: r.errors };
      const s = checkSchedule(typeof input === "object" && input !== null ? (input as Record<string, unknown>).schedule : undefined, r.plan.weeks);
      schedule = s.schedule;
      return { value: r.plan, errors: [...r.errors, ...s.errors] };
    }
    const r = checkWorkout(input, allow);
    return { value: r.workout, errors: r.errors };
  };

  const tokens = { input_tokens: 0, output_tokens: 0, cache_write: 0, cache_read: 0 };
  let calls = 0;
  const started = Date.now();
  const ask = async (msgs: Msg[], maxTokens: number, t: Tool = tool) => {
    const c = await callTool({ model, system, messages: msgs, tool: t, tools: toolset, maxTokens });
    tokens.input_tokens += c.usage.input_tokens;
    tokens.output_tokens += c.usage.output_tokens;
    tokens.cache_write += c.usage.cache_write ?? 0;
    tokens.cache_read += c.usage.cache_read ?? 0;
    calls++;
    return c;
  };

  /** Ask, check the answer, and send any problems back once to fix. */
  async function askChecked<T>(msgs: Msg[], maxTokens: number, t: Tool, checkFn: (input: unknown) => { value: T; errors: string[] }, mayRetry = true) {
    let call = await ask(msgs, maxTokens, t);
    // Ran out of room mid-answer: ask again with more room.
    if (call.truncated) call = await ask(msgs, Math.round(maxTokens * 1.6), t);
    let r = checkFn(call.input);
    // Anything invalid goes back to Claude once to fix.
    if (r.errors.length && !call.truncated && mayRetry) {
      const retry = await ask([...msgs, ...fixMessages(call, r.errors)], Math.round(maxTokens * 1.6), t);
      if (!retry.truncated) r = checkFn(retry.input);
    }
    return r;
  }

  let { value, errors } = await askChecked(messages, MAX_TOKENS[req.kind], tool, check);

  // Plans whose workouts change: write each "new" week in its own call, all at once.
  if (isPlan && scheduled && schedule.length && (value as AiPlan).days.length) {
    const plan = value as AiPlan;
    const before = req.draft ? (req.plan?.later ?? []) : [];
    const written = new Map<number, AiDay[]>();
    await Promise.all(
      schedule
        .filter((e) => e.kind === "new")
        .map(async (e) => {
          const old = before.find((w) => w.week === e.week && w.kind === "new");
          const msgs: Msg[] = [{ role: "user", content: [
            contextText(true),
            { type: "text", text: weekTaskBlock(req, plan, schedule, e.week, old?.days ?? null) },
          ] }];
          try {
            const r = await askChecked(msgs, WEEK_MAX_TOKENS, WEEK_TOOL, (input) => {
              const w = checkWeek(input, allow, e.week, plan.days);
              return { value: w.days, errors: w.errors };
            }, Date.now() - started < WEEK_RETRY_CUTOFF_MS);
            errors.push(...r.errors);
            written.set(e.week, r.value);
          } catch (err) {
            // One week failing (a timeout, say) shouldn't lose the whole plan: that week repeats the one before.
            console.error(`AI week ${e.week} failed`, err instanceof Error ? err.message : err);
          }
        }),
    );
    const assembled = assembleWeeks(schedule, written, plan.days, plan.weeks);
    errors = [...errors, ...assembled.errors];
    value = { ...plan, later_weeks: assembled.weeks };
  }

  // Imports that run several weeks: read each later week that differs in its own call, all at once.
  if (req.kind === "import" && importSchedule.length && (value as AiImport).days.length) {
    const imp = value as AiImport;
    const read = new Map<number, ImportWeek>();
    await Promise.all(
      importSchedule.map(async (e) => {
        const msgs: Msg[] = [{ role: "user", content: [
          ...source,
          contextText(false),
          { type: "text", text: importWeekTaskBlock(req, imp.days, importSchedule, e.week) },
        ] }];
        try {
          const r = await askChecked(msgs, MAX_TOKENS.import, IMPORT_WEEK_TOOL, (input) => {
            const o = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
            const days = checkImportDays(o.days, allow);
            return { value: days, errors: days.length ? [] : [`Week ${e.week}: "days" must list that week's training days.`] };
          }, Date.now() - started < WEEK_RETRY_CUTOFF_MS);
          if (r.value.length) read.set(e.week, { week: e.week, focus: e.focus, days: r.value });
        } catch (err) {
          console.error(`AI import week ${e.week} failed`, err instanceof Error ? err.message : err);
        }
      }),
    );
    const missed = importSchedule.filter((e) => !read.has(e.week)).map((e) => e.week);
    if (missed.length) errors.push(`Couldn't read week${missed.length === 1 ? "" : "s"} ${missed.join(", ")}, so ${missed.length === 1 ? "it repeats" : "they repeat"} the week before. Check them in the source.`);
    value = { ...imp, later_weeks: importSchedule.flatMap((e) => (read.has(e.week) ? [read.get(e.week)!] : [])) };
  }

  const empty = isPick ? !(value as AiPick[]).length : req.kind === "import" ? false : isPlan ? !(value as AiPlan).days.length : !(value as AiWorkout).items.length;
  return { kind: req.kind, value, errors, empty, tokens, calls } as RunResult;
}
