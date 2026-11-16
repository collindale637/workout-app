import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalDB } from "./dexie";
import type { OutboxEntry, SyncTable } from "./types";

/**
 * Two-way sync between the phone (IndexedDB) and Supabase.
 *
 * - Every local change adds an "outbox" entry. Push uploads those rows in parent-before-child order,
 *   then removes the entry (only if the row hasn't changed again meanwhile).
 * - Deletes leave a "tombstone" that push turns into a server delete.
 * - Pull fetches rows changed on the server since the last pull. Rows with unsent local changes win.
 */

/** Columns sent to the server for each table (anything else is local-only). */
const COLUMNS: Record<Exclude<SyncTable, "exercise_tags" | "gym_equipment" | "exercise_prefs">, string[]> = {
  profiles: ["id", "display_name", "units", "goal", "experience", "days_per_week", "session_minutes", "default_rpe", "active_gym_id", "onboarded_at"],
  exercises: ["id", "name", "aliases", "category", "movement_pattern", "mechanic", "force", "level", "instructions", "images", "is_common", "is_active", "owner_id", "source"],
  gyms: ["id", "name", "template", "is_default"],
  plans: ["id", "name", "goal", "split_id", "start_date", "weeks", "source", "is_active"],
  plan_days: ["id", "plan_id", "day_order", "name", "gym_id", "target_muscle_ids"],
  plan_exercises: ["id", "plan_day_id", "exercise_id", "sort_order", "sets", "rep_min", "rep_max", "rest_sec", "superset_group", "notes"],
  workouts: ["id", "name", "gym_id", "plan_day_id", "started_at", "ended_at", "notes", "source"],
  workout_exercises: ["id", "workout_id", "exercise_id", "sort_order", "superset_group", "notes", "target_sets", "rep_min", "rep_max", "rest_sec"],
  sets: ["id", "workout_exercise_id", "set_no", "type", "weight", "reps", "rpe", "completed_at"],
  cardio_sessions: ["id", "workout_id", "workout_exercise_id", "type", "started_at", "duration_sec", "distance", "avg_hr", "rpe", "intervals", "notes"],
};

/** Upload order: parents first. Deletes run in reverse. */
const PUSH_ORDER: SyncTable[] = [
  "exercises", "exercise_tags", "exercise_prefs", "gyms", "gym_equipment", "profiles",
  "plans", "plan_days", "plan_exercises",
  "workouts", "workout_exercises", "sets", "cardio_sessions",
];

/** Tables pulled incrementally by updated_at. */
const INCREMENTAL: Array<"gyms" | "plans" | "plan_days" | "plan_exercises" | "workouts" | "workout_exercises" | "sets" | "cardio_sessions"> = [
  "gyms", "plans", "plan_days", "plan_exercises", "workouts", "workout_exercises", "sets", "cardio_sessions",
];

const pick = (row: Record<string, unknown>, cols: string[]) =>
  Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c] ?? null]));

/** Reads every row of a query, 1,000 at a time (Supabase's page limit). */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Marks a row as changed so the next sync uploads it. */
export async function markDirty(db: LocalDB, table: SyncTable, id: string) {
  const existing = await db.outbox.get([table, id]);
  await db.outbox.put({ table, id, rev: (existing?.rev ?? 0) + 1 });
}

export async function markDeleted(db: LocalDB, table: SyncTable, id: string) {
  await db.outbox.delete([table, id]);
  await db.tombstones.put({ table, id });
}

async function clearIfUnchanged(db: LocalDB, entries: OutboxEntry[]) {
  await db.transaction("rw", db.outbox, async () => {
    for (const e of entries) {
      const now = await db.outbox.get([e.table, e.id]);
      if (now && now.rev === e.rev) await db.outbox.delete([e.table, e.id]);
    }
  });
}

