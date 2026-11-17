import { describe, expect, it } from "vitest";
import { fitToGym, suggestNext } from "@/lib/progression";

const w = (weight: number, reps: number) => ({ weight, reps, type: "working" as const });

describe("fitToGym", () => {
  const db = { increment: 5, min: 10, max: 50 };
  it("caps a too-heavy suggestion at the gym's heaviest and raises reps to make up for it", () => {
    const s = fitToGym({ weight: 70, reps: 10, change: "same", from: 70 }, db);
    expect(s.weight).toBe(50);
    expect(s.reps).toBe(14);
  });
  it("never suggests more than 30 reps", () => {
    expect(fitToGym({ weight: 200, reps: 12, change: "same", from: 200 }, db).reps).toBe(30);
  });
  it("lifts a too-light suggestion up to the gym's lightest", () => {
    expect(fitToGym({ weight: 5, reps: 10, change: "same", from: 5 }, db).weight).toBe(10);
  });
  it("leaves bodyweight, in-range and ladder suggestions alone", () => {
    expect(fitToGym({ weight: null, reps: 10, change: "same", from: null }, db).weight).toBeNull();
    expect(fitToGym({ weight: 30, reps: 10, change: "up", from: 25 }, db)).toEqual({ weight: 30, reps: 10, change: "up", from: 25 });
    const ladder = { increment: 5, ladder: [10, 20], max: 20 };
    expect(fitToGym({ weight: 40, reps: 10, change: "same", from: 40 }, ladder).weight).toBe(40);
  });
});

describe("suggestNext at a gym with lighter dumbbells", () => {
  it("history from a heavier gym suggests the new gym's heaviest dumbbell with more reps", () => {
    const s = suggestNext([w(80, 10), w(80, 10), w(80, 10)], 8, 12, { increment: 5, min: 10, max: 50 });
    expect(s.weight).toBe(50);
    expect(s.reps!).toBeGreaterThan(12);
  });
});
