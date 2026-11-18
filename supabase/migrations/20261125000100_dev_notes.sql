-- "Note to developer" (More tab): bugs and ideas from the family. Everyone adds and reads only their own notes;
-- Collin reads them all in the Supabase dashboard (Claude can read them too, before planning a batch).
-- Written on the phone first and uploaded by sync like everything else. Additive only, safe to re-run.
create table if not exists public.dev_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  device text check (device is null or char_length(device) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dev_notes_created_idx on public.dev_notes (created_at desc);

alter table public.dev_notes enable row level security;

drop policy if exists "owner all" on public.dev_notes;
create policy "owner all" on public.dev_notes for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

comment on table public.dev_notes is 'Bugs and ideas sent from the More tab. Read them all in the dashboard (service role).';
