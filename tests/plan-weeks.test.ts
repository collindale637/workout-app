import { describe, expect, it } from "vitest";
import { advancePlan, daysForWeek, planCopy, planFinishedAndDismissed, planRunStats, showPlanComplete, sourceWeek, weekLabel, weekProgress } from "@/lib/plan-weeks";
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

  it("carries on from the day you last finished, then wraps back to days you skipped past", () => {
    const five = [1, 2, 3, 4, 5].map((n) => day(`d${n}`, 1, n));
    const fin = (id: string, t: string) => ({ plan_day_id: id, ended_at: `2026-11-2${t}T10:00:00Z` });
    // Started on day 2: after days 2, 3, 4 the next one is day 5, not day 1.
    expect(weekProgress(plan(), five, [fin("d2", "1"), fin("d3", "2"), fin("d4", "3")]).nextDay?.id).toBe("d5");
    // After day 5 it wraps to day 1, the only one left.
    const p = weekProgress(plan(), five, [fin("d2", "1"), fin("d3", "2"), fin("d4", "3"), fin("d5", "4")]);
    expect(p.nextDay?.id).toBe("d1");
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

describe("Plan complete (Batch 20c)", () => {
  const rows = [
    { id: "r1", plan_day_id: "a1", sort_order: 0 }, { id: "r2", plan_day_id: "a1", sort_order: 1 }, { id: "r3", plan_day_id: "a2", sort_order: 0 },
    { id: "r4", plan_day_id: "b1", sort_order: 0 },
  ];

  it("shows once the plan is complete, until it's skipped, then Today goes back to fresh muscles", () => {
    expect(showPlanComplete({ completed_at: null, completion_dismissed_at: null })).toBe(false);
    expect(showPlanComplete({ completed_at: "x", completion_dismissed_at: null })).toBe(true);
    expect(showPlanComplete({ completed_at: "x", completion_dismissed_at: "y" })).toBe(false);
    expect(planFinishedAndDismissed({ completed_at: "x", completion_dismissed_at: "y" })).toBe(true);
    expect(planFinishedAndDismissed({ completed_at: "x", completion_dismissed_at: null })).toBe(false);
  });

  it("counts workouts from this run and the planned days left undone; a restart's new start date drops the old run", () => {
    const p = { weeks: 12, start_date: "2026-11-16", created_at: "2026-11-16T12:00:00Z" };
    const done = [
      { id: "w1", plan_day_id: "a1", ended_at: "2026-11-17T10:00:00Z" }, { id: "w2", plan_day_id: "b2", ended_at: "2026-11-25T10:00:00Z" },
      { id: "w3", plan_day_id: "zzz", ended_at: "2026-11-25T10:00:00Z" }, { id: "w4", plan_day_id: "a2", ended_at: null },
    ];
    // 12 weeks × 2 days = 24 planned; 2 workouts belong to this plan.
    expect(planRunStats(p, blocks, done)).toMatchObject({ workouts: 2, skipped: 22 });
    expect(planRunStats(p, blocks, done).workoutIds).toEqual(new Set(["w1", "w2"]));
    expect(planRunStats({ ...p, start_date: "2026-11-20" }, blocks, done).workouts).toBe(1);
    expect(planRunStats({ ...p, weeks: 2 }, blocks, done).skipped).toBe(2);
  });

  it("copies a week's days and exercises with new ids, replacing the target's own", () => {
    let n = 0;
    const id = () => `n${++n}`;
    // Week 3 repeats week 1; copying it into week 5 replaces week 5's own days (b1, b2).
    const c = planCopy(blocks, rows, 3, 5, id)!;
    expect(c.removeDays.map((d) => d.id)).toEqual(["b1", "b2"]);
    expect(c.removeRows.map((r) => r.id)).toEqual(["r4"]);
    expect(c.addDays.map((d) => [d.week, d.day_order])).toEqual([[5, 1], [5, 2]]);
    expect(c.addRows).toHaveLength(3);
    expect(c.addRows.map((r) => r.plan_day_id)).toEqual([c.addDays[0].id, c.addDays[0].id, c.addDays[1].id]);
    expect(new Set([...c.addDays.map((d) => d.id), ...c.addRows.map((r) => r.id)]).size).toBe(5);
  });

  it("Make it different copies the week a week repeats; copying onto itself or from nothing does nothing", () => {
    const c = planCopy(blocks, rows, 5, 5, () => "x");
    expect(c).toBeNull();
    const m = planCopy([day("a1", 1, 1)], rows, 4, 4, (() => { let i = 0; return () => `m${++i}`; })())!;
    expect(m.removeDays).toEqual([]);
    expect(m.addDays.map((d) => d.week)).toEqual([4]);
    expect(planCopy([], rows, 2, 3, () => "x")).toBeNull();
  });
});
