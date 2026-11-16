-- Batch 3: AI swaps and add-exercise suggestions are logged as their own request types. Safe to re-run.
alter table public.ai_requests drop constraint if exists ai_requests_type_check;
alter table public.ai_requests
  add constraint ai_requests_type_check check (type in ('plan', 'day', 'workout', 'edit', 'import', 'swap', 'suggest'));