async function push(db: LocalDB, sb: SupabaseClient, userId: string) {
  const outbox = await db.outbox.toArray();
  for (const table of PUSH_ORDER) {
    const entries = outbox.filter((e) => e.table === table);
    if (!entries.length) continue;
    const ids = entries.map((e) => e.id);

    if (table === "gym_equipment") {
      // The whole checklist for each changed gym is replaced.
      for (const gymId of ids) {
        const rows = await db.gym_equipment.where("gym_id").equals(gymId).toArray();
        const del = await sb.from("gym_equipment").delete().eq("gym_id", gymId);
        if (del.error) throw new Error(del.error.message);
        if (rows.length) {
          const ins = await sb.from("gym_equipment").insert(
            rows.map((r) => ({ gym_id: r.gym_id, equipment_id: r.equipment_id, details: r.details, owner_id: userId })),
          );
          if (ins.error) throw new Error(ins.error.message);
        }
      }
    } else if (table === "exercise_prefs") {
      // Favorites/exclusions are never deleted, just switched off, so an upsert covers every change.
      const rows = (await db.exercise_prefs.bulkGet(ids)).filter(Boolean).map((r) => ({
        owner_id: userId, exercise_id: r!.exercise_id, favorite: r!.favorite, excluded: r!.excluded,
      }));
      if (rows.length) {
        const { error } = await sb.from("exercise_prefs").upsert(rows, { onConflict: "owner_id,exercise_id" });
        if (error) throw new Error(`exercise_prefs: ${error.message}`);
      }
    } else if (table === "exercise_tags") {
      for (const exId of ids) {
        const muscles = await db.exercise_muscles.where("exercise_id").equals(exId).toArray();
        const equip = await db.exercise_equipment.where("exercise_id").equals(exId).toArray();
        for (const [t, rows] of [["exercise_muscles", muscles], ["exercise_equipment", equip]] as const) {
          const del = await sb.from(t).delete().eq("exercise_id", exId);
          if (del.error) throw new Error(del.error.message);
          if (rows.length) {
            const ins = await sb.from(t).insert(rows as Record<string, unknown>[]);
            if (ins.error) throw new Error(ins.error.message);
          }
        }
      }
    } else {
      const local =
        table === "profiles"
          ? await db.profile.bulkGet(ids)
          : await (db[table] as unknown as { bulkGet: (k: string[]) => Promise<(Record<string, unknown> | undefined)[]> }).bulkGet(ids);
      const rows = local.filter(Boolean).map((r) => pick(r as Record<string, unknown>, COLUMNS[table]));
      // Only one default gym (and one active plan) is allowed, so clear the old one before setting the new one.
      if (table === "gyms") rows.sort((a, b) => Number(a.is_default) - Number(b.is_default));
      if (table === "plans") rows.sort((a, b) => Number(a.is_active) - Number(b.is_active));
      if (rows.length) {
        const { error } =
          table === "profiles"
            ? await sb.from("profiles").update(rows[0]).eq("id", userId)
            : await sb.from(table).upsert(rows);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
    }
    await clearIfUnchanged(db, entries);
  }

  const tombstones = await db.tombstones.toArray();
  for (const table of [...PUSH_ORDER].reverse()) {
    const ids = tombstones.filter((t) => t.table === table).map((t) => t.id);
    if (!ids.length) continue;
    const { error } = await sb.from(table).delete().in("id", ids);
    if (error) throw new Error(`${table} delete: ${error.message}`);
    await db.tombstones.bulkDelete(ids.map((id) => [table, id] as [string, string]));
  }
}

async function pull(db: LocalDB, sb: SupabaseClient, userId: string) {
  const pending = new Set((await db.outbox.toArray()).map((e) => `${e.table}:${e.id}`));
  const gone = new Set((await db.tombstones.toArray()).map((e) => `${e.table}:${e.id}`));
  const keep = (table: string, id: string) => !pending.has(`${table}:${id}`) && !gone.has(`${table}:${id}`);

  // Profile (one row, made by the database when the account was created).
  const prof = await sb.from("profiles").select(COLUMNS.profiles.join(",")).eq("id", userId).maybeSingle();
  if (prof.error) throw new Error(prof.error.message);
  if (prof.data && keep("profiles", userId)) {
    const p = prof.data as unknown as Record<string, unknown>;
    await db.profile.put({ ...(p as object), default_rpe: Number(p.default_rpe) } as never);
  }

  for (const table of INCREMENTAL) {
    const sinceKey = `pulled:${table}`;
    const since = (await db.getMeta<string>(sinceKey)) ?? "1970-01-01T00:00:00Z";
    const rows = await fetchAll<Record<string, unknown>>((from, to) =>
      sb.from(table).select("*").gt("updated_at", since).order("updated_at").range(from, to),
    );
    if (!rows.length) continue;
    const fresh = rows.filter((r) => keep(table, r.id as string)).map(normalize);
    await (db[table] as unknown as { bulkPut: (r: unknown[]) => Promise<unknown> }).bulkPut(fresh);
    await db.setMeta(sinceKey, rows[rows.length - 1].updated_at);
  }

  // Small tables: replace fully (also picks up deletions from other devices).
  const ge = await fetchAll<Record<string, unknown>>((from, to) => sb.from("gym_equipment").select("gym_id, equipment_id, details").range(from, to));
  await db.transaction("rw", db.gym_equipment, async () => {
    const dirtyGyms = new Set([...pending].filter((k) => k.startsWith("gym_equipment:")).map((k) => k.split(":")[1]));
    const locals = await db.gym_equipment.toArray();
    await db.gym_equipment.bulkDelete(locals.filter((r) => !dirtyGyms.has(r.gym_id)).map((r) => [r.gym_id, r.equipment_id] as [string, string]));
    await db.gym_equipment.bulkPut(ge.filter((r) => !dirtyGyms.has(r.gym_id as string)) as never);
  });

  const prefs = await sb.from("exercise_prefs").select("exercise_id, favorite, excluded");
  if (prefs.error) throw new Error(prefs.error.message);
  await db.transaction("rw", db.exercise_prefs, async () => {
    const fresh = (prefs.data ?? []).filter((r) => keep("exercise_prefs", r.exercise_id));
    await db.exercise_prefs.bulkPut(fresh);
  });

  const custom = await sb.from("exercises").select("*").eq("owner_id", userId);
  if (custom.error) throw new Error(custom.error.message);
  const customRows = (custom.data ?? []).filter((r) => keep("exercises", r.id));
  if (customRows.length) {
    await db.exercises.bulkPut(customRows);
    const ids = customRows.map((r) => r.id).filter((id) => keep("exercise_tags", id));
    if (ids.length) {
      const [m, e] = await Promise.all([
        sb.from("exercise_muscles").select("*").in("exercise_id", ids),
        sb.from("exercise_equipment").select("*").in("exercise_id", ids),
      ]);
      if (m.data) await db.exercise_muscles.bulkPut(m.data);
      if (e.data) await db.exercise_equipment.bulkPut(e.data);
    }
  }
}

/** Numbers come back from Postgres numeric columns as strings. */
function normalize(row: Record<string, unknown>) {
  const out = { ...row };
  for (const k of ["weight", "rpe", "distance"]) {
    if (typeof out[k] === "string") out[k] = Number(out[k]);
  }
  return out;
}

export async function syncNow(db: LocalDB, sb: SupabaseClient, userId: string) {
  await push(db, sb, userId);
  await pull(db, sb, userId);
  await db.setMeta("lastSyncedAt", new Date().toISOString());
}
