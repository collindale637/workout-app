"use client";

import { useState } from "react";
import { useProfile } from "@/lib/db/provider";
import { agoLabel, daysBetween, useWeighIn } from "@/lib/weigh-in";
import { toDisplayWeight, weightUnit } from "@/lib/units";
import { BodyweightSheet } from "@/components/bodyweight-sheet";

/** A slim nudge on Today to log your weight. Logging (or Skip, for the day) makes it go away. */
export function WeighInCard({ today }: { today: string | null }) {
  const { profile } = useProfile();
  const { due, last, skipToday } = useWeighIn(today);
  const [open, setOpen] = useState(false);
  const units = profile?.units ?? "lb";
  if (!due && !open) return null;
  return (
    <>
      {due && (
        <section aria-label="Weigh-in reminder" className="flex min-h-16 items-center gap-3 rounded-[20px] border border-line bg-card py-2 pr-2 pl-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-accent-soft" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="4" /><path d="M8 9a4 4 0 0 1 8 0" /><path d="M12 9l2-2" /></svg>
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-base font-bold">Log your weight</span>
            <span className="truncate text-[13px] font-semibold text-muted">
              {last && today ? `${toDisplayWeight(last.lb, units)} ${weightUnit(units)} · ${agoLabel(daysBetween(last.date, today))}` : "Track your trend over time"}
            </span>
          </span>
          <button type="button" onClick={() => setOpen(true)} className="display h-11 shrink-0 rounded-full bg-primary px-4 text-base font-extrabold tracking-[0.06em] text-white uppercase">
            Log
          </button>
          <button type="button" onClick={skipToday} className="h-11 shrink-0 px-1.5 text-[13px] font-bold text-muted">
            Skip
          </button>
        </section>
      )}
      <BodyweightSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
