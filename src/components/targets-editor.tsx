"use client";

import { useEffect, useRef, useState } from "react";
import { Wheel } from "@/app/(focus)/workout/set-dock";
import { formatDuration } from "@/lib/units";
import { label } from "@/components/ui/kit";

export type Targets = { sets: number; repMin: number; repMax: number; rest: number };

const REPS = Array.from({ length: 30 }, (_, i) => i + 1);
/** Seconds for a hold's range: 5 s steps to 3 minutes, plus any off-step target the plan already has (a 32 s AI target). */
const secondsOptions = (have: number[]) => [...new Set([...Array.from({ length: 36 }, (_, i) => (i + 1) * 5), ...have])].sort((a, b) => a - b);
const nearest = (opts: number[], v: number) => opts.reduce((best, o, i) => (Math.abs(o - v) < Math.abs(opts[best] - v) ? i : best), 0);
const SAVE_AFTER_MS = 350;

const chip =
  "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border-2 border-transparent bg-card-2 px-2 text-sm font-bold whitespace-nowrap active:bg-line";

/**
 * Sets / reps / rest for one exercise (layout "C" from the Batch 13 mockups): the rep range on two scroll wheels like the
 * set panel's, steppers for sets and rest, then Swap · How-to · Superset in one row. Every change saves on its own
 * (shortly after you stop), so there's no Save button; "✓ Saved" flashes to confirm.
 */
export function TargetsEditor({
  initial, timed = false, onSave, onSwap, onInfo, superset, onRemove, removeLabel,
}: {
  initial: Targets;
  /** A hold (plank): the range is in seconds, not reps. */
  timed?: boolean;
  onSave: (t: Targets) => void | Promise<void>;
  onSwap?: () => void;
  onInfo?: () => void;
  /** Shown when the exercise can be linked (or is linked) with the next one. */
  superset?: { linked: boolean; onToggle: () => void };
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const [t, setT] = useState(initial);
  // Fixed when the sheet opens, so the wheel doesn't reshuffle under your finger.
  const [opts] = useState<number[]>(() => (timed ? secondsOptions([initial.repMin, initial.repMax]) : REPS));
  const optStrings = opts.map(String);
  const word = timed ? "Seconds" : "Reps";
  const [saved, setSaved] = useState(false);
  const pending = useRef<Targets | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (p) void saveRef.current(p);
  };
  // Closing the sheet mid-change still saves it.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      const p = pending.current;
      pending.current = null;
      if (p) void saveRef.current(p);
    },
    [],
  );

  useEffect(() => {
    if (!saved) return;
    const h = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(h);
  }, [saved]);

  const change = (next: Targets) => {
    setT(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      flush();
      setSaved(true);
    }, SAVE_AFTER_MS);
  };

  // The two wheels keep low ≤ high by pushing the other one along.
  const setMin = (i: number) => change({ ...t, repMin: opts[i], repMax: Math.max(t.repMax, opts[i]) });
  const setMax = (i: number) => change({ ...t, repMax: opts[i], repMin: Math.min(t.repMin, opts[i]) });

  return (
    <div className="flex flex-col gap-3">
      {/* Rep range (design 2): dark card like Sets / Rest, blue selection bar, white numbers. */}
      <div className="relative rounded-[20px] bg-card-2 px-2 pt-2.5 pb-2">
        <p className={`${label} text-center`}>{word.toUpperCase()}</p>
        <span className={`absolute top-2.5 right-3 text-xs font-bold tracking-[0.06em] text-good transition-opacity ${saved ? "opacity-100" : "opacity-0"}`} role="status">
          {saved ? "✓ SAVED" : ""}
        </span>
        <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1">
          <Wheel tone="dark" label={`${word} from`} options={optStrings} index={nearest(opts, t.repMin)} onPick={setMin} onTap={() => {}} />
          <span className="display px-1 text-2xl font-extrabold text-muted" aria-hidden="true">–</span>
          <Wheel tone="dark" label={`${word} to`} options={optStrings} index={nearest(opts, t.repMax)} onPick={setMax} onTap={() => {}} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stepper title="SETS" value={String(t.sets)} onLess={() => change({ ...t, sets: Math.max(1, t.sets - 1) })} onMore={() => change({ ...t, sets: Math.min(20, t.sets + 1) })} />
        <Stepper title="REST" value={formatDuration(t.rest)} onLess={() => change({ ...t, rest: Math.max(0, t.rest - 15) })} onMore={() => change({ ...t, rest: Math.min(600, t.rest + 15) })} />
      </div>
      {(onSwap || onInfo || superset) && (
        <div className="flex gap-2">
          {onSwap && <button type="button" className={chip} onClick={() => { flush(); onSwap(); }}>⇄ Swap</button>}
          {onInfo && <button type="button" className={chip} onClick={() => { flush(); onInfo(); }}>ⓘ How-to</button>}
          {superset && (
            <button
              type="button"
              aria-pressed={superset.linked}
              className={`${chip} ${superset.linked ? "border-accent-strong bg-primary/15 text-accent-soft" : ""}`}
              onClick={() => { flush(); superset.onToggle(); }}
            >
              🔗 {superset.linked ? "Linked" : "Superset"}
            </button>
          )}
        </div>
      )}
      {onRemove && (
        <button type="button" className="min-h-12 text-base font-bold text-danger" onClick={() => { flush(); onRemove(); }}>
          {removeLabel ?? "Remove"}
        </button>
      )}
    </div>
  );
}

function Stepper({ title, value, onLess, onMore }: { title: string; value: string; onLess: () => void; onMore: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-card-2 px-2 py-2.5">
      <span className={label}>{title}</span>
      <div className="flex items-center">
        <button type="button" aria-label={`Less ${title.toLowerCase()}`} className="h-11 w-11 rounded-full border-2 border-line text-xl font-bold active:bg-line" onClick={onLess}>−</button>
        <span className="display num w-16 text-center text-2xl font-extrabold">{value}</span>
        <button type="button" aria-label={`More ${title.toLowerCase()}`} className="h-11 w-11 rounded-full border-2 border-line text-xl font-bold active:bg-line" onClick={onMore}>+</button>
      </div>
    </div>
  );
}
