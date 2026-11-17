import { describe, expect, it } from "vitest";
import { repsWheel, weightWheel, wheelNumber } from "@/lib/units";

describe("dock weight wheel", () => {
  it("lb: 0 to 1000 in 5s, picks the current weight", () => {
    const w = weightWheel(100, false, "lb");
    expect(w.values[0]).toBe(0);
    expect(w.values.at(-1)).toBe(1000);
    expect(w.values[w.index]).toBe(100);
  });
  it("slots in a typed value off the steps", () => {
    const w = weightWheel(102.5, false, "lb");
    expect(w.values[w.index]).toBe(102.5);
    expect(w.values[w.index - 1]).toBe(100);
    expect(w.values[w.index + 1]).toBe(105);
  });
  it("kg: 2.5 steps up to 450", () => {
    const w = weightWheel(60, false, "kg");
    expect(w.values[1]).toBe(2.5);
    expect(w.values.at(-1)).toBe(450);
    expect(w.values[w.index]).toBe(60);
  });
  it("bodyweight lifts start at BW (null)", () => {
    expect(weightWheel(null, true, "lb")).toMatchObject({ index: 0 });
    expect(weightWheel(null, true, "lb").values.slice(0, 2)).toEqual([null, 5]);
    const w = weightWheel(25, true, "lb");
    expect(w.values[w.index]).toBe(25);
  });
  it("an unset weight shows a dash first, a set one doesn't", () => {
    expect(weightWheel(null, false, "lb").values[0]).toBeNull();
    expect(weightWheel(50, false, "lb").values[0]).toBe(0);
  });
  it("formats numbers", () => {
    expect(wheelNumber(100)).toBe("100");
    expect(wheelNumber(102.5)).toBe("102.5");
  });
});

describe("dock reps wheel", () => {
  it("1 to 50, picks the reps", () => {
    const r = repsWheel(10);
    expect(r.values[0]).toBe(1);
    expect(r.values.at(-1)).toBe(50);
    expect(r.values[r.index]).toBe(10);
  });
  it("keeps a typed value above 50", () => {
    const r = repsWheel(75);
    expect(r.values[r.index]).toBe(75);
  });
  it("unset reps show a dash", () => {
    expect(repsWheel(null)).toEqual(expect.objectContaining({ index: 0 }));
    expect(repsWheel(null).values[0]).toBeNull();
  });
});
