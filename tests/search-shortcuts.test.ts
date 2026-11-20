import { describe, expect, it } from "vitest";
import { expandQueryWords, matchesSearch, searchTerms } from "@/lib/ai/match";

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
  it("doesn't turn 'tricep' into 'triceps', which would hide 'Band Tricep Pushdown'", () => {
    expect(expandQueryWords(["tricep"])).toEqual(["tricep"]);
    expect(expandQueryWords(["bicep"])).toEqual(["bicep"]);
  });
});

describe("search matching", () => {
  const finds = (q: string, text: string) => matchesSearch(text, searchTerms(q));

  it("finds plurals and singulars either way", () => {
    expect(finds("bicep curls", "Band Bicep Curl")).toBe(true);
    expect(finds("biceps curl", "Machine Bicep Curl")).toBe(true);
    expect(finds("tricep", "Band Tricep Pushdown")).toBe(true);
    expect(finds("lat raises", "Lateral Raise Side Raise")).toBe(true);
    expect(finds("calves", "Calf Press")).toBe(true);
    expect(finds("farmers walk", "Farmer's Carry Farmer's Walk")).toBe(true);
  });
  it("splits hyphens, so pull-up finds Pullups", () => {
    expect(finds("pull-up", "V-Bar Pullup")).toBe(true);
    expect(finds("step-up", "Dumbbell Step Ups")).toBe(true);
  });
  it("still needs every word, and shorthand still means the full word", () => {
    expect(finds("bicep curl", "Hammer Curl")).toBe(false);
    expect(finds("bb row", "Dumbbell Row")).toBe(false);
    expect(finds("bb row", "Barbell Row")).toBe(true);
    expect(finds("db press", "Sandbag Press")).toBe(false);
  });
  it("matches on alternate names", () => {
    expect(finds("gravitron", "Assisted Pull-Up Gravitron Machine Assisted Pull-Up")).toBe(true);
    expect(finds("rfess", "Dumbbell Bulgarian Split Squat Bulgarian Split Squat RFESS")).toBe(true);
  });
});
