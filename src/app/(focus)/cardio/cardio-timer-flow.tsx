"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProfile, useSave } from "@/lib/db/provider";
import { newId } from "@/lib/db/dexie";
import { useCardioTimer } from "@/lib/cardio-timer";
import { CARDIO_TYPES, cardioElapsedSec, cardioLabel } from "@/lib/cardio";
import { useNow } from "@/lib/use-now";
import { formatDuration } from "@/lib/units";
import { CardioResultsForm } from "@/components/cardio-results";
import { PageHeader, btn } from "@/components/ui/kit";
import type { CardioType } from "@/lib/db/types";

/** Pick a cardio type → Start → Done → enter distance and the rest. The timer keeps going if you leave the screen. */
export function CardioTimerFlow({ workoutId }: { workoutId: string | null }) {
  const router = useRouter();
  const { profile } = useProfile();
  const save = useSave();
  const { timer, start, stop, clear } = useCardioTimer();
  const now = useNow(1000);
  const [type, setType] = useState<CardioType | null>(null);
  const units = profile?.units ?? "lb";

  // A timer started inside a workout runs in the workout's blue card.
  const belongsToWorkoutItem = Boolean(timer?.workoutId);
  useEffect(() => {
    if (belongsToWorkoutItem) router.replace("/workout");
  }, [belongsToWorkoutItem, router]);

  if (timer === undefined || belongsToWorkoutItem) return null;

  const discard = async () => {
    if (!confirm("Throw this cardio session away?")) return;
    await clear();
    router.back();
  };

  // 3. Done was tapped: how did it go?
  if (timer?.stoppedAt) {
    const t = timer;
    return (
      <main className="safe-top safe-bottom flex flex-col gap-4 px-5 pb-8">
        <PageHeader title={`${cardioLabel(t.type)} done`} />
        <p className="-mt-2 text-base font-semibold text-muted">
          {formatDuration(cardioElapsedSec(t, now))} on the clock. Add the rest, or leave it blank.
        </p>
        <CardioResultsForm
          key="results"
          type={t.type}
          units={units}
          initial={{ durationSec: cardioElapsedSec(t, now), startedAt: new Date(t.startedAt) }}
          submitLabel="Save cardio"
          onSubmit={async (r) => {
            const id = newId();
            await save("cardio_sessions", {
              id,
              workout_id: t.workoutId,
              workout_exercise_id: null,
              type: t.type,
              started_at: r.startedAt,
              duration_sec: r.durationSec,
              distance: r.distance,
              avg_hr: r.avgHr,
              rpe: r.rpe,
              intervals: null,
              notes: r.notes,
            });
            await clear();
            router.replace(t.workoutId ? "/workout" : `/progress/session?cardio=${id}`);
          }}
        >
          <button type="button" className={`${btn.ghost} text-danger`} onClick={discard}>Discard</button>
        </CardioResultsForm>
      </main>
    );
  }

  // 2. Running.
  if (timer) {
    return (
      <main className="safe-top safe-bottom flex min-h-dvh flex-col gap-4 px-5 pb-8">
        <PageHeader title={cardioLabel(timer.type)} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2" role="timer" aria-label="Elapsed time">
          <span className="text-xs font-bold tracking-[0.12em] text-muted">TIME</span>
          <span className="display num text-[96px] leading-none font-extrabold">{formatDuration(cardioElapsedSec(timer, now))}</span>
        </div>
        <button type="button" className={btn.primary} onClick={() => stop()}>Done</button>
        <button type="button" className={`${btn.ghost} text-danger`} onClick={discard}>Cancel session</button>
      </main>
    );
  }

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
            if (type) await start(type, { workoutId, wexId: null });
          }}
        >
          {type ? `Start ${cardioLabel(type).toLowerCase()}` : "Pick one to start"}
        </button>
        <Link href={manualHref} className={btn.ghost}>Log a past session instead</Link>
      </div>
    </main>
  );
}
