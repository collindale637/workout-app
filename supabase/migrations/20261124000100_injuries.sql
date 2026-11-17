-- "Anything to avoid?": body areas to go easy on, plus a short note the AI reads. Used to steer plans, swaps and
-- AI picks away from exercises that load those areas. Additive only, safe to re-run.
alter table public.profiles
  add column if not exists avoid_areas text[] not null default '{}',
  add column if not exists injury_note text;

alter table public.profiles drop constraint if exists profiles_avoid_areas_check;
alter table public.profiles
  add constraint profiles_avoid_areas_check
  check (avoid_areas <@ array['knees', 'lower_back', 'shoulders', 'elbows', 'wrists', 'hips', 'neck', 'ankles']::text[]);

alter table public.profiles drop constraint if exists profiles_injury_note_check;
alter table public.profiles
  add constraint profiles_injury_note_check check (injury_note is null or char_length(injury_note) <= 300);
