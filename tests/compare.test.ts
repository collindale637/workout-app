import { describe, expect, it } from "vitest";
import { addFinishNote, compareWorkout, findPrevious, historyBefore, setsLine, volumeDeltaText, type CmpSet, type CmpWex, type CmpWorkout } from "@/lib/compare";
import { fromDisplayWeight } from "@/lib/units";

const wk = (id: string, started: string, extra: Partial<CmpWorkout> = {}): CmpWorkout => ({
  id, name: "Push", plan_day_id: "day-push", started_at: started, ended_at: started.replace("T10", "T11"), ...extra,
});
const wex = (id: string, workoutId: string, exerciseId: string, extra: Partial<CmpWex> = {}): CmpWex => ({
  id, workout_id: workoutId, exercise_id: exerciseId, sort_order: 0, target_sets: 3, skipped_sets: [], ...extra,
});
const sets = (wexId: string, list: [number | null, number][], type: CmpSet["type"] = "working"): CmpSet[] =>
  list.map(([weight, reps], i) => ({ workout_exercise_id: wexId, set_no: i + 1, type, weight, reps }));

const TODAY = wk("t", "2026-11-16T10:00:00Z");
const PREV = wk("p", "2026-11-09T10:00:00Z");

function run(o: {
  todayWexs: CmpWex[]; todaySets: CmpSet[]; prevWexs?: CmpWex[]; prevSets?: CmpSet[]; noPrev?: boolean;
  older?: { workouts: CmpWorkout[]; wexs: CmpWex[]; sets: CmpSet[] }; bw?: string[]; units?: "lb" | "kg";
}) {
  const workouts = [TODAY, ...(o.noPrev ? [] : [PREV]), ...(o.older?.workouts ?? [])];
  const allWexs = [...o.todayWexs, ...(o.prevWexs ?? []), ...(o.older?.wexs ?? [])];
  const allSets = [...o.todaySets, ...(o.prevSets ?? []), ...(o.older?.sets ?? [])];
  const previous = o.noPrev ? null : { workout: PREV, wexs: o.prevWexs ?? [], sets: o.prevSets ?? [] };
  return compareWorkout({
    workout: TODAY, wexs: o.todayWexs, sets: o.todaySets, previous,
    history: historyBefore(TODAY.started_at, workouts, allWexs, allSets, TODAY.id),
    isBodyweight: (id) => (o.bw ?? []).includes(id), isCardio: () => false, units: o.units ?? "lb", durationSec: 3600,
  });
}

describe("compare: previous workout", () => {
  it("prefers the same plan day, else the same name", () => {
    const a = wk("a", "2026-11-01T10:00:00Z", { plan_day_id: "day-push" });
    const b = wk("b", "2026-11-05T10:00:00Z", { plan_day_id: null, name: "push" });
    const c = wk("c", "2026-11-20T10:00:00Z"); // after today: never
    expect(findPrevious(TODAY, [a, b, c])?.id).toBe("a");
    expect(findPrevious({ ...TODAY, plan_day_id: null }, [a, b, c])?.id).toBe("b");
    expect(findPrevious({ ...TODAY, plan_day_id: null, name: "Legs" }, [a, b])).toBeNull();
  });
});

