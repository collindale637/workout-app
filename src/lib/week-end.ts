"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData } from "@/lib/db/provider";
import { useActivePlan, type ActivePlan } from "@/lib/smart";
import { missedFromWeek, sundayKey, weekEndPrompt, type WeekEndKept } from "@/lib/plan-weeks";

const KEY = "weekEndKept";
const noop = () => () => {};

/** Today's date at local midnight; null while prerendering so the static shell stays static. */
export function useToday(): Date | null {
  const key = useSyncExternalStore(noop, () => new Date().toDateString(), () => null);
  return useMemo(() => (key ? new Date(key) : null), [key]);
}

/** The plan's week as the pure week rules want it. */
export const progressOf = (a: ActivePlan) => ({
  week: a.week, length: a.length, lastWeek: a.length !== null && a.week >= a.length, days: a.days, done: a.doneThisWeek, skipped: a.skippedThisWeek, weekComplete: a.weekComplete,
});

/** The week-end prompt for Today, and the "Keep Week N" answer (kept on this phone until the next Sunday). */
export function useWeekEnd() {
  const { db } = useData();
  const plan = useActivePlan();
  const today = useToday();
  const kept = useLiveQuery(async () => (await db.getMeta<WeekEndKept>(KEY)) ?? null, [db]);
  const prompt = useMemo(
    () => (plan && today && kept !== undefined ? weekEndPrompt(plan.plan, progressOf(plan), today, kept) : null),
    [plan, today, kept],
  );
  const planId = plan?.plan.id ?? null;
  const week = plan?.week ?? 1;
  const keep = useCallback(async () => {
    if (planId && today) await db.setMeta(KEY, { planId, week, sunday: sundayKey(today) } satisfies WeekEndKept);
  }, [db, planId, week, today]);
  const unkeep = useCallback(() => db.setMeta(KEY, null), [db]);
  return { prompt, planId, keep, unkeep };
}

/** The week to name in "Missed from Week N" on Up next, or null. */
export function useMissedFromWeek(): number | null {
  const plan = useActivePlan();
  const today = useToday();
  return plan && today ? missedFromWeek(plan.plan, progressOf(plan), today) : null;
}
