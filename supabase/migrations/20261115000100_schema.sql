-- Workout app — Phase 0 schema
-- Catalog tables (muscles, equipment, exercises, splits) are shared and read-only for users,
-- except custom exercises, which belong to the person who made them.
-- Every personal table has row-level security: people only ever see their own rows.
-- Ids for personal rows are UUIDs the phone can create offline (Phase 1 sync).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table public.muscles (
  id text primary key,                         -- e.g. 'chest', 'side_delts'
  name text not null,
  region text not null check (region in ('front', 'back')),
  size_class text not null check (size_class in ('small', 'medium', 'large')),
  recovery_tau_hours integer not null check (recovery_tau_hours > 0),
  sort_order integer not null default 0
);

create table public.equipment (
  id text primary key,                         -- e.g. 'barbell', 'adjustable_bench'
  name text not null,
  category text not null check (category in (
    'free_weights', 'benches_racks', 'machines', 'cables', 'bodyweight', 'cardio', 'accessories'
  )),
  icon text,
  sort_order integer not null default 0,
  -- Shown in the gym checklist's "home" template by default.
  common_at_home boolean not null default false
);

create table public.exercises (
  id text primary key default ('custom_' || replace(gen_random_uuid()::text, '-', '')),
  name text not null,
  aliases text[] not null default '{}',
  category text not null default 'strength' check (category in (
    'strength', 'powerlifting', 'olympic_weightlifting', 'strongman', 'plyometrics', 'stretching', 'cardio'
  )),
  movement_pattern text check (movement_pattern in (
    'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull',
    'squat', 'hinge', 'lunge', 'carry', 'core', 'isolation', 'cardio', 'mobility', 'other'
  )),
  mechanic text check (mechanic in ('compound', 'isolation')),
  force text check (force in ('push', 'pull', 'static')),
  level text not null default 'beginner' check (level in ('beginner', 'intermediate', 'expert')),
  instructions text[] not null default '{}',
  images text[] not null default '{}',          -- paths relative to NEXT_PUBLIC_EXERCISE_IMAGE_BASE
  -- Popular lifts get picked first by the generator and were spot-checked by hand.
  is_common boolean not null default false,
  source text not null default 'free-exercise-db',
  owner_id uuid references auth.users (id) on delete cascade,  -- null = shared catalog
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index exercises_owner_idx on public.exercises (owner_id);
create index exercises_name_idx on public.exercises (lower(name));

create table public.exercise_muscles (
  exercise_id text not null references public.exercises (id) on delete cascade,
  muscle_id text not null references public.muscles (id),
  role text not null check (role in ('primary', 'secondary')),
  primary key (exercise_id, muscle_id)
);
create index exercise_muscles_muscle_idx on public.exercise_muscles (muscle_id, role);

-- What an exercise needs. Rows that share an option_group are alternatives (any one will do);
-- every group must be satisfied. An exercise with no rows needs no equipment.
create table public.exercise_equipment (
  exercise_id text not null references public.exercises (id) on delete cascade,
  option_group smallint not null default 1,
  equipment_id text not null references public.equipment (id),
  primary key (exercise_id, option_group, equipment_id)
);
create index exercise_equipment_equipment_idx on public.exercise_equipment (equipment_id);

create table public.splits (
  id text primary key,                         -- e.g. 'ppl_6'
  name text not null,
  days_per_week integer not null check (days_per_week between 1 and 7),
  description text not null default '',
  sort_order integer not null default 0
);

create table public.split_days (
  id uuid primary key default gen_random_uuid(),
  split_id text not null references public.splits (id) on delete cascade,
  day_order integer not null,
  name text not null,
  target_muscle_ids text[] not null default '{}',
  unique (split_id, day_order)
);

-- ---------------------------------------------------------------------------
-- Setup (personal)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  units text not null default 'lb' check (units in ('lb', 'kg')),
  goal text not null default 'hypertrophy' check (goal in ('strength', 'hypertrophy', 'fat_loss', 'general')),
  experience text not null default 'intermediate' check (experience in ('beginner', 'intermediate', 'advanced')),
  days_per_week integer not null default 4 check (days_per_week between 1 and 7),
  session_minutes integer not null default 60 check (session_minutes between 10 and 240),
  -- Used for any set whose RPE is left blank.
  default_rpe numeric(3,1) not null default 8 check (default_rpe between 5 and 10),
  active_gym_id uuid,                          -- FK added after gyms exists
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  template text check (template in ('commercial', 'home', 'hotel', 'bodyweight', 'custom')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gyms_owner_idx on public.gyms (owner_id);
create unique index gyms_one_default_per_owner on public.gyms (owner_id) where is_default;

alter table public.profiles
  add constraint profiles_active_gym_fk foreign key (active_gym_id) references public.gyms (id) on delete set null;

create table public.gym_equipment (
  gym_id uuid not null references public.gyms (id) on delete cascade,
  equipment_id text not null references public.equipment (id),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- e.g. {"dumbbell_min": 5, "dumbbell_max": 50, "dumbbell_step": 5, "plate_increment": 2.5, "stack_max": 200}
  details jsonb not null default '{}',
  primary key (gym_id, equipment_id)
);

create table public.exercise_prefs (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id text not null references public.exercises (id) on delete cascade,
  favorite boolean not null default false,
  excluded boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner_id, exercise_id)
);

-- ---------------------------------------------------------------------------
-- Training (personal)
-- ---------------------------------------------------------------------------

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  goal text check (goal in ('strength', 'hypertrophy', 'fat_loss', 'general')),
  split_id text references public.splits (id),
  start_date date,
  weeks integer check (weeks between 1 and 52),
  source text not null default 'generated' check (source in ('generated', 'ai', 'imported', 'manual')),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plans_owner_idx on public.plans (owner_id);
create unique index plans_one_active_per_owner on public.plans (owner_id) where is_active;

create table public.plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day_order integer not null,
  name text not null,
  gym_id uuid references public.gyms (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index plan_days_plan_idx on public.plan_days (plan_id);

create table public.plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.plan_days (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id text not null references public.exercises (id),
  sort_order integer not null default 0,
  sets integer not null default 3 check (sets between 1 and 20),
  rep_min integer check (rep_min > 0),
  rep_max integer check (rep_max > 0),
  rest_sec integer check (rest_sec >= 0),
  superset_group smallint,
  notes text,
  updated_at timestamptz not null default now(),
  check (rep_max is null or rep_min is null or rep_max >= rep_min)
);
create index plan_exercises_day_idx on public.plan_exercises (plan_day_id);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  gym_id uuid references public.gyms (id) on delete set null,
  plan_day_id uuid references public.plan_days (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  source text not null default 'generated' check (source in ('plan', 'generated', 'ai', 'manual', 'imported')),
  updated_at timestamptz not null default now()
);
create index workouts_owner_started_idx on public.workouts (owner_id, started_at desc);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id text not null references public.exercises (id),
  sort_order integer not null default 0,
  superset_group smallint,
  updated_at timestamptz not null default now()
);
create index workout_exercises_workout_idx on public.workout_exercises (workout_id);
create index workout_exercises_owner_exercise_idx on public.workout_exercises (owner_id, exercise_id);

create table public.sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  set_no integer not null check (set_no > 0),
  type text not null default 'working' check (type in ('warmup', 'working', 'drop')),
  weight numeric(6,2) check (weight >= 0),     -- in the person's units at the time; null = bodyweight
  reps integer check (reps >= 0),
  rpe numeric(3,1) check (rpe between 1 and 10), -- null = use profiles.default_rpe
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sets_workout_exercise_idx on public.sets (workout_exercise_id);
create index sets_owner_completed_idx on public.sets (owner_id, completed_at desc);

create table public.cardio_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_id uuid references public.workouts (id) on delete set null,
  type text not null,                          -- 'run', 'bike', 'row', 'walk', 'elliptical', 'stairs', 'swim', 'other'
  started_at timestamptz not null default now(),
  duration_sec integer not null check (duration_sec > 0),
  distance numeric(7,2) check (distance >= 0), -- miles or km, per profile units
  avg_hr integer check (avg_hr between 30 and 250),
  rpe numeric(3,1) check (rpe between 1 and 10),
  intervals jsonb,
  updated_at timestamptz not null default now()
);
create index cardio_owner_started_idx on public.cardio_sessions (owner_id, started_at desc);

