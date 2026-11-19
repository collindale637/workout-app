import { describe, expect, it } from "vitest";
import { advancePlan, daysForWeek, sourceWeek, weekLabel, weekProgress } from "@/lib/plan-weeks";
import { sameFieldRuns } from "@/lib/db/sync";

const day = (id: string, week: number | undefined, order: number) => ({ id, week, day_order: order });
// A 3-block plan: weeks 1, 5 and 9 have their own days; the rest reuse the latest earlier block.
const blocks = [day("a1", 1, 1), day("a2", 1, 2), day("b1", 5, 1), day("b2", 5, 2), day("c1", 9, 1), day("c2", 9, 2)];
const plan = (o: Record<string, unknown> = {}) => ({
  current_week: 1, weeks: 12, week_started_at: "2026-11-20T10:00:00.000Z", start_date: "2026-11-16", created_at: "2026-11-16T12:00:00Z",
  skipped_day_ids: [] as string[], completed_at: null, ...o,
});

describe("weeks reuse the latest earlier week that has days", () => {
  it("finds the source week", () => {
    expect(sourceWeek(blocks, 1)).toBe(1);
    expect(sourceWeek(blocks, 4)).toBe(1);
    expect(sourceWeek(blocks, 5)).toBe(5);
    expect(sourceWeek(blocks, 12)).toBe(9);
  });
  it("treats old days with no week as week 1", () => {
    const old = [day("x2", undefined, 2), day("x1", undefined, 1)];
    expect(daysForWeek(old, 7).map((d) => d.id)).toEqual(["x1", "x2"]);
  });
});

describe("week progress", () => {
  it("counts days finished since the week started, once each", () => {
    const p = weekProgress(plan(), blocks, [
      { plan_day_id: "a1", ended_at: "2026-11-19T10:00:00Z" }, // before this week: not counted
      { plan_day_id: "a1", ended_at: "2026-11-21T10:00:00Z" },
      { plan_day_id: "a1", ended_at: "2026-11-22T10:00:00Z" },
      { plan_day_id: "a2", ended_at: null }, // not finished
    ]);
    expect([...p.done]).toEqual(["a1"]);
    expect(p.nextDay?.id).toBe("a2");
    expect(p.weekComplete).toBe(false);
  });

  it("finishes the week when every day is done or skipped, and points at next week", () => {
    const p = weekProgress(plan({ current_week: 4, skipped_day_ids: ["a2"] }), blocks, [{ plan_day_id: "a1", ended_at: "2026-11-21T10:00:00Z" }]);
    expect(p.weekComplete).toBe(true);
    expect(p.nextDay?.id).toBe("b1"); // week 5 has its own days
    expect(advancePlan(plan({ current_week: 4 }), p, "2026-11-23T00:00:00Z")).toEqual({ current_week: 5, week_started_at: "2026-11-23T00:00:00Z", skipped_day_ids: [] });
  });

  it("falls back to the start date when the week has no start time yet", () => {
    const p = weekProgress(plan({ week_started_at: null }), blocks, [{ plan_day_id: "a1", ended_at: "2026-11-17T15:00:00Z" }]);
    expect(p.done.has("a1")).toBe(true);
  });

  it("marks the plan complete after its last week, once", () => {
    const p = weekProgress(plan({ current_week: 12, skipped_day_ids: ["c1", "c2"] }), blocks, []);
    expect(p.lastWeek).toBe(true);
    expect(advancePlan(plan({ current_week: 12 }), p, "2026-12-01T00:00:00Z")).toEqual({ completed_at: "2026-12-01T00:00:00Z" });
    expect(advancePlan(plan({ current_week: 12, completed_at: "2026-12-01T00:00:00Z" }), p, "2026-12-02T00:00:00Z")).toBeNull();
  });

  it("keeps going with no length", () => {
    const p = weekProgress(plan({ weeks: null, current_week: 30, skipped_day_ids: ["c1", "c2"] }), blocks, []);
    expect(p.length).toBeNull();
    expect(advancePlan(plan({ weeks: null, current_week: 30 }), p, "now")?.current_week).toBe(31);
  });

  it("does nothing when the plan already moved on (another phone)", () => {
    const p = weekProgress(plan({ current_week: 2, skipped_day_ids: ["a1", "a2"] }), blocks, []);
    expect(advancePlan(plan({ current_week: 3 }), p, "now")).toBeNull();
  });

  it("labels the week", () => {
    expect(weekLabel(3, 8)).toBe("Week 3 of 8");
    expect(weekLabel(9, 8)).toBe("Week 8 of 8");
    expect(weekLabel(3, null)).toBe("Week 3");
  });
});

describe("sync upserts rows in runs with the same fields", () => {
  it("splits where the fields change and keeps the order", () => {
    const runs = sameFieldRuns([{ id: 1, a: 1 }, { id: 2, a: 2 }, { id: 3, a: 3, b: 1 }, { id: 4, a: 4 }]);
    expect(runs.map((r) => r.map((x) => x.id))).toEqual([[1, 2], [3], [4]]);
  });
});
