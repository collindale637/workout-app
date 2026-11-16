import { describe, expect, it } from "vitest";
import { adjustmentFor, computeRecovery, pickFreshTargets, setFatigue, stateFor, type FatigueAdjustments, type FatigueSet, type MuscleRecovery } from "@/lib/recovery";
import { muscles } from "./fixtures/catalog";

const NOW = new Date("2026-11-16T18:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const bench = (id: string, h: number, rpe: number | null = 8, type: FatigueSet["type"] = "working"): FatigueSet => ({
  id, exerciseId: "bench", at: hoursAgo(h), type, rpe,
  muscles: [{ muscle_id: "chest", role: "primary" }, { muscle_id: "triceps", role: "secondary" }, { muscle_id: "front_delts", role: "secondary" }],
});

describe("recovery", () => {
  it("weights sets by role and effort; blank RPE uses the default; warm-ups count 0.3", () => {
    expect(setFatigue("primary", "working", 10, 8)).toBe(1);
    expect(setFatigue("secondary", "working", 10, 8)).toBe(0.5);
    expect(setFatigue("primary", "working", null, 8)).toBe(0.8);
    expect(setFatigue("primary", "warmup", 9, 8)).toBe(0.3);
  });

  it("4 hard chest sets: recovering right after, fresh within two days", () => {
    const sets = [1, 2, 3, 4].map((i) => bench(`s${i}`, 0, 9));
    const at = (h: number) => computeRecovery({ muscles, sets: sets.map((s) => ({ ...s, at: hoursAgo(h) })), cardio: [], now: NOW, defaultRpe: 8 }).get("chest")!;
    expect(at(0).score).toBe(70); // 4 × 0.9 = 3.6 of 12
    expect(at(0).state).toBe("recovering");
    expect(at(24).score).toBeGreaterThan(80);
    expect(at(48).state).toBe("fresh");
    expect(at(0).primarySets).toBe(4);
  });

  it("a big session leaves the muscle fatigued", () => {
    const sets = Array.from({ length: 10 }, (_, i) => bench(`s${i}`, 2, 9));
    const r = computeRecovery({ muscles, sets, cardio: [], now: NOW, defaultRpe: 8 });
    expect(r.get("chest")!.state).toBe("fatigued");
    expect(r.get("triceps")!.score).toBeGreaterThan(r.get("chest")!.score);
    expect(r.get("quads")!.score).toBe(100);
  });

  it("small muscles recover faster than large ones", () => {
    const sets: FatigueSet[] = Array.from({ length: 6 }, (_, i) => ({
      id: `x${i}`, exerciseId: "x", at: hoursAgo(36), type: "working", rpe: 9,
      muscles: [{ muscle_id: "biceps", role: "primary" }, { muscle_id: "quads", role: "primary" }],
    }));
    const r = computeRecovery({ muscles, sets, cardio: [], now: NOW, defaultRpe: 8 });
    expect(r.get("biceps")!.score).toBeGreaterThan(r.get("quads")!.score);
  });

  it("ignores sets older than 7 days", () => {
    const r = computeRecovery({ muscles, sets: [bench("old", 24 * 8, 10)], cardio: [], now: NOW, defaultRpe: 8 });
    expect(r.get("chest")!.score).toBe(100);
    expect(r.get("chest")!.lastTrained).toBeNull();
  });

  it("cardio adds light leg fatigue", () => {
    const r = computeRecovery({ muscles, sets: [], cardio: [{ id: "c", at: hoursAgo(1), type: "run", durationSec: 3600, rpe: 7 }], now: NOW, defaultRpe: 8 });
    expect(r.get("quads")!.score).toBeLessThan(100);
    expect(r.get("quads")!.score).toBeGreaterThan(80);
    expect(r.get("chest")!.score).toBe(100);
  });

  it("states", () => {
    expect(stateFor(85)).toBe("fresh");
    expect(stateFor(84)).toBe("recovering");
    expect(stateFor(59)).toBe("fatigued");
  });
});

describe("target fresh muscles", () => {
  const rec = (scores: Record<string, number>) =>
    new Map<string, MuscleRecovery>(
      muscles.map((m) => {
        const score = scores[m.id] ?? 100;
        return [m.id, { muscleId: m.id, score, state: stateFor(score), fatigue: 0, autoScore: score, autoFatigue: 0, adjusted: false, lastTrained: null, primarySets: 0, secondarySets: 0 }];
      }),
    );

  it("everything fresh: a full-body day", () => {
    expect(pickFreshTargets(rec({}), muscles).template.id).toBe("full");
  });

  it("legs trained yesterday: an upper-body day", () => {
    const r = pickFreshTargets(rec({ quads: 40, hamstrings: 45, glutes: 50, calves: 70, adductors: 60, abductors: 60 }), muscles);
    expect(["upper", "push", "pull", "chest_back"]).toContain(r.template.id);
    expect(r.targets).not.toContain("quads");
  });

  it("chest and back fatigued: never a lone biceps day", () => {
    const r = pickFreshTargets(rec({ chest: 30, lats: 30, upper_back: 30, front_delts: 50, rear_delts: 55 }), muscles);
    expect(r.targets.length).toBeGreaterThanOrEqual(3);
    expect(r.targets).not.toContain("chest");
  });
});