create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null default current_date,
  bodyweight numeric(5,1) check (bodyweight > 0),
  updated_at timestamptz not null default now(),
  unique (owner_id, date)
);

create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('plan', 'day', 'workout', 'edit', 'import')),
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10,5) not null default 0,
  created_at timestamptz not null default now()
);
create index ai_requests_owner_created_idx on public.ai_requests (owner_id, created_at desc);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'gyms', 'exercise_prefs', 'plans', 'plan_days', 'plan_exercises',
    'workouts', 'workout_exercises', 'sets', 'cardio_sessions', 'body_metrics'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- New accounts: invite someone in Supabase (Authentication → Users → Invite) and
-- their profile row appears automatically.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.muscles enable row level security;
alter table public.equipment enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_muscles enable row level security;
alter table public.exercise_equipment enable row level security;
alter table public.splits enable row level security;
alter table public.split_days enable row level security;
alter table public.profiles enable row level security;
alter table public.gyms enable row level security;
alter table public.gym_equipment enable row level security;
alter table public.exercise_prefs enable row level security;
alter table public.plans enable row level security;
alter table public.plan_days enable row level security;
alter table public.plan_exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.sets enable row level security;
alter table public.cardio_sessions enable row level security;
alter table public.body_metrics enable row level security;
alter table public.ai_requests enable row level security;

