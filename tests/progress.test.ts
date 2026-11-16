import { describe, expect, it } from "vitest";
import {
  activityCalendar, cardioByType, cardioWeeks, daysPerWeek, liftRecords, liftSessions, prEvents, topLifts,
  weekStart, weekStreak, weeklySets, weeklyTarget, weightTrend, type LiftSet,
} from "@/lib/progress";

const set = (workoutId: string, at: string, weight: number | null, reps: number, type: LiftSet["type"] = "working", exerciseId = "bench"): LiftSet =>
  ({ workoutId, exerciseId, at, type, weight, reps });

describe("lift sessions and estimated max", () => {
  it("groups sets by workout and uses working sets of 12 reps or fewer for the estimated max", () => {
    const s = liftSessions([
      set("w1", "2026-11-02T10:00:00Z", 95, 10, "warmup"),
      set("w1", "2026-11-02T10:00:00Z", 185, 5),
      set("w1", "2026-11-02T10:00:00Z", 185, 4),
      set("w1", "2026-11-02T10:00:00Z", 135, 20, "drop"),
    ]).get("bench")!;
    expect(s).toHaveLength(1);
    expect(s[0].e1rm).toBeCloseTo(185 * (1 + 5 / 30)); // 215.8, the drop set's 20 reps don't inflate it
    expect(s[0]).toMatchObject({ topWeight: 185, topReps: 5, workingSets: 2, bestReps: 20 });
    expect(s[0].volume).toBe(185 * 9 + 135 * 20);
  });

  it("falls back to high-rep sets when that's all there is, and handles bodyweight moves", () => {
    const hi = liftSessions([set("w1", "2026-11-02T10:00:00Z", 50, 15)]).get("bench")![0];
    expect(hi.e1rm).toBeCloseTo(75);
    const bw = liftSessions([set("w1", "2026-11-02T10:00:00Z", null, 12, "working", "pullup")]).get("pullup")![0];
    expect(bw).toMatchObject({ e1rm: 0, topWeight: 0, bestReps: 12 });
  });

  it("finds PRs session by session, newest first, never on the first session", () => {
    const sessions = liftSessions([
      set("w1", "2026-11-02T10:00:00Z", 185, 5),
      set("w2", "2026-11-05T10:00:00Z", 185, 6), // e1RM PR (more reps)
      set("w3", "2026-11-09T10:00:00Z", 190, 3), // heavier, but a lower e1RM → weight PR
      set("w4", "2026-11-12T10:00:00Z", 180, 5), // nothing
      set("w1", "2026-11-02T10:00:00Z", null, 8, "working", "pullup"),
      set("w3", "2026-11-09T10:00:00Z", null, 10, "working", "pullup"), // rep PR
    ]);
    const prs = prEvents(sessions);
    expect(prs.map((p) => [p.workoutId, p.exerciseId, p.kind])).toEqual([
      ["w3", "bench", "weight"], ["w3", "pullup", "reps"], ["w2", "bench", "e1rm"],
    ].sort((a, b) => (a[0] === b[0] ? 0 : a[0] > b[0] ? -1 : 1)));
    expect(prs.find((p) => p.kind === "weight")).toMatchObject({ value: 190, previous: 185, reps: 3 });
    const rec = liftRecords(sessions.get("bench")!);
    expect(rec.weight).toMatchObject({ value: 190, reps: 3 });
    expect(rec.e1rm!.value).toBeCloseTo(185 * 1.2);
  });

  it("lists the most-trained lifts with a trend and change", () => {
    const now = new Date("2026-12-01T12:00:00Z").getTime();
    const sets: LiftSet[] = [];
    for (let i = 0; i < 6; i++) sets.push(set(`b${i}`, new Date(now - (40 - i * 7) * 86_400_000).toISOString(), 185 + i * 5, 5));
    sets.push(set("s1", new Date(now - 3 * 86_400_000).toISOString(), 225, 5, "working", "squat"));
    sets.push(set("s2", new Date(now - 1 * 86_400_000).toISOString(), 235, 5, "working", "squat"));
    const top = topLifts(liftSessions(sets), now);
    expect(top[0].exerciseId).toBe("bench");
    expect(top[0].trend).toHaveLength(6);
    expect(top[0].change).toBeGreaterThan(0);
    expect(top[1]).toMatchObject({ exerciseId: "squat", sessions: 2 });
  });
});

