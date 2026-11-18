"use client";

import Link from "next/link";
import { useCardioTimer } from "@/lib/cardio-timer";
import { cardioLabel } from "@/lib/cardio";
import { cardioStartedFeedback } from "./today-cardio";
import type { CardioType } from "@/lib/db/types";

/** One tap starts a timer; the blue cardio card at the top of Today takes it from there. */
export const QUICK_CARDIO: CardioType[] = ["walk", "run", "bike", "elliptical"];

/** Colored top band per tile (UX spec 5.2). */
const BANDS: Record<string, string> = { walk: "var(--band-sky)", run: "var(--band-gold)", bike: "var(--good)", elliptical: "var(--text)" };

const ICONS: Record<string, React.ReactNode> = {
  walk: <path d="M12 8l-2 5 3 2 1 5M12 8l3 3 3 1M10 13l-3 3M13 6.3a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z" />,
  run: <path d="M13 8l-3 4 3 3-1 5M13 8l4 2 2 3M10 12l-4 1M14 6.3a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z" />,
  bike: <path d="M9.5 16a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM21.5 16a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM6 16l4-8h4l4 8M10 8l3 8" />,
  elliptical: <path d="M5 19h14M8 19l3-9M16 19l-3-9M11 10l-1-5M13 10l2-5" />,
};

export function QuickCardio() {
  const { timer, start } = useCardioTimer();
  const busy = Boolean(timer);
  return (
    <section aria-label="Quick cardio" className="flex flex-col">
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="display text-xl font-extrabold">Quick cardio</h2>
        <Link href="/cardio?manual=1" className="display flex min-h-11 items-center text-sm font-extrabold tracking-[0.06em] text-accent uppercase">
          Log past →
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {QUICK_CARDIO.map((t) => (
          <button
            key={t}
            type="button"
            disabled={busy}
            onClick={async () => {
              await start(t, { workoutId: null, wexId: null });
              cardioStartedFeedback();
            }}
            style={{ "--band": BANDS[t] } as React.CSSProperties}
            className="display flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-[14px] border-0 bg-card text-[15px] font-extrabold tracking-[0.03em] uppercase shadow-[inset_0_6px_0_var(--band),inset_0_0_0_2px_var(--border)] transition active:scale-95 disabled:opacity-50"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {ICONS[t]}
            </svg>
            {cardioLabel(t)}
          </button>
        ))}
      </div>
      {busy ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="display mt-2 flex min-h-12 items-center justify-center rounded-[20px] border-2 border-dashed border-line text-[15px] font-extrabold tracking-[0.04em] text-muted uppercase"
        >
          Cardio running · see top ↑
        </button>
      ) : (
        <Link
          href="/cardio"
          className="display mt-2 flex min-h-12 items-center justify-center rounded-[20px] border-2 border-dashed border-line text-[15px] font-extrabold tracking-[0.04em] text-muted uppercase"
        >
          Row · Stairs · Swim · HIIT · Other…
        </Link>
      )}
    </section>
  );
}
