"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useActivePlan } from "@/lib/smart";
import { usePlanActions } from "@/lib/plans";
import { useProgressData } from "@/lib/progress-data";
import { prEvents } from "@/lib/progress";
import { planRunStats } from "@/lib/plan-weeks";
import { btn } from "@/components/ui/kit";

export const TrophyIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
  </svg>
);

/** Shown on Today once the plan's last week is finished: Restart, Choose a new plan, or Skip for now. */
export function PlanComplete() {
  const plan = useActivePlan();
  const data = useProgressData();
  const actions = usePlanActions();
  const stats = useMemo(() => {
    if (!plan || !data) return null;
    const s = planRunStats(plan.plan, plan.allDays, data.workouts.map((w) => ({ id: w.id, plan_day_id: w.plan_day_id, ended_at: w.ended_at })));
    // New PRs: records set in this plan's workouts.
    const prs = prEvents(data.sessions).filter((e) => s.workoutIds.has(e.workoutId)).length;
    return { ...s, prs };
  }, [plan, data]);
  if (!plan) return null;
  const { plan: p, length } = plan;
  const weeks = length ?? plan.week;

  return (
    <main className="mt-4 flex min-h-[calc(100dvh-10rem)] flex-col items-center gap-5 pt-6">
      <span className="flex h-24 w-24 items-center justify-center rounded-full bg-gold-soft text-gold">
        <TrophyIcon size={52} />
      </span>
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-[13px] font-bold tracking-[0.12em] text-gold">PLAN COMPLETE</span>
        <h1 className="display text-[40px] leading-[1.02] font-extrabold uppercase">{p.name}</h1>
        <p className="text-[15px] font-medium text-muted">You finished all {weeks} weeks.</p>
      </div>
      <div className="grid w-full grid-cols-3 gap-2">
        {[
          { n: stats?.workouts, label: "WORKOUTS", gold: false },
          { n: stats?.skipped, label: "SKIPPED", gold: false },
          { n: stats?.prs, label: "NEW PRS", gold: true },
        ].map((x) => (
          <div key={x.label} className="flex flex-col items-center gap-0.5 rounded-2xl border border-line bg-card px-1.5 py-3">
            <span className={`display num text-3xl font-extrabold ${x.gold ? "text-gold" : ""}`}>{x.n ?? "–"}</span>
            <span className="text-xs font-bold tracking-[0.06em] text-muted">{x.label}</span>
          </div>
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex w-full flex-col gap-2.5">
        <button type="button" className={btn.primary} onClick={() => void actions.restart(p.id)}>Restart this plan</button>
        <p className="-mt-1 text-center text-[13px] font-medium text-muted">Back to week 1. Your history and PRs stay.</p>
        <Link
          href="/plan"
          className={btn.secondary}
          onClick={() => void actions.dismissComplete(p.id, true)}
        >
          Choose a new plan
        </Link>
        <button type="button" className={`${btn.ghost} w-full`} onClick={() => void actions.dismissComplete(p.id, true)}>Skip for now</button>
      </div>
    </main>
  );
}

/** Today's slim row after "Skip for now": tap to bring the Plan complete screen back. */
export function PlanFinishedRow() {
  const plan = useActivePlan();
  const actions = usePlanActions();
  if (!plan) return null;
  return (
    <button
      type="button"
      onClick={() => void actions.dismissComplete(plan.plan.id, false)}
      className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-line bg-card px-3.5 text-left"
    >
      <span className="text-gold"><TrophyIcon /></span>
      <span className="flex-1 text-[15px] font-semibold">Plan finished. Restart it or pick a new one.</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="shrink-0 text-muted" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );
}