describe("compare: per-lift delta", () => {
  it("weight up", () => {
    const r = run({ todayWexs: [wex("t1", "t", "bench")], todaySets: sets("t1", [[135, 8], [135, 8], [135, 8]]), prevWexs: [wex("p1", "p", "bench")], prevSets: sets("p1", [[125, 8], [125, 8], [125, 8]]) });
    expect(r.rows[0]).toMatchObject({ kind: "up", delta: "▲ +10 lb" });
    expect(r.up).toBe(1);
    expect(r.records).toHaveLength(1);
  });

  it("weight down", () => {
    const r = run({ todayWexs: [wex("t1", "t", "bench")], todaySets: sets("t1", [[120, 8], [120, 8], [120, 8]]), prevWexs: [wex("p1", "p", "bench")], prevSets: sets("p1", [[125, 8], [125, 8], [125, 8]]) });
    expect(r.rows[0]).toMatchObject({ kind: "down", delta: "▼ −5 lb" });
    expect(r.down).toBe(1);
  });

  it("reps up at the same weight", () => {
    const r = run({ todayWexs: [wex("t1", "t", "bench")], todaySets: sets("t1", [[125, 10], [125, 9], [125, 8]]), prevWexs: [wex("p1", "p", "bench")], prevSets: sets("p1", [[125, 8], [125, 8], [125, 8]]) });
    expect(r.rows[0]).toMatchObject({ kind: "up", delta: "▲ +3 reps" });
  });

  it("same", () => {
    const r = run({ todayWexs: [wex("t1", "t", "bench")], todaySets: sets("t1", [[125, 8], [125, 8], [125, 8]]), prevWexs: [wex("p1", "p", "bench")], prevSets: sets("p1", [[125, 8], [125, 8], [125, 8]]) });
    expect(r.rows[0]).toMatchObject({ kind: "same", delta: "= Same" });
    expect(r.same).toBe(1);
  });

  it("a skipped set beats a reps comparison", () => {
    const r = run({
      todayWexs: [wex("t1", "t", "bench", { skipped_sets: [3] })], todaySets: sets("t1", [[125, 12], [125, 12]]),
      prevWexs: [wex("p1", "p", "bench")], prevSets: sets("p1", [[125, 8], [125, 8], [125, 8]]),
    });
    expect(r.rows[0]).toMatchObject({ kind: "skipped", delta: "Set 3 skipped" });
    const two = run({
      todayWexs: [wex("t1", "t", "bench")], todaySets: sets("t1", [[125, 12]]),
      prevWexs: [wex("p1", "p", "bench")], prevSets: sets("p1", [[125, 8], [125, 8], [125, 8]]),
    });
    expect(two.rows[0]).toMatchObject({ kind: "skipped", delta: "2 sets skipped" });
    expect(two.down).toBe(1);
  });

  it("bodyweight lifts skip the weight rules", () => {
    const r = run({
      todayWexs: [wex("t1", "t", "pushup")], todaySets: sets("t1", [[null, 20], [null, 18], [null, 15]]),
      prevWexs: [wex("p1", "p", "pushup")], prevSets: sets("p1", [[null, 18], [null, 15], [null, 15]]), bw: ["pushup"],
    });
    expect(r.rows[0]).toMatchObject({ kind: "up", delta: "▲ +5 reps", best: "BW × 20" });
    expect(r.records).toHaveLength(0);
  });

  it("a lift missing from P falls back to its own last session", () => {
    const older = { workouts: [wk("o", "2026-11-02T10:00:00Z", { plan_day_id: "other", name: "Arms" })], wexs: [wex("o1", "o", "curl")], sets: sets("o1", [[30, 10], [30, 10], [30, 10]]) };
    const r = run({
      todayWexs: [wex("t1", "t", "curl")], todaySets: sets("t1", [[35, 10], [35, 10], [35, 10]]),
      prevWexs: [wex("p1", "p", "bench")], prevSets: sets("p1", [[125, 8]]), older,
    });
    expect(r.rows[0]).toMatchObject({ kind: "up", delta: "▲ +5 lb" });
  });

  it("first time: not counted, shows the best set, no record", () => {
    const r = run({ todayWexs: [wex("t1", "t", "fly")], todaySets: [...sets("t1", [[20, 12]], "warmup"), ...sets("t1", [[40, 12], [45, 10], [45, 9]])], noPrev: true });
    expect(r.rows[0]).toMatchObject({ kind: "first", delta: "First time", best: "45 × 10" });
    expect(r.compared).toBe(0);
    expect(r.records).toHaveLength(0);
    expect(r.previous).toBeNull();
    expect(r.totals.last).toBeNull();
  });
});

describe("compare: volume and units", () => {
  it("like-for-like volume leaves out lifts not done both times", () => {
    const r = run({
      todayWexs: [wex("t1", "t", "bench"), wex("t2", "t", "fly")],
      todaySets: [...sets("t1", [[135, 8], [135, 8], [135, 8]]), ...sets("t2", [[40, 12], [40, 12], [40, 12]])],
      prevWexs: [wex("p1", "p", "bench"), wex("p2", "p", "dip")],
      prevSets: [...sets("p1", [[125, 8], [125, 8], [125, 8]]), ...sets("p2", [[null, 10], [null, 10]])],
    });
    expect(r.sameLiftsDelta).toBe(240); // (135-125) × 24 reps; fly (new) and dip (dropped) don't count
    expect(r.compared).toBe(1);
    expect(r.totals.today.sets).toBe(6);
    expect(r.totals.last).toMatchObject({ sets: 5, durationSec: 3600 });
    expect(volumeDeltaText(240, "lb")).toBe("+240 lb");
    expect(volumeDeltaText(-60, "lb")).toBe("−60 lb");
    expect(volumeDeltaText(0, "lb")).toBeNull();
  });

  it("uses kilograms for kg users", () => {
    const kg = (v: number) => fromDisplayWeight(v, "kg");
    const r = run({
      units: "kg",
      todayWexs: [wex("t1", "t", "squat")], todaySets: sets("t1", [[kg(102.5), 5], [kg(102.5), 5], [kg(102.5), 5]]),
      prevWexs: [wex("p1", "p", "squat")], prevSets: sets("p1", [[kg(100), 5], [kg(100), 5], [kg(100), 5]]),
    });
    expect(r.rows[0].delta).toBe("▲ +2.5 kg");
    expect(r.rows[0].best).toBe("102.5 × 5");
  });
});

describe("compare: helpers", () => {
  it("writes a sets line, repeating the weight only when it changes", () => {
    expect(setsLine(sets("x", [[45, 10], [45, 9], [45, 8]]), "lb")).toBe("45 × 10, 9, 8");
    expect(setsLine(sets("x", [[45, 10], [50, 8]]), "lb")).toBe("45 × 10 · 50 × 8");
    expect(setsLine(sets("x", [[null, 12], [null, 10]]), "lb")).toBe("BW × 12, 10");
  });

  it("keeps the newest 30 finish notes", () => {
    let notes = {};
    for (let i = 0; i < 35; i++) notes = addFinishNote(notes, `w${i}`, { at: `2026-11-${String(i % 28 + 1).padStart(2, "0")}T${String(10 + Math.floor(i / 28)).padStart(2, "0")}:00:00Z`, notStarted: [] });
    expect(Object.keys(notes)).toHaveLength(30);
    expect(notes).toHaveProperty("w34");
  });
});
