import { describe, expect, it } from "vitest";
import { heightProblem, weightProblem } from "@/components/body-fields";

describe("weightProblem / heightProblem", () => {
  it("accepts in-range values", () => {
    expect(weightProblem(180, "lb")).toBeNull();
    expect(heightProblem(70, "lb")).toBeNull();
  });
  it("asks for a missing value and shows the range", () => {
    expect(weightProblem(null, "lb")).toBe("Enter your weight (60–800 lb).");
    expect(heightProblem(null, "kg")).toContain("cm");
  });
  it("explains an out-of-range value", () => {
    expect(weightProblem(2000, "lb")).toBe("Weight must be between 60 and 800 lb.");
    expect(weightProblem(10, "kg")).toContain("kg");
    expect(heightProblem(20, "lb")).toContain("Height must be between");
  });
});
