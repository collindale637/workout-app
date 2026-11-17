import { describe, expect, it } from "vitest";
import { setProblem } from "@/lib/set-limits";

describe("setProblem", () => {
  it("accepts normal sets, bodyweight included", () => {
    expect(setProblem(225, 5, "lb")).toBeNull();
    expect(setProblem(null, 12, "lb")).toBeNull();
    expect(setProblem(1500, 100, "lb")).toBeNull();
  });
  it("rejects weight over 1,500 lb or negative", () => {
    expect(setProblem(1501, 5, "lb")).toBe("Weight must be 0–1500 lb.");
    expect(setProblem(-5, 5, "lb")).toContain("Weight must be");
  });
  it("rejects missing, zero or huge reps", () => {
    expect(setProblem(100, null, "lb")).toBe("Reps must be 1–100.");
    expect(setProblem(100, 0, "lb")).toContain("Reps must be");
    expect(setProblem(100, 101, "lb")).toContain("Reps must be");
  });
  it("words the weight limit in the person's units", () => {
    expect(setProblem(5000, 5, "kg")).toMatch(/kg\.$/);
  });
});
