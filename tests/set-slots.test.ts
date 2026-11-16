import { describe, expect, it } from "vitest";
import { filledSets, nextSlot, slotRows } from "@/lib/set-slots";

const W = { type: "working" as const };
const WU = { type: "warmup" as const };
const D = { type: "drop" as const };
const kinds = (r: ReturnType<typeof slotRows>) => r.map((x) => `${x.kind}${"slot" in x && x.slot !== null ? x.slot : ""}`);

describe("set slots (skip sets)", () => {
  it("shows every planned set", () => {
    expect(kinds(slotRows([W], 3))).toEqual(["logged1", "next2", "planned3"]);
    expect(kinds(slotRows([], 3))).toEqual(["next1", "planned2", "planned3"]);
  });

  it("logged sets fill the slots that weren't skipped", () => {
    expect(kinds(slotRows([W], 3, [2]))).toEqual(["logged1", "skipped2", "next3"]);
    expect(kinds(slotRows([W, W], 3, [2]))).toEqual(["logged1", "skipped2", "logged3", "next4"]);
    expect(nextSlot([W], 3, [2])).toBe(3);
    expect(nextSlot([W], 3, [3])).toBe(2);
  });

  it("warm-ups don't use a slot; drop sets do", () => {
    expect(kinds(slotRows([WU, W, D], 3))).toEqual(["logged", "logged1", "logged2", "next3"]);
  });

  it("counts skipped sets toward finishing, ignoring slots past the target", () => {
    expect(filledSets([W, W], 3, [3])).toBe(3);
    expect(filledSets([W], 2, [5])).toBe(1);
    const done = slotRows([W, W], 3, [3]);
    expect(done.at(-1)).toEqual({ kind: "next", slot: 4, extra: true });
  });
});

import { repairSupersets } from "@/lib/workout";

describe("supersets after drag to reorder", () => {
  it("keeps neighbours linked", () => {
    expect(repairSupersets([null, 1, 1, null])).toEqual([null, 1, 1, null]);
  });
  it("unlinks an exercise dragged out of its superset", () => {
    expect(repairSupersets([1, null, 1, 1])).toEqual([null, null, 1, 1]);
    expect(repairSupersets([1, null, 1])).toEqual([null, null, null]);
  });
  it("breaks a pair when something is dropped between them", () => {
    expect(repairSupersets([2, null, 2, 3, 3])).toEqual([null, null, null, 3, 3]);
  });
});
