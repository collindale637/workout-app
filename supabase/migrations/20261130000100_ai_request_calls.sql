-- How many Claude calls each AI request took (Batch 21). A plan with changing weeks makes one call per written week,
-- and any answer that fails the app's checks is sent back once to fix, so this shows how often that retry runs.
-- Additive and safe to re-run. Old rows keep null (not recorded).
alter table public.ai_requests add column if not exists calls integer check (calls is null or calls >= 0);

-- Same function with one more argument, defaulted, so the app version before this one keeps working. The old
-- six-argument version is dropped first: two versions would make calls without p_calls ambiguous.
drop function if exists public.ai_log_request(text, text, integer, integer, numeric, boolean);

create or replace function public.ai_log_request(
  p_type text, p_model text, p_input_tokens integer, p_output_tokens integer, p_cost_usd numeric, p_ok boolean default true, p_calls integer default null
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
  insert into public.ai_requests (owner_id, type, model, input_tokens, output_tokens, cost_usd, ok, calls)
  values ((select auth.uid()), p_type, p_model, greatest(0, p_input_tokens), greatest(0, p_output_tokens), greatest(0, p_cost_usd), p_ok,
    case when p_calls is null then null else greatest(0, p_calls) end);
end;
$$;

revoke execute on function public.ai_log_request(text, text, integer, integer, numeric, boolean, integer) from public, anon;
grant execute on function public.ai_log_request(text, text, integer, integer, numeric, boolean, integer) to authenticated;
