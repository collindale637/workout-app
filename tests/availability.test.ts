import { describe, expect, it } from "vitest";
import { describeNeeds, isAvailable } from "@/lib/availability";

const bench = [
  { exercise_id: "bp", option_group: 1, equipment_id: "barbell" },
  { exercise_id: "bp", option_group: 2, equipment_id: "flat_bench" },
  { exercise_id: "bp", option_group: 2, equipment_id: "adjustable_bench" },
  { exercise_id: "bp", option_group: 3, equipment_id: "power_rack" },
  { exercise_id: "bp", option_group: 3, equipment_id: "squat_stand" },
];

describe("equipment matching", () => {
  it("needs one item from every group", () => {
    expect(isAvailable(bench, new Set(["barbell", "adjustable_bench", "squat_stand"]))).toBe(true);
    expect(isAvailable(bench, new Set(["barbell", "adjustable_bench"]))).toBe(false);
    expect(isAvailable(bench, new Set(["dumbbells", "flat_bench", "power_rack"]))).toBe(false);
  });
  it("treats no needs as bodyweight", () => expect(isAvailable([], new Set())).toBe(true));
  it("describes needs", () => {
    const names = new Map([["barbell", "Barbell"], ["flat_bench", "Flat bench"], ["adjustable_bench", "Adjustable bench"], ["power_rack", "Rack"], ["squat_stand", "Stands"]]);
    expect(describeNeeds(bench, names)).toBe("Barbell + Flat bench or Adjustable bench + Rack or Stands");
  });
});
