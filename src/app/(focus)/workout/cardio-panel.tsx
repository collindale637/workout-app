"use client";

import { useState } from "react";
import { cardioElapsedSec, cardioHasDistance, cardioLabel, type CardioTimer } from "@/lib/cardio";
import { distanceUnit, formatDuration, fromDisplayDistance, toDisplayDistance } from "@/lib/units";
import { RpeSlider } from "@/components/rpe-slider";
import type { CardioResults } from "@/components/cardio-results";
import type { CardioSession, CardioType, Units } from "@/lib/db/types";

const whiteBtn =
  "display flex h-12 items-center justify-center gap-2.5 rounded-2xl bg-white px-4 text-xl font-extrabold tracking-[0.04em] text-primary shadow-[inset_0_-5px_0_#C9D3FF] active:translate-y-px disabled:opacity-60";
const softBtn = "display flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/15 px-4 text-lg font-extrabold tracking-[0.04em] text-white active:bg-white/25";
const squareBtn = "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 active:bg-white/25";
const linkBtn = "display flex h-11 items-center justify-center rounded-xl px-3 text-base font-extrabold tracking-[0.04em] text-[#DCE4FF]";
const subLabel = "text-xs font-bold tracking-[0.1em] text-[#DCE4FF]";
const blueField = "display num h-[52px] w-full rounded-[14px] border-2 border-transparent bg-white/15 pr-12 pl-3.5 text-[26px] font-extrabold text-white outline-none placeholder:text-white/40 focus:border-white/70";

const Play = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>;

/** Saving something new to the cardio item: results plus the timer they came from. */
export type CardioSave = CardioResults;

/**
 * The compact blue card for cardio (layout "B"): name and time on one line, so most of the workout stays visible.
 * Ready → Start; running → Done; done → results right in the card (or Resume if it was ended by mistake);
 * saved → stats, Next, Edit results, Resume run.
 */
