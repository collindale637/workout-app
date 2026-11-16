// Runs the migrations against an in-memory Postgres (PGlite) with Supabase auth/storage stubbed,
// then checks row-level security with two users. `npm run test:db`
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const root = new URL("../migrations/", import.meta.url).pathname;
const db = new PGlite();
// Minimal Supabase stand-ins.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema storage; create schema extensions;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  grant usage on schema public, auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  alter default privileges in schema public grant all on tables to authenticated, anon;
`);
for (const f of ["20261115000100_schema.sql", "20261115000200_catalog_seed.sql", "20261115000300_lock_trigger_functions.sql", "20261116000100_phase1_logging.sql", "20261116000200_cardio_in_workouts.sql"]) {
  const t = Date.now();
  await db.exec(readFileSync(root + f, "utf8"));
  console.log("applied", f, Date.now() - t, "ms");
}
// Re-run the seed to prove it's idempotent.
await db.exec(readFileSync(root + "20261115000200_catalog_seed.sql", "utf8"));
// ...and that the additive migrations are safe to run twice.
await db.exec(readFileSync(root + "20261116000100_phase1_logging.sql", "utf8"));
await db.exec(readFileSync(root + "20261116000200_cardio_in_workouts.sql", "utf8"));
const one = async (sql) => (await db.query(sql)).rows;
console.log(await one(`select (select count(*) from muscles) muscles, (select count(*) from equipment) equipment,
  (select count(*) from exercises) exercises, (select count(*) from exercises where is_common) common,
  (select count(*) from exercise_muscles) ex_muscles, (select count(*) from exercise_equipment) ex_equip,
  (select count(*) from splits) splits, (select count(*) from split_days) split_days`));

// Two invited users.
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${A}','a@x.com','{"name":"Collin"}'), ('${B}','b@x.com','{}')`);
console.log("profiles:", await one(`select id, display_name, default_rpe, units from profiles order by id`));

const as = async (uid, sql) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return { rows: (await db.query(sql)).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec(`reset role;`); }
};
const r = [];
r.push(["A sees own profile only", await as(A, `select count(*)::int n from profiles`)]);
r.push(["A creates gym", await as(A, `insert into gyms (id, name, template, is_default) values ('aaaaaaaa-0000-0000-0000-000000000001','Main Gym','commercial',true) returning id`)]);
r.push(["A adds equipment", await as(A, `insert into gym_equipment (gym_id, equipment_id, details) values ('aaaaaaaa-0000-0000-0000-000000000001','dumbbells','{"dumbbell_max":100}') returning equipment_id`)]);
r.push(["A sets active gym", await as(A, `update profiles set active_gym_id='aaaaaaaa-0000-0000-0000-000000000001', display_name='Collin D' returning active_gym_id`)]);
r.push(["B cannot see A's gym", await as(B, `select count(*)::int n from gyms`)]);
r.push(["B cannot add equipment to A's gym", await as(B, `insert into gym_equipment (gym_id, equipment_id) values ('aaaaaaaa-0000-0000-0000-000000000001','barbell')`)]);
r.push(["B cannot set A's gym active", await as(B, `update profiles set active_gym_id='aaaaaaaa-0000-0000-0000-000000000001' returning id`)]);
r.push(["B cannot edit A's profile", await as(B, `update profiles set display_name='hacked' where id='${A}' returning id`)]);
r.push(["A logs workout", await as(A, `insert into workouts (id, gym_id) values ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001') returning id`)]);
r.push(["A adds exercise", await as(A, `insert into workout_exercises (id, workout_id, exercise_id, sort_order) values ('cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','Barbell_Bench_Press_-_Medium_Grip',1) returning id`)]);
r.push(["A logs set (blank RPE)", await as(A, `insert into sets (workout_exercise_id, set_no, weight, reps) values ('cccccccc-0000-0000-0000-000000000001',1,185,8) returning rpe, weight`)]);
r.push(["B can't add exercise to A's workout", await as(B, `insert into workout_exercises (workout_id, exercise_id) values ('bbbbbbbb-0000-0000-0000-000000000001','Pullups')`)]);
r.push(["A saves cardio results for an exercise", await as(A, `insert into cardio_sessions (workout_id, workout_exercise_id, type, duration_sec, distance) values ('bbbbbbbb-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','run',1800,3.1) returning workout_exercise_id`)]);
r.push(["B cannot attach cardio to A's exercise", await as(B, `insert into cardio_sessions (workout_exercise_id, type, duration_sec) values ('cccccccc-0000-0000-0000-000000000001','run',600)`)]);
r.push(["B sees none of A's cardio", await as(B, `select count(*)::int n from cardio_sessions`)]);
r.push(["standalone cardio still works", await as(B, `insert into cardio_sessions (type, duration_sec) values ('walk',900) returning id`)]);
r.push(["B sees no sets", await as(B, `select count(*)::int n from sets`)]);
r.push(["B cannot attach a set to A's exercise", await as(B, `insert into sets (workout_exercise_id, set_no, weight, reps) values ('cccccccc-0000-0000-0000-000000000001', 2, 1, 1)`)]);
r.push(["B creates custom exercise", await as(B, `insert into exercises (name, owner_id) values ('My Move', '${B}') returning id`)]);
r.push(["A can't see B's custom", await as(A, `select count(*)::int n from exercises where owner_id is not null`)]);
r.push(["A can't edit catalog", await as(A, `update exercises set name='x' where id='Pullups' returning id`)]);
r.push(["catalog readable", await as(A, `select count(*)::int n from exercises where is_active`)]);
r.push(["anon sees nothing", await (async () => { await db.exec("set role anon"); try { return { rows: (await db.query("select count(*) from exercises")).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec("reset role"); } })()]);
r.push(["bad RPE rejected", await as(A, `update sets set rpe = 11 returning id`)]);
for (const [k, v] of r) console.log(k.padEnd(40), JSON.stringify(v));

// Deleting a cardio exercise from a workout takes its results with it (checked last so the checks above can use it).
await db.exec(`delete from workout_exercises where id='cccccccc-0000-0000-0000-000000000001'`);
console.log("cardio left after removing its exercise:", await one(`select count(*)::int n from cardio_sessions where workout_exercise_id is not null`));

// Equipment-aware query: exercises doable at A's gym if it only has dumbbells + adjustable bench.
await db.exec(`insert into gym_equipment (gym_id, equipment_id, owner_id) values ('aaaaaaaa-0000-0000-0000-000000000001','adjustable_bench','${A}')`);
console.log(await one(`
  select count(*) filter (where ok) doable, count(*) total from (
    select e.id, not exists (
      select 1 from exercise_equipment ee where ee.exercise_id = e.id
      group by ee.option_group
      having not bool_or(ee.equipment_id in (select equipment_id from gym_equipment where gym_id='aaaaaaaa-0000-0000-0000-000000000001'))
    ) ok from exercises e where e.is_active and e.category = 'strength') t`));
console.log(await one(`select e.name from exercises e where e.is_common and e.category='strength' and not exists (
      select 1 from exercise_equipment ee where ee.exercise_id = e.id group by ee.option_group
      having not bool_or(ee.equipment_id in ('dumbbells','adjustable_bench'))) and exists (select 1 from exercise_muscles m where m.exercise_id=e.id and m.muscle_id='chest' and m.role='primary')`));
