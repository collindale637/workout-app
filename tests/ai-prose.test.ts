import { describe, expect, it } from "vitest";
import { prose } from "@/lib/ai/validate";

describe("prose (AI summary and progression text)", () => {
  it("keeps short text as it is, tidying spaces", () => {
    expect(prose("  Add a rep  each week. ", 100)).toBe("Add a rep each week.");
  });
  it("cuts long text at the last full sentence, never mid-sentence", () => {
    const t = "Add weight when every set hits the top of the range. Deload every fifth week. Keep records on the main lifts and track them weekly.";
    expect(prose(t, 90)).toBe("Add weight when every set hits the top of the range. Deload every fifth week.");
  });
  it("one very long sentence ends with an ellipsis on a word boundary", () => {
    const out = prose("word ".repeat(100), 50);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
  });
  it("non-strings become empty", () => {
    expect(prose(undefined, 10)).toBe("");
  });
});
