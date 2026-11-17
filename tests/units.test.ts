import { describe, expect, it } from "vitest";
import { estimate1RM, formatDuration, hasBodyweightSets, isPerHand, formatWeight, fromDisplayWeight, toDisplayDistance, toDisplayWeight, volumeBy, volumeLb } from "@/lib/units";

describe("units", () => {
  it("round-trips kilograms through pounds", () => {
    for (const kg of [2.5, 20, 22.5, 60, 100, 142.5]) expect(toDisplayWeight(fromDisplayWeight(kg, "kg"), "kg")).toBe(kg);
  });
  it("formats weights", () => {
    expect(formatWeight(185, "lb")).toBe("185");
    expect(formatWeight(null, "lb")).toBe("BW");
    expect(formatWeight(fromDisplayWeight(92.5, "kg"), "kg")).toBe("92.5");
  });
  it("formats durations", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
  it("knows per-hand (dumbbell) lifts", () => {
    expect(isPerHand({ name: "Dumbbell Bench Press" })).toBe(true);
    expect(isPerHand({ name: "Incline DUMBBELL Curl" })).toBe(true);
    expect(isPerHand({ name: "Barbell Bench Press" })).toBe(false);
    expect(isPerHand({ name: "Push-Up" })).toBe(false);
    expect(isPerHand(undefined)).toBe(false);
  });
  it("converts distance", () => expect(toDisplayDistance(3.10686, "kg")).toBe(5));
  it("counts volume without warm-ups", () => {
    expect(volumeLb([{ weight: 100, reps: 10, type: "working" }, { weight: 45, reps: 10, type: "warmup" }, { weight: 80, reps: 8, type: "drop" }])).toBe(1640);
  });
  it("estimates 1RM", () => {
    expect(estimate1RM(200, 1)).toBe(200);
    expect(Math.round(estimate1RM(185, 8))).toBe(234);
  });
});

describe("batch 12: per-hand volume", () => {
  const wexs = [{ id: "d", exercise_id: "db_press" }, { id: "b", exercise_id: "bench" }];
  const set = (wex: string, weight: number | null, reps: number, type = "working") => ({ workout_exercise_id: wex, weight, reps, type });
  it("counts both dumbbells, one barbell, and skips warm-ups", () => {
    const sets = [set("d", 50, 10), set("d", 50, 8, "warmup"), set("b", 100, 10)];
    expect(volumeBy(sets, wexs, (id) => id === "db_press")).toBe(50 * 10 * 2 + 100 * 10);
  });
  it("one-dumbbell lifts aren't per-hand", () => {
    for (const n of ["One-Arm Dumbbell Row", "Goblet Squat With Dumbbell", "Dumbbell Pullover", "Concentration Curls With Dumbbell"]) expect(isPerHand({ name: n }), n).toBe(false);
    expect(isPerHand({ name: "Dumbbell Bench Press" })).toBe(true);
  });
  it("notes bodyweight sets", () => {
    expect(hasBodyweightSets([set("b", null, 10)])).toBe(true);
    expect(hasBodyweightSets([set("b", 100, 10), set("b", null, 10, "warmup")])).toBe(false);
  });
});
