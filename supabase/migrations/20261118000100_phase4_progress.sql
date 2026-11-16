-- Phase 4: progress and polish. Additive only, safe to re-run.

-- How much cardio to add on its own (onboarding + Profile):
--   none = only on days that ask for it ("+ Cardio", "Cardio + Core")
--   auto = what the goal calls for (fat loss most days, general fitness on longer sessions)
--   more = a cardio block on every lifting day
alter table public.profiles
  add column if not exists cardio_pref text not null default 'auto';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_cardio_pref_check') then
    alter table public.profiles
      add constraint profiles_cardio_pref_check check (cardio_pref in ('none', 'auto', 'more'));
  end if;
end $$;

-- Bodyweight log: one entry per person per day (the app reuses the day's row when you log twice).
comment on column public.body_metrics.bodyweight is 'Pounds (lb).';

-- Three no-equipment exercises so a bodyweight-only gym can still build pull and shoulder days
-- (also in scripts/catalog-data.mjs → the generated catalog seed; repeated here for databases that already ran it).
insert into public.exercises (id, name, aliases, category, movement_pattern, mechanic, force, level, instructions, images, is_common, is_active, source) values
  ('Doorframe_Row', 'Doorframe Row', '{}', 'strength', 'horizontal_pull', 'compound', 'pull', 'beginner',
   array['Stand in a doorway and grip both sides of the frame at chest height, feet close to the threshold.', 'Lean back with straight arms and a straight body.', 'Pull your chest to the frame by squeezing your shoulder blades, then lower slowly. Walk your feet further in to make it harder.'], '{}', true, true, 'catalog'),
  ('Pike_Push_Up', 'Pike Push-Up', '{}', 'strength', 'vertical_push', 'compound', 'push', 'beginner',
   array['Start in a push-up position, then walk your feet in and lift your hips so your body makes an upside-down V.', 'Bend your elbows to lower the top of your head toward the floor just in front of your hands.', 'Press back up. Raise your feet on a step or chair to make it harder.'], '{}', true, true, 'catalog'),
  ('Prone_Y_T_W_Raise', 'Prone Y-T-W Raise', '{}', 'strength', 'isolation', 'isolation', 'pull', 'beginner',
   array['Lie face down with your arms overhead in a Y, thumbs up.', 'Lift your arms off the floor by squeezing your shoulder blades, hold a second, and lower.', 'Repeat with arms straight out to the sides (T), then elbows bent and pulled to your ribs (W). One Y, T and W is one rep.'], '{}', true, true, 'catalog')
on conflict (id) do update set name = excluded.name, category = excluded.category, movement_pattern = excluded.movement_pattern,
  mechanic = excluded.mechanic, force = excluded.force, level = excluded.level, instructions = excluded.instructions,
  is_common = excluded.is_common, is_active = excluded.is_active, source = excluded.source;

delete from public.exercise_muscles where exercise_id in ('Doorframe_Row', 'Pike_Push_Up', 'Prone_Y_T_W_Raise');
insert into public.exercise_muscles (exercise_id, muscle_id, role) values
  ('Doorframe_Row', 'upper_back', 'primary'), ('Doorframe_Row', 'lats', 'primary'),
  ('Doorframe_Row', 'biceps', 'secondary'), ('Doorframe_Row', 'rear_delts', 'secondary'),
  ('Pike_Push_Up', 'front_delts', 'primary'), ('Pike_Push_Up', 'triceps', 'secondary'), ('Pike_Push_Up', 'side_delts', 'secondary'),
  ('Prone_Y_T_W_Raise', 'rear_delts', 'primary'), ('Prone_Y_T_W_Raise', 'upper_back', 'primary'), ('Prone_Y_T_W_Raise', 'traps', 'secondary');
