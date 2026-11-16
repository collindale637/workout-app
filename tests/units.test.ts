import { describe, expect, it } from "vitest";
import { estimate1RM, formatDuration, formatWeight, fromDisplayWeight, toDisplayDistance, toDisplayWeight, volumeLb } from "@/lib/units";

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
  it("converts distance", () => expect(toDisplayDistance(3.10686, "kg")).toBe(5));
  it("counts volume without warm-ups", () => {
    expect(volumeLb([{ weight: 100, reps: 10, type: "working" }, { weight: 45, reps: 10, type: "warmup" }, { weight: 80, reps: 8, type: "drop" }])).toBe(1640);
  });
  it("estimates 1RM", () => {
    expect(estimate1RM(200, 1)).toBe(200);
    expect(Math.round(estimate1RM(185, 8))).toBe(234);
  });
});
