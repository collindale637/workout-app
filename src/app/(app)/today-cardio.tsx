"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useProfile, useSave } from "@/lib/db/provider";
import { newId } from "@/lib/db/dexie";
import { useCardioTimer } from "@/lib/cardio-timer";
import { cardioLabel } from "@/lib/cardio";
import { useNow } from "@/lib/use-now";
import { CardioPanel } from "@/app/(focus)/workout/cardio-panel";

const noop = () => {};

/**
 * Quick cardio on Today: the same blue card the workout uses (WALK · RUNNING, time, Done / ✕), then results right
 * in the card. Timers started inside a workout stay with the workout (Today shows a banner for those instead).
 */
export function TodayCardio() {
  const { timer, stop, resume, clear } = useCardioTimer();
  const { profile } = useProfile();
  const save = useSave();
  const now = useNow(1000);
  const [saved, setSaved] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), 6000);
    return () => clearTimeout(t);
  }, [saved]);

  const toast = saved && (
    <Link
      href={`/progress/session?cardio=${saved.id}&from=today`}
      role="status"
      className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-good/15 px-4 text-[15px] font-bold text-good"
    >
      <span>✓ {saved.label} saved</span>
      <span className="display text-sm font-extrabold tracking-[0.06em]">VIEW →</span>
    </Link>
  );

  if (!timer || timer.workoutId || !profile) return toast || null;

  const discard = async () => {
    if (!confirm("Throw this cardio session away?")) return;
    await clear();
  };

  return (
    <section
      id="today-cardio"
      aria-label="Cardio timer"
      className="animate-[cardio-in_0.35s_ease-out] scroll-mt-4 rounded-[28px] bg-primary px-5 py-[18px] text-white shadow-[0_10px_30px_rgba(31,75,255,0.25)]"
    >
      <CardioPanel
        name={cardioLabel(timer.type)}
        type={timer.type}
        units={profile.units}
        now={now}
        session={null}
        timer={timer}
        otherTimer={null}
        editing={false}
        nextLabel={null}
        onStart={noop}
        onDone={() => void stop()}
        onResume={() => void resume()}
        onCancelTimer={() => void discard()}
        onDiscard={() => void discard()}
        onSave={async (r) => {
          const id = newId();
          await save("cardio_sessions", {
            id,
            workout_id: null,
            workout_exercise_id: null,
            type: timer.type,
            started_at: r.startedAt,
            duration_sec: r.durationSec,
            distance: r.distance,
            incline: r.incline,
            avg_hr: r.avgHr,
            rpe: r.rpe,
            intervals: null,
            notes: r.notes,
          });
          await clear();
          setSaved({ id, label: cardioLabel(timer.type) });
        }}
        onEnterByHand={noop}
        onEdit={noop}
        onCancelEdit={noop}
        onNext={noop}
        onResumeSaved={noop}
        onGoToOther={noop}
      />
    </section>
  );
}

/** Scroll Today back to the top (where the cardio card sits) with a short buzz, so starting feels like something happened. */
export function cardioStartedFeedback() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(30);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
