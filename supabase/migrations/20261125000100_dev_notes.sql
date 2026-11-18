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

-- Marked done from the inbox.
alter table public.dev_notes add column if not exists done_at timestamptz;

-- ---- The inbox: only app admins (Collin) can see everyone's notes ----
-- Who is an admin. RLS on with no policies, so nobody can read or change it through the API; rows are added by hand
-- in the SQL editor (insert into public.app_admins (user_id) values ('<uuid>');). The functions below check it.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()));
$$;

-- Every note with who sent it. Raises for anyone who isn't an admin.
create or replace function public.dev_notes_inbox()
returns table (id uuid, body text, app_version text, device text, created_at timestamptz, done_at timestamptz, sender text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.app_admins a where a.user_id = (select auth.uid())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select n.id, n.body, n.app_version, n.device, n.created_at, n.done_at, coalesce(p.display_name, 'Someone')
    from public.dev_notes n left join public.profiles p on p.id = n.owner_id
    order by n.created_at desc
    limit 500;
end;
$$;

create or replace function public.dev_note_set_done(note_id uuid, done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.app_admins a where a.user_id = (select auth.uid())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.dev_notes set done_at = case when done then now() else null end where id = note_id;
end;
$$;

revoke execute on function public.is_app_admin() from public, anon;
revoke execute on function public.dev_notes_inbox() from public, anon;
revoke execute on function public.dev_note_set_done(uuid, boolean) from public, anon;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.dev_notes_inbox() to authenticated;
grant execute on function public.dev_note_set_done(uuid, boolean) to authenticated;