describe("weeks", () => {
  it("weeks run Sunday to Saturday, like Today's week strip", () => {
    const d = weekStart(new Date(2026, 10, 18, 15)); // Wed Nov 18 2026
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getDay(), d.getHours()]).toEqual([2026, 10, 15, 0, 0]);
    expect(weekStart(new Date(2026, 10, 21, 23)).getDate()).toBe(15); // Saturday belongs to the same week
    expect(weekStart(new Date(2026, 10, 22, 1)).getDate()).toBe(22); // Sunday starts the next
  });

  it("counts hard sets per muscle: primary 1, secondary 0.5, warm-ups skipped, only this week", () => {
    const start = weekStart(new Date(2026, 10, 18));
    const chestPress = [{ muscle_id: "chest", role: "primary" as const }, { muscle_id: "triceps", role: "secondary" as const }];
    const map = weeklySets([
      { at: new Date(2026, 10, 16, 9).toISOString(), type: "working", muscles: chestPress },
      { at: new Date(2026, 10, 16, 9).toISOString(), type: "working", muscles: chestPress },
      { at: new Date(2026, 10, 16, 9).toISOString(), type: "warmup", muscles: chestPress },
      { at: new Date(2026, 10, 14, 9).toISOString(), type: "working", muscles: chestPress }, // last week
    ], start);
    expect(map.get("chest")).toBe(2);
    expect(map.get("triceps")).toBe(1);
    expect(weeklyTarget("hypertrophy", "large")).toEqual([10, 20]);
    expect(weeklyTarget("hypertrophy", "small")[0]).toBeLessThan(10);
  });

  it("totals cardio by week and by type", () => {
    const now = new Date(2026, 10, 18, 12).getTime();
    const cardio = [
      { at: new Date(2026, 10, 17, 7).toISOString(), type: "run" as const, durationSec: 1800, distance: 3 },
      { at: new Date(2026, 10, 18, 7).toISOString(), type: "bike" as const, durationSec: 2400, distance: null },
      { at: new Date(2026, 10, 10, 7).toISOString(), type: "run" as const, durationSec: 1200, distance: 2 },
      { at: new Date(2026, 6, 1).toISOString(), type: "run" as const, durationSec: 999, distance: 9 }, // outside the window
    ];
    const weeks = cardioWeeks(cardio, now, 4);
    expect(weeks).toHaveLength(4);
    expect(weeks[3]).toMatchObject({ minutes: 70, distance: 3, sessions: 2 });
    expect(weeks[2]).toMatchObject({ minutes: 20, distance: 2, sessions: 1 });
    expect(weeks[0].sessions + weeks[1].sessions).toBe(0);
    const types = cardioByType(cardio, new Date(2026, 10, 1).getTime());
    expect(types.map((t) => t.type)).toEqual(["run", "bike"]);
    expect(types[0]).toMatchObject({ minutes: 50, distance: 5, sessions: 2 });
  });
});

describe("consistency", () => {
  it("builds Sunday–Saturday weeks ending this week and marks lift, cardio and both", () => {
    const now = new Date(2026, 10, 18, 12).getTime(); // Wednesday
    const cal = activityCalendar(["2026-11-16", "2026-11-17"], ["2026-11-17", "2026-11-12"], now, 2);
    expect(cal).toHaveLength(2);
    expect(cal[1][0]).toMatchObject({ key: "2026-11-15", kind: null });
    expect(cal[1][1]).toMatchObject({ key: "2026-11-16", kind: "lift", future: false });
    expect(cal[1][2].kind).toBe("both");
    expect(cal[1][4]).toMatchObject({ key: "2026-11-19", future: true });
    expect(cal[0][4].kind).toBe("cardio");
    expect(daysPerWeek(cal)).toEqual([1, 2]);
  });

  it("an unfinished week doesn't break the streak; a met one adds to it", () => {
    expect(weekStreak([4, 4, 2, 4, 4, 1], 4)).toBe(2);
    expect(weekStreak([4, 4, 2, 4, 4, 4], 4)).toBe(3);
    expect(weekStreak([4, 1, 0], 4)).toBe(0);
    expect(weekStreak([], 4)).toBe(0);
  });
});

describe("bodyweight", () => {
  it("smooths with a 7-day average and reports the 30-day change", () => {
    const entries = [];
    for (let i = 0; i < 40; i++) {
      const d = new Date(2026, 9, 1 + i);
      entries.push({ date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, bodyweight: 200 - i * 0.2 + (i % 2 ? 0.6 : -0.6) });
    }
    const t = weightTrend(entries);
    expect(t.points).toHaveLength(40);
    expect(t.latest!.date).toBe("2026-11-09");
    expect(Math.abs(t.points[20].avg - (200 - 20 * 0.2 + 0.6 * 0))).toBeLessThan(0.8);
    expect(t.change30!).toBeCloseTo(-6, 0);
    expect(weightTrend([]).latest).toBeNull();
    expect(weightTrend([{ date: "2026-11-01", bodyweight: 180 }]).change30).toBeNull();
  });
});
