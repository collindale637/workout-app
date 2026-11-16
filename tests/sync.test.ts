import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { LocalDB } from "@/lib/db/dexie";
import { markDeleted, markDirty, syncNow } from "@/lib/db/sync";

/** A tiny stand-in for the Supabase client that records writes and serves canned reads. */
function fakeSupabase(server: Record<string, Record<string, unknown>[]>) {
  const calls: { table: string; op: string; payload?: unknown; filter?: unknown }[] = [];
  const from = (table: string) => {
    const state: { op: string; payload?: unknown; filters: [string, string, unknown][]; range?: [number, number] } = { op: "select", filters: [] };
    const exec = async () => {
      if (state.op !== "select") {
        calls.push({ table, op: state.op, payload: state.payload, filter: state.filters });
        return { data: null, error: null };
      }
      let rows = server[table] ?? [];
      for (const [kind, col, val] of state.filters) {
        if (kind === "eq") rows = rows.filter((r) => r[col] === val);
        if (kind === "gt") rows = rows.filter((r) => String(r[col]) > String(val));
        if (kind === "in") rows = rows.filter((r) => (val as unknown[]).includes(r[col]));
      }
      if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1);
      return { data: rows, error: null };
    };
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (state.filters.push(["eq", c, v]), q),
      gt: (c: string, v: unknown) => (state.filters.push(["gt", c, v]), q),
      in: (c: string, v: unknown) => (state.filters.push(["in", c, v]), q),
      is: () => q,
      order: () => q,
      range: (a: number, b: number) => ((state.range = [a, b]), q),
      maybeSingle: async () => ({ data: (await exec()).data?.[0] ?? null, error: null }),
      upsert: (p: unknown) => ((state.op = "upsert"), (state.payload = p), q),
      insert: (p: unknown) => ((state.op = "insert"), (state.payload = p), q),
      update: (p: unknown) => ((state.op = "update"), (state.payload = p), q),
      delete: () => ((state.op = "delete"), q),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => exec().then(res, rej),
    };
    return q;
  };
  return { client: { from } as never, calls };
}

const USER = "11111111-1111-1111-1111-111111111111";
let db: LocalDB;

beforeEach(async () => {
  db = new LocalDB(`${USER}-${Math.random()}`);
  await db.open();
});

