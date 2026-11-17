import { describe, expect, it } from "vitest";
import { formatTick } from "@/lib/units";
import { GYM_NAME_MAX, TEMPLATE_SHORT_NAME } from "@/lib/defaults";

describe("formatTick", () => {
  it("uses whole numbers for whole ticks and one decimal for half steps", () => {
    expect(formatTick(180)).toBe("180");
    expect(formatTick(180.5)).toBe("180.5");
    expect(formatTick(181.04)).toBe("181");
  });
});

describe("gym names", () => {
  it("default names are short and fit the 24-character cap", () => {
    for (const name of Object.values(TEMPLATE_SHORT_NAME)) {
      expect(name.length).toBeLessThanOrEqual(GYM_NAME_MAX);
    }
    expect(TEMPLATE_SHORT_NAME.home).toBe("Home");
    expect(TEMPLATE_SHORT_NAME.hotel).toBe("Hotel");
  });
});
