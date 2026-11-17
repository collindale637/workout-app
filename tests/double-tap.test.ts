import { describe, expect, it } from "vitest";
import { isDoubleTap } from "@/lib/double-tap";

describe("isDoubleTap", () => {
  it("lets the first tap through and ignores a second one within 700 ms", () => {
    const last = { current: 0 };
    expect(isDoubleTap(last, 700, 10_000)).toBe(false);
    expect(isDoubleTap(last, 700, 10_300)).toBe(true);
    expect(isDoubleTap(last, 700, 10_699)).toBe(true);
  });

  it("counts from the last accepted tap, so steady logging still works", () => {
    const last = { current: 0 };
    expect(isDoubleTap(last, 700, 10_000)).toBe(false);
    expect(isDoubleTap(last, 700, 10_500)).toBe(true); // ignored, doesn't reset the clock
    expect(isDoubleTap(last, 700, 10_700)).toBe(false);
  });
});
