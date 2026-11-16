-- Phase 1: logging. Additive only, safe to re-run.
alter table public.workouts add column if not exists name text;

alter table public.workout_exercises
  add column if not exists notes text,
  add column if not exists target_sets integer check (target_sets between 1 and 20),
  add column if not exists rep_min integer check (rep_min > 0),
  add column if not exists rep_max integer check (rep_max > 0),
  add column if not exists rest_sec integer check (rest_sec >= 0);

alter table public.profiles add column if not exists onboarded_at timestamptz;

alter table public.cardio_sessions add column if not exists notes text;

-- Units: stored canonically; the app converts for display.
comment on column public.sets.weight is 'Pounds (lb). Null = bodyweight / no load.';
comment on column public.cardio_sessions.distance is 'Miles.';
