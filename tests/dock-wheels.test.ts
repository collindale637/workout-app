import { describe, expect, it } from "vitest";
import { repsWheel, secondsWheel, weightWheel, wheelNumber } from "@/lib/units";

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

describe("dock seconds wheel (timed holds)", () => {
  it("1 s steps to a minute, then 5 s steps to 5 minutes", () => {
    const w = secondsWheel(45);
    expect(w.values[0]).toBe(1);
    expect(w.values[59]).toBe(60);
    expect(w.values[60]).toBe(65);
    expect(w.values.at(-1)).toBe(300);
    expect(w.values[w.index]).toBe(45);
  });
  it("slots in a timed value off the steps", () => {
    const w = secondsWheel(97);
    expect(w.values[w.index]).toBe(97);
    expect(w.values[w.index - 1]).toBe(95);
    expect(w.values[w.index + 1]).toBe(100);
  });
  it("a hold past 5 minutes still lands", () => {
    const w = secondsWheel(420);
    expect(w.values.at(-1)).toBe(420);
    expect(w.index).toBe(w.values.length - 1);
  });
  it("an unset value shows a dash first", () => {
    expect(secondsWheel(null).values[0]).toBeNull();
    expect(secondsWheel(null).index).toBe(0);
  });
});