-- Catalog: any signed-in person can read; only the database owner/service role seeds it.
create policy "catalog read" on public.muscles for select to authenticated using (true);
create policy "catalog read" on public.equipment for select to authenticated using (true);
create policy "catalog read" on public.splits for select to authenticated using (true);
create policy "catalog read" on public.split_days for select to authenticated using (true);

-- Exercises: shared catalog plus your own custom ones.
create policy "read catalog and own" on public.exercises for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "create own custom" on public.exercises for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "edit own custom" on public.exercises for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "delete own custom" on public.exercises for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "read visible" on public.exercise_muscles for select to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id
                 and (e.owner_id is null or e.owner_id = (select auth.uid()))));
create policy "write own custom" on public.exercise_muscles for all to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())));

create policy "read visible" on public.exercise_equipment for select to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id
                 and (e.owner_id is null or e.owner_id = (select auth.uid()))));
create policy "write own custom" on public.exercise_equipment for all to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())));

-- Profiles: read and edit only your own. Rows are created by the trigger above.
create policy "own profile read" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Top-level personal tables: owner only.
do $$
declare t text;
begin
  foreach t in array array['gyms', 'exercise_prefs', 'plans', 'workouts', 'cardio_sessions', 'body_metrics'] loop
    execute format(
      'create policy "owner all" on public.%I for all to authenticated
         using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- AI log: people can read their own usage; rows are written by the server.
create policy "owner read" on public.ai_requests for select to authenticated
  using (owner_id = (select auth.uid()));

-- Child tables: owner only, and the parent must be yours too.
create policy "owner all" on public.gym_equipment for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.gyms g where g.id = gym_id and g.owner_id = (select auth.uid())));

create policy "owner all" on public.plan_days for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.plans p where p.id = plan_id and p.owner_id = (select auth.uid())));

create policy "owner all" on public.plan_exercises for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.plan_days d where d.id = plan_day_id and d.owner_id = (select auth.uid())));

create policy "owner all" on public.workout_exercises for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.workouts w where w.id = workout_id and w.owner_id = (select auth.uid())));

create policy "owner all" on public.sets for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.workout_exercises we where we.id = workout_exercise_id and we.owner_id = (select auth.uid())));

-- A profile's active gym must be one of your gyms.
create or replace function public.check_active_gym()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active_gym_id is not null and not exists (
    select 1 from public.gyms g where g.id = new.active_gym_id and g.owner_id = new.id
  ) then
    raise exception 'active_gym_id must be one of your own gyms';
  end if;
  return new;
end;
$$;

create trigger profiles_check_active_gym
  before insert or update of active_gym_id on public.profiles
  for each row execute function public.check_active_gym();

-- Signed-out visitors get nothing.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Storage: public bucket for exercise pictures (read by anyone, written by the service role)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('exercise-images', 'exercise-images', true)
on conflict (id) do nothing;