describe("sync", () => {
  it("uploads parents before children and clears the outbox", async () => {
    const { client, calls } = fakeSupabase({ profiles: [{ id: USER, display_name: "C", default_rpe: "8.0", units: "lb" }] });
    await db.workouts.put({ id: "w1", name: null, gym_id: null, plan_day_id: null, started_at: "2026-11-16T10:00:00Z", ended_at: null, notes: null, source: "manual" });
    await db.workout_exercises.put({ id: "we1", workout_id: "w1", exercise_id: "Pullups", sort_order: 0, superset_group: null, notes: null, target_sets: 3, rep_min: 6, rep_max: 10, rest_sec: 90 });
    await db.sets.put({ id: "s1", workout_exercise_id: "we1", set_no: 1, type: "working", weight: null, reps: 8, rpe: null, completed_at: "2026-11-16T10:05:00Z" });
    await markDirty(db, "sets", "s1");
    await markDirty(db, "workouts", "w1");
    await markDirty(db, "workout_exercises", "we1");

    await syncNow(db, client, USER);

    const order = calls.filter((c) => c.op === "upsert").map((c) => c.table);
    expect(order).toEqual(["workouts", "workout_exercises", "sets"]);
    const setPayload = (calls.find((c) => c.table === "sets")!.payload as Record<string, unknown>[])[0];
    expect(setPayload).toMatchObject({ id: "s1", rpe: null, reps: 8 });
    expect(await db.outbox.count()).toBe(0);
    expect((await db.profile.get(USER))?.default_rpe).toBe(8);
  });

  it("uploads cardio results with the exercise they belong to, after that exercise", async () => {
    const { client, calls } = fakeSupabase({ profiles: [{ id: USER, default_rpe: 8 }] });
    await db.workouts.put({ id: "w1", name: null, gym_id: null, plan_day_id: null, started_at: "2026-11-16T10:00:00Z", ended_at: null, notes: null, source: "manual" });
    await db.workout_exercises.put({ id: "we1", workout_id: "w1", exercise_id: "Running_Treadmill", sort_order: 0, superset_group: null, notes: null, target_sets: 1, rep_min: null, rep_max: null, rest_sec: null });
    await db.cardio_sessions.put({ id: "c1", workout_id: "w1", workout_exercise_id: "we1", type: "run", started_at: "2026-11-16T10:05:00Z", duration_sec: 1800, distance: 3.1, avg_hr: 150, rpe: 7, intervals: null, notes: null });
    await markDirty(db, "cardio_sessions", "c1");
    await markDirty(db, "workout_exercises", "we1");
    await markDirty(db, "workouts", "w1");

    await syncNow(db, client, USER);

    expect(calls.filter((c) => c.op === "upsert").map((c) => c.table)).toEqual(["workouts", "workout_exercises", "cardio_sessions"]);
    const payload = (calls.find((c) => c.table === "cardio_sessions")!.payload as Record<string, unknown>[])[0];
    expect(payload).toMatchObject({ id: "c1", workout_exercise_id: "we1", duration_sec: 1800, distance: 3.1 });
  });

  it("keeps unsent local changes over server copies and sends deletes", async () => {
    const { client, calls } = fakeSupabase({
      profiles: [{ id: USER, default_rpe: 8 }],
      gyms: [{ id: "g1", name: "Server name", template: "home", is_default: true, created_at: "x", updated_at: "2026-11-16T09:00:00Z" }],
    });
    await db.gyms.put({ id: "g1", name: "Phone name", template: "home", is_default: true, created_at: "x" });
    await markDirty(db, "gyms", "g1");
    await db.workouts.put({ id: "w9", name: null, gym_id: null, plan_day_id: null, started_at: "x", ended_at: "y", notes: null, source: "manual" });
    await db.workouts.delete("w9");
    await markDeleted(db, "workouts", "w9");

    await syncNow(db, client, USER);
    expect(calls.find((c) => c.op === "delete" && c.table === "workouts")).toBeTruthy();
    expect(await db.tombstones.count()).toBe(0);
    // After the push the outbox is clear, so the pulled server row lands.
    expect((await db.gyms.get("g1"))?.name).toBe("Server name");
  });

  it("uploads plans before their days and exercises, switching the active plan safely, and favorites", async () => {
    const { client, calls } = fakeSupabase({ profiles: [{ id: USER, default_rpe: 8 }], exercise_prefs: [{ exercise_id: "Pullups", favorite: true, excluded: false }] });
    await db.plans.bulkPut([
      { id: "p-new", name: "PPL", goal: "hypertrophy", split_id: "ppl_3", start_date: "2026-11-16", weeks: 8, source: "generated", is_active: true, created_at: "2026-11-16T10:00:00Z" },
      { id: "p-old", name: "Old", goal: null, split_id: null, start_date: null, weeks: null, source: "manual", is_active: false, created_at: "2026-10-01T10:00:00Z" },
    ]);
    await db.plan_days.put({ id: "d1", plan_id: "p-new", day_order: 1, name: "Push", gym_id: null, target_muscle_ids: ["chest", "triceps"] });
    await db.plan_exercises.put({ id: "pe1", plan_day_id: "d1", exercise_id: "Pushups", sort_order: 0, sets: 3, rep_min: 8, rep_max: 12, rest_sec: 60, superset_group: null, notes: null });
    await db.exercise_prefs.put({ exercise_id: "Barbell_Deadlift", favorite: false, excluded: true });
    for (const [t, id] of [["plan_exercises", "pe1"], ["plan_days", "d1"], ["plans", "p-new"], ["plans", "p-old"], ["exercise_prefs", "Barbell_Deadlift"]] as const) await markDirty(db, t, id);

    await syncNow(db, client, USER);

    const upserts = calls.filter((c) => c.op === "upsert");
    expect(upserts.map((c) => c.table)).toEqual(["exercise_prefs", "plans", "plan_days", "plan_exercises"]);
    // The plan being switched off goes first, so there's never two active plans.
    expect((upserts[1].payload as { id: string }[]).map((r) => r.id)).toEqual(["p-old", "p-new"]);
    expect((upserts[2].payload as Record<string, unknown>[])[0]).toMatchObject({ target_muscle_ids: ["chest", "triceps"] });
    expect((upserts[0].payload as Record<string, unknown>[])[0]).toMatchObject({ owner_id: USER, exercise_id: "Barbell_Deadlift", excluded: true });
    expect(await db.outbox.count()).toBe(0);
    // Favorites from another device come down.
    expect((await db.exercise_prefs.get("Pullups"))?.favorite).toBe(true);
  });
});
