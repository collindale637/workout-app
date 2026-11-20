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
for (const f of ["20261115000100_schema.sql", "20261115000200_catalog_seed.sql", "20261115000300_lock_trigger_functions.sql", "20261116000100_phase1_logging.sql", "20261116000200_cardio_in_workouts.sql", "20261116000300_phase2_plans.sql", "20261117000100_phase3_ai.sql", "20261118000100_phase4_progress.sql", "20261119000100_outdoor_cardio_gear.sql", "20261119000200_skipped_sets.sql", "20261120000100_ai_pick_kinds.sql", "20261120000200_recovery_times.sql", "20261121000100_cardio_incline.sql", "20261122000100_height_sex.sql", "20261123000100_ai_jobs.sql", "20261124000100_injuries.sql", "20261125000100_dev_notes.sql", "20261126000100_hide_crucifix.sql", "20261127000100_exercise_twins.sql", "20261127000200_exercise_twins_2.sql", "20261127000300_preacher_curl_default.sql"]) {
  const t = Date.now();
  await db.exec(readFileSync(root + f, "utf8"));
  console.log("applied", f, Date.now() - t, "ms");
}
// Re-run the seed to prove it's idempotent.
await db.exec(readFileSync(root + "20261115000200_catalog_seed.sql", "utf8"));
// ...and that the additive migrations are safe to run twice.
await db.exec(readFileSync(root + "20261116000100_phase1_logging.sql", "utf8"));
await db.exec(readFileSync(root + "20261116000200_cardio_in_workouts.sql", "utf8"));
await db.exec(readFileSync(root + "20261116000300_phase2_plans.sql", "utf8"));
await db.exec(readFileSync(root + "20261117000100_phase3_ai.sql", "utf8"));
await db.exec(readFileSync(root + "20261118000100_phase4_progress.sql", "utf8"));
await db.exec(readFileSync(root + "20261119000100_outdoor_cardio_gear.sql", "utf8"));
await db.exec(readFileSync(root + "20261119000200_skipped_sets.sql", "utf8"));
await db.exec(readFileSync(root + "20261120000100_ai_pick_kinds.sql", "utf8"));
await db.exec(readFileSync(root + "20261120000200_recovery_times.sql", "utf8"));
await db.exec(readFileSync(root + "20261121000100_cardio_incline.sql", "utf8"));
await db.exec(readFileSync(root + "20261122000100_height_sex.sql", "utf8"));
await db.exec(readFileSync(root + "20261123000100_ai_jobs.sql", "utf8"));
await db.exec(readFileSync(root + "20261124000100_injuries.sql", "utf8"));
await db.exec(readFileSync(root + "20261125000100_dev_notes.sql", "utf8"));
await db.exec(readFileSync(root + "20261126000100_hide_crucifix.sql", "utf8"));
await db.exec(readFileSync(root + "20261127000100_exercise_twins.sql", "utf8"));
await db.exec(readFileSync(root + "20261127000200_exercise_twins_2.sql", "utf8"));
await db.exec(readFileSync(root + "20261127000300_preacher_curl_default.sql", "utf8"));
await db.exec(readFileSync(root + "20261128000100_catalog_ez_preacher_and_more.sql", "utf8"));
await db.exec(readFileSync(root + "20261128000200_overhead_cable_extension_names.sql", "utf8"));
await db.exec(readFileSync(root + "20261129000100_plan_weeks.sql", "utf8"));
await db.exec(readFileSync(root + "20261129000100_plan_weeks.sql", "utf8")); // re-runnable
await db.exec(readFileSync(root + "20261130000100_ai_request_calls.sql", "utf8"));
await db.exec(readFileSync(root + "20261130000100_ai_request_calls.sql", "utf8")); // re-runnable
await db.exec(readFileSync(root + "20261201000100_catalog_batch1_aliases_equipment.sql", "utf8"));
await db.exec(readFileSync(root + "20261201000100_catalog_batch1_aliases_equipment.sql", "utf8")); // re-runnable
await db.exec(readFileSync(root + "20261202000100_catalog_batch2_staples.sql", "utf8"));
await db.exec(readFileSync(root + "20261202000100_catalog_batch2_staples.sql", "utf8")); // re-runnable
await db.exec(readFileSync(root + "20261202000200_catalog_batch3.sql", "utf8"));
await db.exec(readFileSync(root + "20261202000200_catalog_batch3.sql", "utf8")); // re-runnable
await db.exec(readFileSync(root + "20261202000300_catalog_batch4.sql", "utf8"));
await db.exec(readFileSync(root + "20261202000300_catalog_batch4.sql", "utf8")); // re-runnable
await db.exec(readFileSync(root + "20261202000400_catalog_photos_matched.sql", "utf8"));
await db.exec(readFileSync(root + "20261202000400_catalog_photos_matched.sql", "utf8")); // re-runnable
await db.exec(readFileSync(root + "20261203000100_catalog_search_aliases.sql", "utf8"));
await db.exec(readFileSync(root + "20261203000100_catalog_search_aliases.sql", "utf8")); // re-runnable
{
  // Alternate names are appended once, never doubled by a re-run.
  const [{ aliases }] = (await db.query(`select aliases from public.exercises where id = 'Assisted_Pull-Up_Machine'`)).rows;
  if (!aliases.includes("Gravitron") || aliases.filter((a) => a === "Gravitron").length !== 1) throw new Error("Gravitron alias missing or doubled");
}
if ((await db.query(`select is_active from public.exercises where id = 'Crucifix'`)).rows[0]?.is_active !== false) throw new Error("Crucifix should be inactive");
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
// Phase 2: plans, plan days with target muscles, favorites/exclusions.
const P = "dddddddd-0000-0000-0000-000000000001", D = "eeeeeeee-0000-0000-0000-000000000001";
r.push(["A creates active plan", await as(A, `insert into plans (id, name, goal, split_id, start_date, weeks, source, is_active) values ('${P}','PPL','hypertrophy','ppl_3','2026-11-16',8,'generated',true) returning id`)]);
r.push(["A adds plan day with targets", await as(A, `insert into plan_days (id, plan_id, day_order, name, target_muscle_ids) values ('${D}','${P}',1,'Push',array['chest','triceps']) returning target_muscle_ids`)]);
r.push(["A adds plan exercise", await as(A, `insert into plan_exercises (plan_day_id, exercise_id, sort_order, sets, rep_min, rep_max, rest_sec) values ('${D}','Barbell_Bench_Press_-_Medium_Grip',0,4,6,10,120) returning sets`)]);
r.push(["A switches active plan in one upsert", await as(A, `insert into plans (id, name, is_active) values ('${P}','PPL',false), ('dddddddd-0000-0000-0000-000000000002','Upper/Lower',true) on conflict (id) do update set is_active = excluded.is_active returning id, is_active`)]);
r.push(["A can't have two active plans", await as(A, `update plans set is_active = true returning id`)]);
r.push(["workout links to plan day", await as(A, `update workouts set plan_day_id='${D}', source='plan' returning plan_day_id`)]);
r.push(["B sees no plans", await as(B, `select (select count(*) from plans)::int plans, (select count(*) from plan_days)::int days, (select count(*) from plan_exercises)::int exs`)]);
r.push(["B cannot add a day to A's plan", await as(B, `insert into plan_days (plan_id, day_order, name) values ('${P}',2,'Pull')`)]);
r.push(["B cannot add to A's plan day", await as(B, `insert into plan_exercises (plan_day_id, exercise_id) values ('${D}','Pullups')`)]);
// Batch 20b: plans by week. Days default to week 1; progress is saved on the plan and only its owner can change it.
r.push(["A saves week progress", await as(A, `update plans set current_week = 2, week_started_at = now(), skipped_day_ids = array['${D}']::uuid[] where id = '${P}' returning current_week`)]);
r.push(["B cannot change A's week", await as(B, `update plans set current_week = 9 returning id`)]);
{
  const day = (await db.query(`select week from public.plan_days where id = '${D}'`)).rows[0];
  const plan = (await db.query(`select current_week, cardinality(skipped_day_ids) skipped from public.plans where id = '${P}'`)).rows[0];
  if (day?.week !== 1) throw new Error("plan days should default to week 1");
  if (plan?.current_week !== 2 || plan?.skipped !== 1) throw new Error("A's week progress should be saved and untouched by B");
}
r.push(["A favorites + excludes", await as(A, `insert into exercise_prefs (exercise_id, favorite, excluded) values ('Pullups', true, false), ('Barbell_Deadlift', false, true) on conflict (owner_id, exercise_id) do update set favorite = excluded.favorite returning exercise_id`)]);
r.push(["B sees none of A's prefs", await as(B, `select count(*)::int n from exercise_prefs`)]);
r.push(["new splits present", await as(A, `select s.id, count(d.*)::int days from splits s join split_days d on d.split_id = s.id where s.id in ('phul_4','hybrid_4') group by s.id order by s.id`)]);
// Phase 3: AI usage log (written only through the functions) and plan notes.
r.push(["A logs an AI request", await as(A, `select public.ai_log_request('plan', 'claude-sonnet-5-5', 9000, 1500, 0.033, true)`)]);
r.push(["A logs an AI swap", await as(A, `select public.ai_log_request('swap', 'claude-haiku-5-5', 1500, 200, 0.0025, true)`)]);
r.push(["B logs an AI request", await as(B, `select public.ai_log_request('import', 'claude-sonnet-5-5', 4000, 800, 0.016)`)]);
r.push(["A logs a build's call count", await as(A, `select public.ai_log_request('plan', 'claude-sonnet-5-5', 30000, 9000, 0.12, true, 4)`)]);
r.push(["calls saved (null when not given)", await as(A, `select calls from ai_requests where cost_usd in (0.12, 0.033) order by cost_usd`)]);
r.push(["A sees own log only", await as(A, `select count(*)::int n, sum(cost_usd)::text cost from ai_requests`)]);
r.push(["A can't write the log directly", await as(A, `insert into ai_requests (type, cost_usd) values ('plan', 0)`)]);
r.push(["A can't erase usage", await as(A, `delete from ai_requests returning id`)]);
r.push(["recovery times updated", await as(A, `select id, recovery_tau_hours from public.muscles where id in ('quads', 'chest', 'biceps', 'lower_back') order by id`)]);
r.push(["household spend is shared", await as(A, `select household_usd::text, mine_usd::text, my_requests from ai_spend_this_month()`)]);
r.push(["anon can't log AI", await (async () => { await db.exec("set role anon"); try { return { rows: (await db.query("select public.ai_log_request('plan','x',1,1,1)")).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec("reset role"); } })()]);
r.push(["A saves plan notes", await as(A, `update plans set notes = 'Add a rep each week' where id = '${P}' returning notes`)]);
// Phase 4: bodyweight log, cardio preference, no-equipment exercises.
r.push(["A logs bodyweight", await as(A, `insert into body_metrics (id, date, bodyweight) values ('ffffffff-0000-0000-0000-000000000001','2026-11-18',182.4) returning bodyweight::text`)]);
r.push(["A edits today's weight", await as(A, `insert into body_metrics (id, date, bodyweight) values ('ffffffff-0000-0000-0000-000000000001','2026-11-18',181.9) on conflict (id) do update set bodyweight = excluded.bodyweight returning bodyweight::text`)]);
r.push(["one entry per day", await as(A, `insert into body_metrics (date, bodyweight) values ('2026-11-18',180)`)]);
r.push(["B sees none of A's weights", await as(B, `select count(*)::int n from body_metrics`)]);
r.push(["B can't change A's weight", await as(B, `update body_metrics set bodyweight = 1 returning id`)]);
r.push(["cardio pref defaults to auto", await as(A, `select cardio_pref from profiles`)]);
r.push(["A sets cardio pref", await as(A, `update profiles set cardio_pref = 'more' returning cardio_pref`)]);
r.push(["bad cardio pref rejected", await as(A, `update profiles set cardio_pref = 'lots' returning id`)]);
r.push(["no-equipment exercises", await as(A, `select e.id, count(m.*)::int muscles, (select count(*) from exercise_equipment q where q.exercise_id = e.id)::int equipment from exercises e join exercise_muscles m on m.exercise_id = e.id where e.id in ('Doorframe_Row','Pike_Push_Up','Prone_Y_T_W_Raise') group by e.id order by e.id`)]);
r.push(["A saves a treadmill incline", await as(A, `insert into cardio_sessions (type, duration_sec, incline) values ('walk',1800,7.5) returning incline::text`)]);
r.push(["incline over 40 rejected", await as(A, `insert into cardio_sessions (type, duration_sec, incline) values ('walk',600,41)`)]);
r.push(["negative incline rejected", await as(A, `insert into cardio_sessions (type, duration_sec, incline) values ('run',600,-1)`)]);
r.push(["height and sex default to empty", await as(A, `select height_in, sex from profiles`)]);
r.push(["A saves height and sex", await as(A, `update profiles set height_in = 70.5, sex = 'female' returning height_in::text, sex`)]);
r.push(["absurd height rejected", await as(A, `update profiles set height_in = 12 returning id`)]);
r.push(["bad sex value rejected", await as(A, `update profiles set sex = 'robot' returning id`)]);
r.push(["B can't change A's height", await as(B, `update profiles set height_in = 60 where id = '${A}' returning id`)]);
r.push(["A starts an AI job", await as(A, `insert into ai_jobs (id, kind, ref) values ('dddddddd-0000-0000-0000-000000000001','plan',null) returning status`)]);
r.push(["A finishes the job", await as(A, `update ai_jobs set status = 'done', result = '{"ok":true}' where id = 'dddddddd-0000-0000-0000-000000000001' returning status`)]);
r.push(["bad job kind rejected", await as(A, `insert into ai_jobs (kind) values ('import')`)]);
r.push(["bad job status rejected", await as(A, `update ai_jobs set status = 'weird' returning id`)]);
r.push(["B can't see A's job", await as(B, `select count(*)::int n from ai_jobs`)]);
r.push(["B can't change A's job", await as(B, `update ai_jobs set status = 'failed' where id = 'dddddddd-0000-0000-0000-000000000001' returning id`)]);
r.push(["B can't delete A's job", await as(B, `delete from ai_jobs where id = 'dddddddd-0000-0000-0000-000000000001' returning id`)]);
r.push(["B can't create a job as A", await as(B, `insert into ai_jobs (owner_id, kind) values ('${A}','plan')`)]);
r.push(["stuck job expires", await as(A, `insert into ai_jobs (id, kind, created_at) values ('dddddddd-0000-0000-0000-000000000002','plan', now() - interval '20 minutes')`)]);
r.push(["expire runs", await as(A, `select ai_jobs_expire()`)]);
r.push(["stuck job is now failed", await as(A, `select status from ai_jobs where id = 'dddddddd-0000-0000-0000-000000000002'`)]);
r.push(["A dismisses the job", await as(A, `delete from ai_jobs where id = 'dddddddd-0000-0000-0000-000000000001' returning id`)]);
r.push(["avoid areas default to none", await as(A, `select avoid_areas, injury_note from profiles`)]);
r.push(["A saves areas and a note", await as(A, `update profiles set avoid_areas = array['knees','lower_back'], injury_note = 'Left shoulder pinches overhead' returning avoid_areas`)]);
r.push(["unknown area rejected", await as(A, `update profiles set avoid_areas = array['knees','soul'] returning id`)]);
r.push(["over-long note rejected", await as(A, `update profiles set injury_note = repeat('x', 301) returning id`)]);
r.push(["B can't change A's areas", await as(B, `update profiles set avoid_areas = array['neck'] where id = '${A}' returning id`)]);
r.push(["A sends a note", await as(A, `insert into dev_notes (id, body, app_version) values ('eeeeeeee-0000-0000-0000-000000000001', 'Rest timer stuck at 0:00', 'abc1234') returning body`)]);
r.push(["sync retry of the same note", await as(A, `insert into dev_notes (id, body) values ('eeeeeeee-0000-0000-0000-000000000001', 'Rest timer stuck at 0:00') on conflict (id) do update set body = excluded.body returning id`)]);
r.push(["empty note rejected", await as(A, `insert into dev_notes (body) values ('   ') returning id`)]);
r.push(["B can't read A's notes", await as(B, `select count(*)::int n from dev_notes`)]);
r.push(["B can't send as A", await as(B, `insert into dev_notes (owner_id, body) values ('${A}', 'spoof') returning id`)]);
r.push(["B sends a note", await as(B, `insert into dev_notes (body) values ('Add a dark-mode toggle') returning body`)]);
await db.exec(`insert into app_admins (user_id) values ('${A}')`);
r.push(["admin A: is_app_admin", await as(A, `select public.is_app_admin() ok`)]);
r.push(["B: is_app_admin", await as(B, `select public.is_app_admin() ok`)]);
r.push(["admin A sees every note + sender", await as(A, `select count(*)::int n, count(distinct sender)::int senders from public.dev_notes_inbox()`)]);
r.push(["B can't open the inbox", await as(B, `select count(*) from public.dev_notes_inbox()`)]);
r.push(["B can't read the admin list", await as(B, `select count(*)::int n from app_admins`)]);
r.push(["B can't make himself admin", await as(B, `insert into app_admins (user_id) values ('${B}') returning user_id`)]);
r.push(["B can't mark notes done", await as(B, `select public.dev_note_set_done('eeeeeeee-0000-0000-0000-000000000001', true)`)]);
r.push(["admin A marks a note done", await as(A, `select public.dev_note_set_done('eeeeeeee-0000-0000-0000-000000000001', true)`)]);
r.push(["…and it shows as done", await as(A, `select count(*)::int done from public.dev_notes_inbox() where done_at is not null`)]);
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
