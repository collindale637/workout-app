-- Treadmill incline on cardio sessions: percent grade, optional (walk and run only in the app).
-- Additive only, safe to re-run.
alter table public.cardio_sessions
  add column if not exists incline numeric(4,1);

alter table public.cardio_sessions drop constraint if exists cardio_sessions_incline_check;
alter table public.cardio_sessions
  add constraint cardio_sessions_incline_check check (incline is null or (incline >= 0 and incline <= 40));
