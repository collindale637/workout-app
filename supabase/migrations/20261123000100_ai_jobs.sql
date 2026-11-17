-- AI plan builds as server-side jobs, so leaving the screen (or locking the phone) doesn't lose the request.
-- The server starts a job, finishes it on its own, and stores the answer here; the phone picks it up when it
-- comes back. Additive only, safe to re-run.
create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('plan', 'edit')),
  -- Which screen asked: the plan being edited, or null for a brand-new plan.
  ref text,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  -- The same JSON the AI route returns directly (an AiResponse): the draft plan, or the error.
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_jobs_owner_created_idx on public.ai_jobs (owner_id, created_at desc);

alter table public.ai_jobs enable row level security;

drop policy if exists "owner read" on public.ai_jobs;
create policy "owner read" on public.ai_jobs for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "owner insert" on public.ai_jobs;
create policy "owner insert" on public.ai_jobs for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "owner update" on public.ai_jobs;
create policy "owner update" on public.ai_jobs for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "owner delete" on public.ai_jobs;
create policy "owner delete" on public.ai_jobs for delete to authenticated using (owner_id = (select auth.uid()));

-- A server restart or timeout can leave a job "running" forever; treat anything running for over 10 minutes as failed.
create or replace function public.ai_jobs_expire()
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.ai_jobs
  set status = 'failed', result = '{"ok": false, "error": "That took too long and was stopped. Try again."}'::jsonb, updated_at = now()
  where owner_id = (select auth.uid()) and status = 'running' and created_at < now() - interval '10 minutes';
$$;
revoke execute on function public.ai_jobs_expire() from public, anon;
grant execute on function public.ai_jobs_expire() to authenticated;
