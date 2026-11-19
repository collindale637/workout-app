import { describe, expect, it } from "vitest";
import { dayOptions, resolveFilter, splitRows } from "@/lib/split-filter";

const splits = [
  { id: "a", days_per_week: 2 },
  { id: "b", days_per_week: 3 },
  { id: "c", days_per_week: 3 },
  { id: "d", days_per_week: 5 },
];

describe("split filter", () => {
  it("lists the day counts that have splits", () => {
    expect(dayOptions(splits)).toEqual([2, 3, 5]);
  });

  it("uses a saved choice, then the usual days, then the closest count", () => {
    const opts = [2, 3, 5];
    expect(resolveFilter("all", 4, opts)).toBe("all");
    expect(resolveFilter(2, 5, opts)).toBe(2);
    expect(resolveFilter(6, 5, opts)).toBe(5); // saved count no longer exists: fall back to usual
    expect(resolveFilter(undefined, 3, opts)).toBe(3);
    expect(resolveFilter(undefined, 4, opts)).toBe(3); // tie between 3 and 5: the lower one
    expect(resolveFilter(undefined, 7, opts)).toBe(5);
    expect(resolveFilter(undefined, 4, [])).toBe("all");
  });

  it("shows exact matches only", () => {
    expect(splitRows(splits, 3).map((r) => (r.kind === "split" ? r.split.id : "?"))).toEqual(["b", "c"]);
    expect(splitRows(splits, 4)).toEqual([]);
  });

  it("groups all splits under a header per day count", () => {
    const rows = splitRows(splits, "all");
    expect(rows.map((r) => (r.kind === "header" ? `h${r.days}` : r.split.id))).toEqual(["h2", "a", "h3", "b", "c", "h5", "d"]);
  });
});
