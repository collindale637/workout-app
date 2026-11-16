"use client";

import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData } from "@/lib/db/provider";

/** How often the Today tab nudges you to log your weight. Kept on this phone (like the other small reminders). */
export type WeighInMode = "daily" | "weekly" | "off";

export const WEIGH_IN_LABELS: Record<WeighInMode, { name: string; blurb: string }> = {
  daily: { name: "Daily", blurb: "A reminder on Today until you've logged your weight for the day." },
  weekly: { name: "Weekly", blurb: "A reminder once it's been a week since your last weigh-in." },
  off: { name: "Off", blurb: "No reminder. You can still log your weight from Progress." },
};

const MODE_KEY = "weigh_in_mode";
const SKIP_KEY = "weigh_in_skip";

/** Whole days from one YYYY-MM-DD to another (local calendar days, so daylight saving can't skew it). */
export function daysBetween(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** "today", "yesterday", "3 days ago". */
export function agoLabel(days: number) {
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

/** Should the reminder show? `last` is the date of the most recent entry (null = never weighed in). */
export function weighInDue(o: { mode: WeighInMode; today: string; last: string | null; skippedOn: string | null }) {
  if (o.mode === "off" || o.skippedOn === o.today) return false;
  if (!o.last) return true;
  const gap = daysBetween(o.last, o.today);
  return o.mode === "daily" ? gap >= 1 : gap >= 7;
}

/** Reminder state for the Today tab. `undefined` while loading. */
export function useWeighIn(today: string | null) {
  const { db } = useData();
  const state = useLiveQuery(async () => {
    const mode = (await db.getMeta<WeighInMode>(MODE_KEY)) ?? "daily";
    const skippedOn = (await db.getMeta<string>(SKIP_KEY)) ?? null;
    const last = await db.body_metrics.orderBy("date").reverse().filter((r) => r.bodyweight !== null).first();
    return { mode, skippedOn, last: last ? { date: last.date, lb: Number(last.bodyweight) } : null };
  }, [db]);

  const skipToday = useCallback(async () => {
    if (today) await db.setMeta(SKIP_KEY, today);
  }, [db, today]);

  const setMode = useCallback((mode: WeighInMode) => db.setMeta(MODE_KEY, mode), [db]);

  const due = Boolean(state && today && weighInDue({ mode: state.mode, today, last: state.last?.date ?? null, skippedOn: state.skippedOn }));
  return { loaded: state !== undefined, mode: state?.mode ?? "daily", last: state?.last ?? null, due, skipToday, setMode };
}
