-- Phase 2: smart workouts. Additive only, safe to re-run.

-- A plan day remembers which muscles it trains, so it can be regenerated and its exercises swapped
-- for the closest match at another gym.
alter table public.plan_days
  add column if not exists target_muscle_ids text[] not null default '{}';

-- Two more splits from the plan doc (also in the generated catalog seed; repeated here so they reach
-- databases that already ran that seed).
insert into public.splits (id, name, days_per_week, description, sort_order) values
  ('phul_4', 'PHUL', 4, 'Power and size: a heavy upper and lower day, then a higher-rep upper and lower day.', 5),
  ('hybrid_4', 'Hybrid: Lifting + Cardio', 4, 'Three lifting days with cardio built in, plus a cardio and core day.', 6)
on conflict (id) do update set name = excluded.name, days_per_week = excluded.days_per_week,
  description = excluded.description, sort_order = excluded.sort_order;

update public.splits set sort_order = 7 where id = 'ul_ppl_5';
update public.splits set sort_order = 8 where id = 'bro_5';
update public.splits set sort_order = 9 where id = 'ppl_6';
update public.splits set sort_order = 10 where id = 'arnold_6';

delete from public.split_days where split_id in ('phul_4', 'hybrid_4');
insert into public.split_days (split_id, day_order, name, target_muscle_ids) values
  ('phul_4', 1, 'Upper Power', array['chest', 'lats', 'upper_back', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps']::text[]),
  ('phul_4', 2, 'Lower Power', array['quads', 'hamstrings', 'glutes', 'calves', 'lower_back', 'abs', 'obliques']::text[]),
  ('phul_4', 3, 'Upper Hypertrophy', array['chest', 'lats', 'upper_back', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps']::text[]),
  ('phul_4', 4, 'Lower Hypertrophy', array['quads', 'hamstrings', 'glutes', 'calves', 'lower_back', 'abs', 'obliques']::text[]),
  ('hybrid_4', 1, 'Upper + Cardio', array['chest', 'lats', 'upper_back', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps']::text[]),
  ('hybrid_4', 2, 'Lower', array['quads', 'hamstrings', 'glutes', 'calves', 'lower_back', 'abs', 'obliques']::text[]),
  ('hybrid_4', 3, 'Full Body + Cardio', array['chest', 'lats', 'upper_back', 'side_delts', 'quads', 'hamstrings', 'glutes', 'abs']::text[]),
  ('hybrid_4', 4, 'Cardio + Core', array['abs', 'obliques']::text[]);
