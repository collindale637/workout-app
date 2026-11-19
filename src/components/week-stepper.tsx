"use client";

import type { ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

/** How a week's square looks: "strong" = its own workouts, "plain" = repeats the week before, "done" / "current" = progress. */
export type WeekTone = "strong" | "plain" | "done" | "current";

const TONE: Record<WeekTone, string> = {
  strong: "bg-primary/25 border-primary/60 text-ink",
  plain: "bg-card-2 border-transparent text-muted",
  done: "bg-good border-transparent text-black",
  current: "bg-primary border-transparent text-white",
};

/**
 * "Week 3 of 8" with arrows, plus one square per week to jump straight to it (Batch 20). Used by the AI plan preview
 * and the Plan tab.
 */
export function WeekStepper({
  week, length, onPick, status, statusClass = "text-muted", tones, labels, legend,
}: {
  week: number;
  length: number;
  onPick: (week: number) => void;
  status?: ReactNode;
  statusClass?: string;
  /** One per week, 1…length. */
  tones: WeekTone[];
  /** Screen-reader label per square ("Week 3, different workouts"). */
  labels?: string[];
  legend?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5 rounded-3xl border border-line bg-card px-3 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Previous week" disabled={week <= 1} onClick={() => onPick(week - 1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-card-2 text-accent disabled:opacity-35">
          <ChevronLeftIcon />
        </button>
        <div className="flex min-w-0 flex-col items-center">
          <span className="display text-2xl font-extrabold tracking-[0.04em]" aria-live="polite">WEEK {week} OF {length}</span>
          {status && <span className={`text-[13px] font-bold ${statusClass}`}>{status}</span>}
        </div>
        <button type="button" aria-label="Next week" disabled={week >= length} onClick={() => onPick(week + 1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-card-2 text-accent disabled:opacity-35">
          <ChevronRightIcon />
        </button>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
        {tones.slice(0, length).map((tone, i) => (
          <button
            key={i}
            type="button"
            aria-label={labels?.[i] ?? `Week ${i + 1}`}
            aria-current={week === i + 1 ? "true" : undefined}
            onClick={() => onPick(i + 1)}
            className={`display num h-11 rounded-lg border-2 text-[15px] font-extrabold ${TONE[tone]} ${week === i + 1 ? "outline-2 outline-offset-1 outline-ink" : ""}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {legend}
    </section>
  );
}
