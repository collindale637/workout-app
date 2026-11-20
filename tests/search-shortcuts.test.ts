import { describe, expect, it } from "vitest";
import { expandQueryWords } from "@/lib/ai/match";

describe("search shortcuts", () => {
  it("expands gym shorthand typed in the exercise search", () => {
    expect(expandQueryWords(["db", "press"])).toEqual(["dumbbell", "press"]);
    expect(expandQueryWords(["kb", "swing"])).toEqual(["kettlebell", "swing"]);
    expect(expandQueryWords(["ohp"])).toEqual(["overhead", "press"]);
    expect(expandQueryWords(["rdl"])).toEqual(["romanian", "deadlift"]);
    expect(expandQueryWords(["bss"])).toEqual(["bulgarian", "split", "squat"]);
  });
  it("leaves ordinary words and half-typed words alone", () => {
    expect(expandQueryWords(["curl"])).toEqual(["curl"]);
    expect(expandQueryWords(["sl"])).toEqual(["sl"]);
    expect(expandQueryWords(["sm"])).toEqual(["sm"]);
  });
});
