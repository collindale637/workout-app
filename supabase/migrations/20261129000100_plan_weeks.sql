-- Plans up to 12 unique weeks that advance as you finish them (Batch 20b). Additive only, safe to re-run.
-- A plan day belongs to a week (existing days: week 1). A week with no days of its own reuses the latest earlier week
-- that has some, so a plan that repeats one week stores it once.
alter table public.plan_days
  add column if not exists week integer not null default 1 check (week between 1 and 12);

-- Progress lives on the plan so it syncs across phones. The week moves on when every day in it is done or skipped.
-- week_started_at null = the plan's start (start_date, else created_at). completed_at: the last week was finished.
-- completion_dismissed_at: "Skip for now" on the Plan complete screen. Existing plans start on week 1, as they are.
alter table public.plans
  add column if not exists current_week integer not null default 1 check (current_week between 1 and 52),
  add column if not exists week_started_at timestamptz,
  add column if not exists skipped_day_ids uuid[] not null default '{}',
  add column if not exists completed_at timestamptz,
  add column if not exists completion_dismissed_at timestamptz;
