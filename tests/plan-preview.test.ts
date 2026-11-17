import { describe, expect, it } from "vitest";
import { applySwaps, headline, headlineText } from "@/lib/plan-preview";

const items = ["a", "b", "run", "c", "d"].map((exercise_id) => ({ exercise_id }));
const opts = { isCardio: (id: string) => id === "run", nameOf: (id: string) => id.toUpperCase() };

describe("plan preview", () => {
  it("shows the first lifts, skipping cardio, with a more count", () => {
    const h = headline(items, opts);
    expect(h.names).toEqual(["A", "B", "C"]);
    expect(headlineText(h)).toBe("A · B · C +2 more");
  });
  it("has no more suffix when everything fits", () => {
    expect(headlineText(headline(items.slice(0, 2), opts))).toBe("A · B");
  });
  it("applies swaps by day and position", () => {
    const days = [{ items }, { items: items.slice(0, 2) }];
    const out = applySwaps(days, { "0:1": "z", "1:0": "y" });
    expect(out[0].items[1].exercise_id).toBe("z");
    expect(out[1].items[0].exercise_id).toBe("y");
    expect(days[0].items[1].exercise_id).toBe("b");
    expect(applySwaps(days, {})).toBe(days);
  });
});
