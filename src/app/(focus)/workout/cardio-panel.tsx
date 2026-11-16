"use client";

import type { CardioTimer } from "@/lib/cardio";
import { cardioElapsedSec, cardioLabel } from "@/lib/cardio";
import { distanceUnit, formatDuration, toDisplayDistance } from "@/lib/units";
import type { CardioSession, CardioType, Units } from "@/lib/db/types";

const primaryBtn =
  "display mt-3 flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-white text-2xl font-extrabold tracking-[0.04em] text-primary shadow-[inset_0_-5px_0_#C9D3FF] active:translate-y-px disabled:opacity-60";
const softBtn = "display flex h-12 w-full items-center justify-center rounded-2xl bg-white/15 text-lg font-extrabold tracking-[0.04em] text-white active:bg-white/25";
const linkBtn = "display mx-auto flex h-11 items-center justify-center rounded-xl px-3 text-base font-extrabold tracking-[0.04em] text-[#DCE4FF]";

/**
 * The blue card for a cardio exercise: no reps. Start → Done → results.
 * Shows one of: not started, running, finished and waiting for results, or the saved results.
 */
export function CardioPanel({
  name, type, session, timer, otherTimer, now, units, warning,
  onInfo, onStart, onDone, onEnterResults, onDiscardTimer, onGoToOther,
}: {
  name: string;
  type: CardioType;
  /** Saved results for this exercise. */
  session: CardioSession | null;
  /** The timer, if it belongs to this exercise. */
  timer: CardioTimer | null;
  /** A different cardio timer is in progress, so this one can't start yet. */
  otherTimer: CardioTimer | null;
  now: number;
  units: Units;
  warning?: string | null;
  onInfo: () => void;
  onStart: () => void;
  onDone: () => void;
  /** Open the results form: for a finished timer, to edit saved results, or to log without a timer. */
  onEnterResults: () => void;
  onDiscardTimer: () => void;
  onGoToOther: () => void;
}) {
  const running = Boolean(timer && !timer.stoppedAt);
  const waiting = Boolean(timer?.stoppedAt);
  const seconds = session ? session.duration_sec : timer ? cardioElapsedSec(timer, now) : 0;
  const status = session ? "DONE" : running ? "RUNNING" : waiting ? "ENTER RESULTS" : "READY";

  return (
    <>
      <button type="button" onClick={onInfo} className="mt-2 block text-left">
        <h1 className="display text-[40px] leading-[0.95] font-extrabold">{name}</h1>
      </button>
      <p className="mt-2 text-sm font-bold tracking-[0.08em] text-[#DCE4FF]">
        CARDIO · {cardioLabel(type).toUpperCase()} · {status}
      </p>
      {warning && <p className="mt-1 text-sm font-bold text-[#FFD2B3]">{warning}</p>}

      <div className="mt-4 flex flex-col items-center rounded-3xl bg-white/10 py-6" role="timer" aria-label={`${cardioLabel(type)} time ${formatDuration(seconds)}`}>
        <span className="text-xs font-bold tracking-[0.12em] text-[#DCE4FF]">TIME</span>
        <span className={`display num text-[88px] leading-none font-extrabold ${!session && !timer ? "opacity-60" : ""}`}>{formatDuration(seconds)}</span>
      </div>

      {session && (
        <>
          <ul className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              session.distance ? [`${toDisplayDistance(session.distance, units)}`, distanceUnit(units).toUpperCase()] : null,
              session.avg_hr ? [String(session.avg_hr), "AVG BPM"] : null,
              session.rpe ? [String(session.rpe), "RPE"] : null,
            ]
              .filter((x): x is string[] => x !== null)
              .map(([v, l]) => (
                <li key={l} className="rounded-2xl bg-white/10 py-2">
                  <div className="display num text-2xl font-extrabold">{v}</div>
                  <div className="text-xs font-bold tracking-[0.1em] text-[#DCE4FF]">{l}</div>
                </li>
              ))}
          </ul>
          <button type="button" className={`${softBtn} mt-3`} onClick={onEnterResults}>Edit results</button>
        </>
      )}

      {!session && running && (
        <>
          <button type="button" className={primaryBtn} onClick={onDone}>Done</button>
          <button type="button" className={linkBtn} onClick={onDiscardTimer}>Cancel timer</button>
        </>
      )}

      {!session && waiting && (
        <>
          <button type="button" className={primaryBtn} onClick={onEnterResults}>Enter results</button>
          <button type="button" className={linkBtn} onClick={onDiscardTimer}>Discard</button>
        </>
      )}

      {!session && !timer && (
        <>
          {otherTimer ? (
            <button type="button" className={primaryBtn} onClick={onGoToOther}>
              {cardioLabel(otherTimer.type)} timer running
            </button>
          ) : (
            <button type="button" className={primaryBtn} onClick={onStart}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>
              Start
            </button>
          )}
          <button type="button" className={linkBtn} onClick={onEnterResults}>Forgot to start? Enter it by hand</button>
        </>
      )}
    </>
  );
}
