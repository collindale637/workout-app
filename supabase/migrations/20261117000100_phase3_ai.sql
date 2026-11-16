-- Phase 3: AI. Additive only, safe to re-run.

-- AI-built and imported plans keep a short overview and how they progress week to week.
alter table public.plans add column if not exists notes text;

-- The AI usage log is written by the server through these two functions, so people can't edit
-- their own usage (the table itself stays read-only to them).
alter table public.ai_requests add column if not exists ok boolean not null default true;

create or replace function public.ai_log_request(
  p_type text, p_model text, p_input_tokens integer, p_output_tokens integer, p_cost_usd numeric, p_ok boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  insert into public.ai_requests (owner_id, type, model, input_tokens, output_tokens, cost_usd, ok)
  values ((select auth.uid()), p_type, p_model, greatest(0, p_input_tokens), greatest(0, p_output_tokens), greatest(0, p_cost_usd), p_ok);
end;
$$;

-- This month's AI spend (UTC calendar month): the whole household's (the monthly cap is shared,
-- since everyone uses the same API key) and your own.
create or replace function public.ai_spend_this_month()
returns table (household_usd numeric, mine_usd numeric, my_requests integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(r.cost_usd), 0),
    coalesce(sum(r.cost_usd) filter (where r.owner_id = (select auth.uid())), 0),
    (count(*) filter (where r.owner_id = (select auth.uid())))::integer
  from public.ai_requests r
  where r.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
    and (select auth.uid()) is not null;
$$;

revoke execute on function public.ai_log_request(text, text, integer, integer, numeric, boolean) from public, anon;
revoke execute on function public.ai_spend_this_month() from public, anon;
grant execute on function public.ai_log_request(text, text, integer, integer, numeric, boolean) to authenticated;
grant execute on function public.ai_spend_this_month() to authenticated;
