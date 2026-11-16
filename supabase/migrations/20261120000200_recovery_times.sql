-- Batch 5 training audit: faster, evidence-based recovery times (hours for fatigue to fall to ~37%).
-- Paired with F_MAX = 12 in src/lib/recovery.ts: a hard session reads fresh again after ~2 days (small
-- muscles), ~2.5 (chest, shoulders), ~3 (legs, back). Safe to re-run.
update public.muscles set recovery_tau_hours = case
  when id = 'lower_back' then 48
  when size_class = 'large' then 44
  when size_class = 'medium' then 36
  else 30
end;
