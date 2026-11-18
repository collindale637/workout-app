"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCardioTimer } from "@/lib/cardio-timer";
import { CARDIO_TYPES, cardioLabel } from "@/lib/cardio";
import { PageHeader, btn } from "@/components/ui/kit";
import type { CardioType } from "@/lib/db/types";

/**
 * Pick a cardio type → Start. The timer itself lives in a blue card: on Today for quick cardio, or in the workout
 * when it belongs to one. There is no full-screen timer, so any running timer sends you to its card.
 */
export function CardioTimerFlow({ workoutId }: { workoutId: string | null }) {
  const router = useRouter();
  const { timer, start } = useCardioTimer();
  const [type, setType] = useState<CardioType | null>(null);

  const home = timer ? (timer.workoutId ? "/workout" : "/") : null;
  useEffect(() => {
    if (home) router.replace(home);
  }, [home, router]);

  if (timer === undefined || timer) return null;

  // 1. Choose what you're doing.
  const manualHref = `/cardio?manual=1${workoutId ? `&workout=${workoutId}` : ""}`;
  return (
    <main className="safe-top safe-bottom flex min-h-dvh flex-col gap-4 px-5 pb-8">
      <PageHeader title="Cardio" right={<button type="button" className={btn.ghost} onClick={() => router.back()}>Cancel</button>} />
      <p className="-mt-2 text-base font-semibold text-muted">What are you doing?</p>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Cardio type">
        {CARDIO_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={type === t.id}
            onClick={() => setType(t.id)}
            className={`display flex h-20 items-center justify-center rounded-2xl border-2 text-xl font-extrabold tracking-[0.04em] ${
              type === t.id ? "border-accent-strong bg-primary/15 text-accent-soft" : "border-line bg-card-2 text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <button
          type="button"
          disabled={!type}
          className={btn.primary}
          onClick={async () => {
            if (!type) return;
            await start(type, { workoutId, wexId: null });
            if (!workoutId && "vibrate" in navigator) navigator.vibrate?.(30);
          }}
        >
          {type ? `Start ${cardioLabel(type).toLowerCase()}` : "Pick one to start"}
        </button>
        <Link href={manualHref} className={btn.ghost}>Log a past session instead</Link>
      </div>
    </main>
  );
}