export function CardioPanel({
  name, type, units, now, session, timer, otherTimer, editing, nextLabel, warning,
  onInfo, onStart, onDone, onResume, onCancelTimer, onSave, onDiscard, onEnterByHand, onEdit, onCancelEdit, onNext, onResumeSaved, onGoToOther,
}: {
  name: string;
  type: CardioType;
  units: Units;
  now: number;
  /** Saved results for this item. */
  session: CardioSession | null;
  /** The timer, if it belongs to this item. */
  timer: CardioTimer | null;
  /** A different cardio timer is going, so this one can't start yet. */
  otherTimer: CardioTimer | null;
  /** Entering results by hand, or editing saved ones. */
  editing: boolean;
  /** Name of what comes next; null when everything else is done. */
  nextLabel: string | null;
  warning?: string | null;
  onInfo?: () => void;
  onStart: () => void;
  onDone: () => void;
  onResume: () => void;
  onCancelTimer: () => void;
  onSave: (r: CardioSave) => void | Promise<void>;
  onDiscard: () => void;
  onEnterByHand: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onNext: () => void;
  onResumeSaved: () => void;
  onGoToOther: () => void;
}) {
  const typeLabel = cardioLabel(type);
  const running = Boolean(timer && !timer.stoppedAt);
  const stopped = Boolean(timer?.stoppedAt);

  // Done (or entering/editing): results right in the card.
  if (stopped || (editing && !timer)) {
    const fromTimer = stopped && timer ? cardioElapsedSec(timer, now) : null;
    return (
      <ResultsInCard
        key={`${session?.id ?? "new"}:${timer?.startedAt ?? "hand"}`}
        name={name}
        type={type}
        units={units}
        timerSec={fromTimer}
        session={session}
        startedAt={timer ? new Date(timer.startedAt) : session ? new Date(session.started_at) : null}
        warning={warning}
        onInfo={onInfo}
        onSave={onSave}
        onResume={stopped ? onResume : null}
        onCancel={stopped ? onDiscard : onCancelEdit}
        cancelLabel={stopped ? "Discard" : "Cancel"}
      />
    );
  }

  // Saved: what you did, then on to the next thing.
  if (session && !running) {
    const stats = [
      [formatDuration(session.duration_sec), "TIME"],
      session.distance ? [String(toDisplayDistance(session.distance, units)), distanceUnit(units).toUpperCase()] : null,
      session.avg_hr ? [String(session.avg_hr), "AVG BPM"] : null,
      session.rpe ? [String(session.rpe), "RPE"] : null,
    ].filter((x): x is string[] => x !== null);
    return (
      <>
        <Title name={name} onInfo={onInfo} big />
        <p className="display mt-2 flex items-center gap-2 text-sm font-bold tracking-[0.08em] text-[#DCE4FF]">
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white/20" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          {typeLabel} saved
        </p>
        <ul className="mt-3.5 grid gap-2" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
          {stats.map(([v, l]) => (
            <li key={l} className="flex flex-col items-center rounded-2xl bg-white/10 py-2.5">
              <span className="display num text-[26px] leading-tight font-extrabold">{v}</span>
              <span className="text-[11px] font-bold tracking-[0.1em] text-[#DCE4FF]">{l}</span>
            </li>
          ))}
        </ul>
        <button type="button" className={`${whiteBtn} mt-3 h-13 w-full`} onClick={onNext}>
          <span className="truncate">{nextLabel ? `Next: ${nextLabel}` : "Finish workout"}</span>
          {nextLabel && <Play />}
        </button>
        <div className="flex justify-center gap-2">
          <button type="button" className={linkBtn} onClick={onEdit}>Edit results</button>
          {!otherTimer && <button type="button" className={linkBtn} onClick={onResumeSaved}>Resume {typeLabel.toLowerCase()}</button>}
        </div>
      </>
    );
  }

  // Ready or running: the compact strip.
  const seconds = timer ? cardioElapsedSec(timer, now) : 0;
  return (
    <>
      <Strip name={name} status={`${typeLabel} · ${running ? "Running" : "Ready"}`} seconds={seconds} dim={!timer} onInfo={onInfo} />
      {warning && <p className="mt-1 text-sm font-bold text-[#FFD2B3]">{warning}</p>}
      <div className="mt-4 flex gap-2">
        {running ? (
          <>
            <button type="button" className={`${whiteBtn} flex-1`} onClick={onDone}>Done</button>
            <button type="button" className={squareBtn} aria-label="Cancel timer" onClick={onCancelTimer}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </>
        ) : (
          <>
            {otherTimer ? (
              <button type="button" className={`${whiteBtn} min-w-0 flex-1`} onClick={onGoToOther}>
                <span className="truncate">{cardioLabel(otherTimer.type)} timer running</span>
              </button>
            ) : (
              <button type="button" className={`${whiteBtn} flex-1`} onClick={onStart}><Play /> Start</button>
            )}
            <button type="button" className={squareBtn} aria-label="Forgot to start? Enter it by hand" onClick={onEnterByHand}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>
            </button>
          </>
        )}
      </div>
    </>
  );
}

function Title({ name, onInfo, big = false }: { name: string; onInfo?: () => void; big?: boolean }) {
  const h = <h1 className={`display font-extrabold ${big ? "mt-1 text-[30px] leading-[0.95]" : "text-[26px] leading-[0.95]"}`}>{name}</h1>;
  return onInfo ? <button type="button" onClick={onInfo} className="block min-w-0 text-left">{h}</button> : h;
}

function Strip({ name, status, seconds, dim, onInfo }: { name: string; status: string; seconds: number; dim?: boolean; onInfo?: () => void }) {
  return (
    <div className="mt-1.5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <Title name={name} onInfo={onInfo} />
        <span className="display mt-1.5 block text-sm font-bold tracking-[0.08em] text-[#DCE4FF] uppercase">{status}</span>
      </div>
      <span role="timer" aria-label={`Time ${formatDuration(seconds)}`} className={`display num shrink-0 text-[48px] leading-[0.85] font-extrabold ${dim ? "opacity-60" : ""}`}>
        {formatDuration(seconds)}
      </span>
    </div>
  );
}

const HR_MIN = 30;
const HR_MAX = 250;

