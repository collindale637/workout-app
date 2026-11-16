-- Batch 2: skip sets. Additive only, safe to re-run.
-- Which planned set slots (1 = first working set) were skipped in a workout. Logged sets fill the other slots in order.
alter table public.workout_exercises
  add column if not exists skipped_sets smallint[] not null default '{}';
