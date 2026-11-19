/* Pricing and message helpers for the Claude calls. Kept apart from claude.ts (server-only) so tests can use them. */

type Block = Record<string, unknown>;

/** USD per million tokens [input, output]. Unknown models are priced like Opus to stay on the safe side. */
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-5-5": [1, 5],
  "claude-opus-5-5": [4, 20],
};

/**
 * input_tokens counts every input token, cached or not. Of those, cache_write tokens were saved to the prompt cache
 * (billed at 1.25× the input price) and cache_read tokens came from it (billed at 0.1×).
 */
export type Usage = { input_tokens: number; output_tokens: number; cache_write?: number; cache_read?: number };

export function costUsd(model: string, u: Usage) {
  const [i, o] = PRICES[model] ?? [4, 20];
  const write = u.cache_write ?? 0;
  const read = u.cache_read ?? 0;
  const plain = Math.max(0, u.input_tokens - write - read);
  return (plain * i + write * i * 1.25 + read * i * 0.1 + u.output_tokens * o) / 1_000_000;
}

/** Text added to the end of the first message (after the cached part) when a build shares one tool list. */
export const answerLine = (tool: string) => `Answer ONLY by calling the ${tool} tool, with no other text.`;

type Msg = { role: string; content: string | Block[] };
export function withAnswerLine<M extends Msg>(messages: M[], tool: string): M[] {
  const line: Block = { type: "text", text: answerLine(tool) };
  return messages.map((m, i) => (i === 0 ? { ...m, content: typeof m.content === "string" ? [{ type: "text", text: m.content }, line] : [...m.content, line] } : m));
}