/** How it went, filled in right inside the blue card. */
function ResultsInCard({
  name, type, units, timerSec, session, startedAt, warning, onInfo, onSave, onResume, onCancel, cancelLabel,
}: {
  name: string; type: CardioType; units: Units;
  /** Time from a timer that just stopped; null when entering by hand or editing. */
  timerSec: number | null;
  session: CardioSession | null;
  startedAt: Date | null;
  warning?: string | null;
  onInfo?: () => void;
  onSave: (r: CardioSave) => void | Promise<void>;
  onResume: (() => void) | null;
  onCancel: () => void;
  cancelLabel: string;
}) {
  const showTime = timerSec === null;
  const initialSec = session?.duration_sec ?? 0;
  const [minutes, setMinutes] = useState(initialSec ? String(Math.floor(initialSec / 60)) : "");
  const [seconds, setSeconds] = useState(initialSec ? String(initialSec % 60 || "") : "");
  const [distance, setDistance] = useState(session?.distance ? String(toDisplayDistance(session.distance, units)) : "");
  const [hr, setHr] = useState(session?.avg_hr ? String(session.avg_hr) : "");
  const [rpe, setRpe] = useState<number | null>(session?.rpe ?? null);
  const [saving, setSaving] = useState(false);
  const [start] = useState(() => startedAt ?? new Date());

  const hasDistance = cardioHasDistance(type);
  const durationSec = showTime ? (Number(minutes) || 0) * 60 + (Number(seconds) || 0) : timerSec;
  const hrNum = hr.trim() ? Math.round(Number(hr)) : null;
  const hrBad = hrNum !== null && (Number.isNaN(hrNum) || hrNum < HR_MIN || hrNum > HR_MAX);
  const distNum = distance.trim() ? Number(distance.replace(",", ".")) : null;
  const distBad = hasDistance && distNum !== null && (Number.isNaN(distNum) || distNum < 0);
  const invalid = durationSec <= 0 || hrBad || distBad;
  const typeLabel = cardioLabel(type);

  const unitIn = (u: string) => <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[13px] font-bold text-[#DCE4FF]">{u}</span>;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (invalid || saving) return;
        setSaving(true);
        try {
          await onSave({
            durationSec,
            distance: hasDistance && distNum ? fromDisplayDistance(distNum, units) : null,
            avgHr: hrNum,
            rpe,
            notes: session?.notes ?? null,
            startedAt: start.toISOString(),
          });
        } finally {
          setSaving(false);
        }
      }}
    >
      <Strip name={name} status={`${typeLabel} · ${showTime ? (session ? "Edit results" : "Enter by hand") : "Done · how did it go?"}`} seconds={durationSec} onInfo={onInfo} />
      {warning && <p className="mt-1 text-sm font-bold text-[#FFD2B3]">{warning}</p>}

      {showTime && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="relative"><span className="sr-only">Minutes</span><input className={blueField} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="30" />{unitIn("min")}</label>
          <label className="relative"><span className="sr-only">Seconds</span><input className={blueField} inputMode="numeric" value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="0" />{unitIn("sec")}</label>
        </div>
      )}

      <div className={`grid gap-2 ${showTime ? "mt-3" : "mt-4"} ${hasDistance ? "grid-cols-2" : "grid-cols-1"}`}>
        {hasDistance && (
          <label className="flex flex-col gap-1.5">
            <span className={subLabel}>DISTANCE</span>
            <span className="relative block"><input className={blueField} inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="—" />{unitIn(distanceUnit(units))}</span>
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className={subLabel}>AVG HEART RATE</span>
          <span className="relative block"><input className={blueField} inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} placeholder="—" />{unitIn("bpm")}</span>
        </label>
      </div>
      {(hrBad || distBad) && (
        <p className="mt-1.5 text-sm font-bold text-[#FFD2B3]">{hrBad ? `Heart rate should be between ${HR_MIN} and ${HR_MAX} bpm` : "Enter a distance like 3.1"}</p>
      )}

      <div className="mt-3.5 flex flex-col gap-2">
        <span className={subLabel}>EFFORT (RPE)</span>
        <RpeSlider value={rpe} defaultRpe={null} resetKey={session?.id ?? "new"} onChange={setRpe} tone="blue" />
      </div>

      <div className="mt-3.5 flex gap-2">
        <button type="submit" disabled={invalid || saving} className={`${whiteBtn} min-w-0 flex-1`}>
          <span className="truncate">{session ? "Save changes" : `Save ${typeLabel.toLowerCase()}`}</span>
        </button>
        {onResume && (
          <button type="button" className={softBtn} onClick={onResume} aria-label={`Resume ${typeLabel.toLowerCase()}: keep the timer going`}>
            <Play /> Resume
          </button>
        )}
      </div>
      <div className="flex justify-center">
        <button type="button" className={linkBtn} onClick={onCancel}>{cancelLabel}</button>
      </div>
    </form>
  );
}
