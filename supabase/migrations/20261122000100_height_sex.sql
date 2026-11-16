-- Height and sex on the profile, used to suggest starting weights for lifts you haven't done yet.
-- Height is stored in inches (like weights in lb); sex is optional (null = prefer not to say).
-- Additive only, safe to re-run.
alter table public.profiles
  add column if not exists height_in numeric(4,1),
  add column if not exists sex text;

alter table public.profiles drop constraint if exists profiles_height_in_check;
alter table public.profiles
  add constraint profiles_height_in_check check (height_in is null or (height_in >= 40 and height_in <= 100));

alter table public.profiles drop constraint if exists profiles_sex_check;
alter table public.profiles
  add constraint profiles_sex_check check (sex is null or sex in ('male', 'female'));
