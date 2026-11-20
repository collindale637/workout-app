-- First-run tutorial: when this person finished or skipped it. Null = show it on the next open (after onboarding).
-- Stored on the account, not the phone, so it shows once per person. Additive only, safe to re-run.
alter table public.profiles add column if not exists tutorial_seen_at timestamptz;

comment on column public.profiles.tutorial_seen_at is 'When the first-run tutorial was finished or skipped. Replay it from More → Show tutorial.';
