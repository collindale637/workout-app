"use client";

import type { WeekEndPrompt } from "@/lib/plan-weeks";

/** "Upper", "Upper and Lower", or "3 days": what the week still has open, in a sentence. */
export function openNames(open: { name: string }[]): string {
  if (open.length === 1) return open[0].name;
  if (open.length === 2) return `${open[0].name} and ${open[1].name}`;
  return `${open.length} days`;
}

/**
 * Today's prompt when a calendar week ends with plan days still open: skip them and start the next week, or keep the
 * week open. It only offers; nothing changes until a button is tapped.
 */
export function WeekEndCard({ prompt, busy, onSkip, onKeep }: { prompt: WeekEndPrompt; busy: boolean; onSkip: () => void; onKeep: () => void }) {
  const { week, total, done, skipped, days, open, lastWeek } = prompt;
  const names = openNames(open);
  const next = lastWeek ? "finish the plan" : `start Week ${week + 1}`;
  const countLine = skipped > 0 ? `${done} DONE · ${skipped} SKIPPED` : `${done} OF ${total} DAYS DONE`;
  const copy =
    open.length === 1
      ? `${names} is still open. Skip it to ${next}, or keep Week ${week} and do ${names} first.`
      : `${names} are still open. Skip them to ${next}, or keep Week ${week} and finish them first.`;
  const skipLabel = `Skip ${names} · ${lastWeek ? "Finish plan" : `Start Week ${week + 1}`}`;

  return (
    <section aria-label={`Week ${week} ended`} className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-bold tracking-[0.14em] text-accent-soft">WEEK {week} ENDED</span>
        <h2 className="display text-[32px] leading-none font-extrabold">{countLine}</h2>
      </div>
      <ul className="flex justify-between gap-1.5" aria-label="This plan week">
        {days.map((d) => (
          <li key={d.id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full ${
                d.state === "done" ? "bg-[var(--done)] text-[var(--done-ink)]" : d.state === "skipped" ? "bg-card-2 text-muted" : "border-2 border-dashed border-warn"
              }`}
            >
              {d.state === "done" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              ) : d.state === "skipped" ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 12h12" /></svg>
              ) : null}
            </span>
            <span className={`w-full truncate text-center text-[11px] font-bold tracking-[0.08em] uppercase ${d.state === "open" ? "text-warn" : "text-muted"}`}>
              {d.name}
              <span className="sr-only">{d.state === "done" ? ", done" : d.state === "skipped" ? ", skipped" : ", still open"}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[15px] leading-snug font-medium text-muted">{copy}</p>
      <button type="button" disabled={busy} onClick={onSkip} className="display flex h-[52px] items-center justify-center rounded-full bg-primary px-4 text-xl font-extrabold tracking-[0.03em] text-white active:translate-y-px disabled:opacity-50">
        <span className="truncate uppercase">{skipLabel}</span>
      </button>
      <button type="button" disabled={busy} onClick={onKeep} className="display flex h-12 items-center justify-center rounded-full border-2 border-line px-4 text-xl font-extrabold tracking-[0.03em] text-ink active:bg-card-2 disabled:opacity-50">
        KEEP WEEK {week}
      </button>
    </section>
  );
}

/** A short status bar above the tab bar with an Undo. */
export function UndoToast({ text, onUndo }: { text: string; onUndo: () => void }) {
  return (
    <div role="status" className="fixed inset-x-0 bottom-[calc(var(--nav-h)+8px)] z-30 mx-auto flex w-full max-w-md px-3">
      <div className="flex min-h-14 w-full items-center gap-2 rounded-2xl border border-line bg-card-2 py-1.5 pr-1.5 pl-4 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
        <span className="min-w-0 flex-1 text-sm leading-tight font-semibold">{text}</span>
        <button type="button" onClick={onUndo} className="display min-h-11 min-w-14 rounded-xl px-3 text-lg font-extrabold tracking-[0.04em] text-accent">
          UNDO
        </button>
      </div>
    </div>
  );
}
