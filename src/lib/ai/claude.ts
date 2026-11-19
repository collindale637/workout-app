import "server-only";
import type { CallFn } from "./run";
import { answerLine, withAnswerLine } from "./claude-pricing";

export { costUsd, type Usage } from "./claude-pricing";

/*
  Calls the Claude API (Messages API) from the server. The API key lives only in Vercel's environment
  variables (ANTHROPIC_API_KEY) and never reaches the phone.
*/

export const AI_MODEL = process.env.AI_MODEL || "claude-sonnet-5-5";
/** Quick picks mid-workout (swap, suggest): a faster, cheaper model; the work is small and well-defined. */
export const AI_FAST_MODEL = process.env.AI_FAST_MODEL || "claude-haiku-5-5";
/** Shared by the whole family: once this month's spend reaches it, AI features pause until next month. */
export const AI_MONTHLY_CAP_USD = Number(process.env.AI_MONTHLY_CAP_USD || 10);
export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

type Block = Record<string, unknown>;

export class AiError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

/** One Claude call that must answer through `tool`. Returns the (unchecked) tool input and Claude's full reply. */
export const callTool: CallFn = async (opts) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiError("AI isn't set up yet: add ANTHROPIC_API_KEY in Vercel.", 503);
  const tools = opts.tools?.length ? opts.tools : [opts.tool];
  const shared = tools.length > 1;
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: opts.model ?? AI_MODEL,
        max_tokens: opts.maxTokens,
        // This model doesn't accept a forced tool_choice, so ask for the tool in the prompt instead. If it
        // ever answers in plain text, the result has no tool call and run.ts sends it back once to fix.
        // A build that shares one tool list (for the prompt cache) keeps the system prompt identical across its calls
        // and says which tool to use at the end of the first message instead.
        system: shared ? opts.system : `${opts.system}\n\n${answerLine(opts.tool.name)}`,
        messages: shared ? withAnswerLine(opts.messages, opts.tool.name) : opts.messages,
        tools,
        tool_choice: { type: "auto" },
      }),
      signal: AbortSignal.timeout(opts.maxTokens <= 1000 ? 30_000 : 130_000),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new AiError(timedOut ? "Claude took too long to answer. Try again, or ask for something smaller." : "Couldn't reach Claude. Try again in a minute.");
  }
  const data = (await res.json().catch(() => null)) as
    | { content?: Block[]; usage?: Record<string, number>; stop_reason?: string; error?: { type?: string; message?: string } }
    | null;
  if (!res.ok || !data) {
    const type = data?.error?.type;
    if (res.status === 401) throw new AiError("The Claude API key was rejected. Check ANTHROPIC_API_KEY in Vercel.", 503);
    if (res.status === 429 || type === "rate_limit_error") throw new AiError("Claude is busy right now. Try again in a minute.", 429);
    if (res.status === 529 || type === "overloaded_error") throw new AiError("Claude is overloaded right now. Try again in a minute.", 503);
    if (type === "invalid_request_error" && /credit|billing/i.test(data?.error?.message ?? "")) {
      throw new AiError("The Claude API account is out of credit.", 503);
    }
    const detail = (data?.error?.message ?? "").slice(0, 300);
    console.error("Claude API error", res.status, type, detail);
    throw new AiError(`Claude returned an error (${res.status}${detail ? `: ${detail}` : ""}). Try again.`);
  }
  const content = data.content ?? [];
  // The answer is the call to the tool asked for; a call to another tool in the list counts as no answer (sent back to fix).
  const use = content.find((b) => b.type === "tool_use" && b.name === opts.tool.name);
  const u = data.usage ?? {};
  return {
    input: use?.input ?? null,
    toolUseId: typeof use?.id === "string" ? use.id : null,
    content,
    usage: {
      input_tokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      output_tokens: u.output_tokens ?? 0,
      cache_write: u.cache_creation_input_tokens ?? 0,
      cache_read: u.cache_read_input_tokens ?? 0,
    },
    truncated: data.stop_reason === "max_tokens",
  };
};
