/*
  The how-to sheet shows three short cues first (the first sentence of the first three steps), with the full
  steps under "More". The steps in the exercise library are long paragraphs, so this keeps the sheet readable
  mid-set.
*/

const MAX_CUE = 110;

/** The first sentence of a step, cut at a word if it's still long. */
export function shortCue(step: string): string {
  const t = step.replace(/\s+/g, " ").trim();
  const first = t.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? t;
  if (first.length <= MAX_CUE) return first;
  const cut = first.slice(0, MAX_CUE).replace(/\s+\S*$/, "");
  return `${cut}…`;
}

/** Up to three cues, and whether the full steps say more than the cues do. */
export function cuesFor(steps: string[]): { cues: string[]; hasMore: boolean } {
  const cues = steps.slice(0, 3).map(shortCue);
  const hasMore = steps.length > 3 || steps.slice(0, 3).some((s, i) => s.replace(/\s+/g, " ").trim() !== cues[i]);
  return { cues, hasMore };
}
