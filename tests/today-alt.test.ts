import { describe, expect, it } from "vitest";
import { lighterItems, lighterMinutes, pickAlternative } from "@/lib/today-alt";

const days = [{ id: "push" }, { id: "pull" }, { id: "legs" }, { id: "arms" }];
const readyOnly = (...ids: string[]) => (d: { id: string }) => ({ ready: ids.includes(d.id) });

describe("pickAlternative", () => {
  it("picks the first ready day after the planned one", () => {
    expect(pickAlternative(days, "pull", readyOnly("push", "arms"))).toEqual({ kind: "day", day: { id: "arms" } });
    expect(pickAlternative(days, "push", readyOnly("legs", "arms"))).toEqual({ kind: "day", day: { id: "legs" } });
  });

  it("wraps around the end of the plan", () => {
    expect(pickAlternative(days, "legs", readyOnly("push", "pull"))).toEqual({ kind: "day", day: { id: "push" } });
  });

  it("never offers the planned day itself", () => {
    expect(pickAlternative(days, "legs", readyOnly("legs"))).toEqual({ kind: "light" });
  });

  it("goes lighter when nothing is ready", () => {
    expect(pickAlternative(days, "push", readyOnly())).toEqual({ kind: "light" });
  });

  it("a single-day plan goes lighter", () => {
    expect(pickAlternative([{ id: "full" }], "full", readyOnly("full"))).toEqual({ kind: "light" });
  });
});

describe("lighter day", () => {
  const items = [
    { exercise_id: "bench", sets: 4 },
    { exercise_id: "fly", sets: 3 },
    { exercise_id: "curl", sets: 1 },
    { exercise_id: "bike", sets: 1 },
  ];
  it("caps lifts at 2 sets and leaves cardio alone", () => {
    expect(lighterItems(items, (id) => id === "bike").map((i) => i.sets)).toEqual([2, 2, 1, 1]);
  });
  it("scales the time by the sets kept, rounded to 5", () => {
    const light = lighterItems(items, (id) => id === "bike");
    expect(lighterMinutes(60, items, light)).toBe(40); // 9 planned sets, 6 kept: 60 × 6/9
    expect(lighterMinutes(45, items, light)).toBe(30);
  });
});