describe("recovery timing (Batch 5 calibration)", () => {
  const session = (muscle: string, n: number, h: number): FatigueSet[] =>
    Array.from({ length: n }, (_, i) => ({ id: `${muscle}${i}`, exerciseId: "x", at: hoursAgo(h), type: "working", rpe: 9, muscles: [{ muscle_id: muscle, role: "primary" }] }));
  const score = (muscle: string, n: number, h: number) => computeRecovery({ muscles, sets: session(muscle, n, h), cardio: [], now: NOW, defaultRpe: 8 }).get(muscle)!;

  it("a hard leg session (10 sets near failure) is fatigued for a day and fresh after about 3 days", () => {
    expect(score("quads", 10, 0).state).toBe("fatigued");
    expect(score("quads", 10, 24).state).toBe("fatigued");
    expect(score("quads", 10, 48).state).toBe("recovering");
    expect(score("quads", 10, 72).state).toBe("fresh");
  });

  it("chest is fresh by about 2.5 days, arms by 2", () => {
    expect(score("chest", 10, 48).state).toBe("recovering");
    expect(score("chest", 10, 60).state).toBe("fresh");
    expect(score("biceps", 9, 48).state).toBe("fresh");
  });
});

describe("manual fatigue adjustment", () => {
  const sets = [1, 2, 3, 4].map((i) => bench(`s${i}`, 2, 9)); // chest: 4 hard sets two hours ago
  const run = (adjustments: FatigueAdjustments | undefined, now = NOW, extra: FatigueSet[] = []) =>
    computeRecovery({ muscles, sets: [...sets, ...extra], cardio: [], now, defaultRpe: 8, adjustments }).get("chest")!;
  const tauChest = muscles.find((m) => m.id === "chest")!.recovery_tau_hours;

  it("with no adjustment the automatic score is the score", () => {
    const r = run(undefined);
    expect(r.adjusted).toBe(false);
    expect(r.score).toBe(r.autoScore);
  });

  it("setting a muscle to a score makes it read exactly that, now", () => {
    const auto = run(undefined);
    for (const want of [0, 15, 45, 75, 100]) {
      const r = run({ chest: adjustmentFor(want, auto.autoFatigue, NOW) });
      expect(r.score, `want ${want}`).toBe(want);
      expect(r.adjusted).toBe(true);
      expect(r.autoScore).toBe(auto.autoScore);
    }
  });

  it("the adjustment fades back toward the automatic number like normal recovery", () => {
    const auto = run(undefined);
    const adj = { chest: adjustmentFor(20, auto.autoFatigue, NOW) };
    const later = (h: number) => run(adj, NOW + h * 3_600_000);
    // Told "wrecked" (20%) while the app said ~75%: the gap closes over a couple of days.
    expect(later(0).score).toBe(20);
    expect(later(tauChest).score - later(tauChest).autoScore).toBeLessThan(0);
    expect(Math.abs(later(3 * tauChest).score - later(3 * tauChest).autoScore)).toBeLessThanOrEqual(3);
  });

  it("sets logged after the adjustment still count", () => {
    const auto = run(undefined);
    const adj = { chest: adjustmentFor(100, auto.autoFatigue, NOW) };
    const after = run(adj, NOW + 3_600_000, [bench("late", 0.5, 9), bench("late2", 0.5, 9)].map((s) => ({ ...s, at: new Date(NOW + 1_800_000).toISOString() })));
    expect(after.score).toBeLessThan(100);
  });

  it("an old adjustment (past the 7-day window) is ignored", () => {
    const auto = run(undefined);
    const adj = { chest: adjustmentFor(100, auto.autoFatigue, NOW) };
    const r = run(adj, NOW + 8 * 24 * 3_600_000);
    expect(r.adjusted).toBe(false);
    expect(r.score).toBe(100);
  });

  it("only the adjusted muscle changes", () => {
    const auto = computeRecovery({ muscles, sets, cardio: [], now: NOW, defaultRpe: 8 });
    const adjusted = computeRecovery({ muscles, sets, cardio: [], now: NOW, defaultRpe: 8, adjustments: { chest: adjustmentFor(0, auto.get("chest")!.autoFatigue, NOW) } });
    expect(adjusted.get("chest")!.score).toBe(0);
    expect(adjusted.get("triceps")!.score).toBe(auto.get("triceps")!.score);
  });
});
