-- Cardio inside a workout: the results of a planned cardio exercise (Start / Done) link back to it.
-- Additive only, safe to re-run.
alter table public.cardio_sessions
  add column if not exists workout_exercise_id uuid references public.workout_exercises (id) on delete cascade;

create index if not exists cardio_workout_exercise_idx on public.cardio_sessions (workout_exercise_id);

-- Same rule as the other child tables: you can only attach cardio to an exercise in your own workout.
drop policy if exists "owner all" on public.cardio_sessions;
create policy "owner all" on public.cardio_sessions for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (
      workout_exercise_id is null
      or exists (select 1 from public.workout_exercises w where w.id = workout_exercise_id and w.owner_id = (select auth.uid()))
    )
  );
