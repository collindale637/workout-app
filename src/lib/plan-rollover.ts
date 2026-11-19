"use client";

import { useEffect } from "react";
import { usePlanActions } from "@/lib/plans";
import { useActivePlan } from "@/lib/smart";

/**
 * Moves the active plan to its next week once every day of the current week is done or skipped. Runs on Today, so it
 * also catches a week finished on another phone or a workout finished while the app was closed.
 */
export function usePlanWeekRollover() {
  const plan = useActivePlan();
  const { advanceWeek } = usePlanActions();
  const id = plan?.plan.id;
  const full = Boolean(plan?.weekComplete && !plan.plan.completed_at);
  const week = plan?.week;
  useEffect(() => {
    if (id && full) void advanceWeek(id);
  }, [id, full, week, advanceWeek]);
}
