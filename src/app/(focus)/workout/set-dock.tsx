"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/units";

/*
  The fixed blue panel at the bottom of the live workout (lifts only): rest/last-time row, weight and reps,
  RPE and Log. Every row has a fixed height so Log never moves. Swipe it down (or tap the handle) to shrink it
  to one row ("hidden"), up to bring it back. UX spec Part 1 + 5.4.
*/

export type DockRest = { left: number; total: number; onAdd: () => void; onSkip: () => void };

export type DockSet = {
  kind: "set";
  /** Left of the status row: a hint ("▲ UP 5 LB") or "LAST TIME · 3d ago". */
  hint: { text: string; tone: "plain" | "good" | "warn" };
  /** Right of the status row: the same set last time, or "First time". */
  last: { main: string; rpe: string | null } | null;
  weight: StepperProps;
  reps: StepperProps;
  /** The RPE slider, or null for a warm-up (the row keeps its height and says so). */
  rpe: React.ReactNode | null;
  logLabel: string;
  onLog: () => void;
  /** Hidden bar: micro line ("SET 2 OF 3", "WARM-UP") and big line ("70 LB × 10"). */
  micro: string;
  big: string;
};

export type DockUpNext = {
  kind: "upnext";
  doneName: string;
  nextName: string;
  detail: string;
  startLabel: string;
  onStart: () => void;
  onInfo: () => void;
};

const HIDE_PX = 90;
const FLICK_PX = 30;
const FLICK_SPEED = 0.5; // px per ms
const SHOW_PX = 20;
const UP_LIMIT = 28;
const SLOP = 6;

const white =
  "display flex items-center justify-center rounded-full bg-white font-extrabold tracking-[0.04em] text-primary active:translate-y-px";

/** "✓ Set 2 logged · 70 lb × 10" with Undo, shown for 5 s after a log (the screen owns the timer). */
/** "Set logged · Undo" (onUndo) or, with `warn`, a message that blocked the Log tap (no Undo). */
export type DockToast = { text: string; onUndo?: () => void; warn?: boolean };

export function SetDock({
  hidden, onHiddenChange, rest, content, toast = null,
}: {
  hidden: boolean; onHiddenChange: (h: boolean) => void; rest: DockRest | null; content: DockSet | DockUpNext; toast?: DockToast | null;
}) {
  const drag = useRef<{ y: number; t: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Same gesture style as Sheet in kit.tsx. A drag that starts in the RPE strip never moves the dock.
  const onTouchStart = (e: React.TouchEvent) => {
    if ((e.target as Element).closest?.("[data-no-sheet-drag]")) {
      drag.current = null;
      return;
    }
    drag.current = { y: e.touches[0].clientY, t: Date.now(), moved: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    if (!d) return;
    const raw = e.touches[0].clientY - d.y;
    if (Math.abs(raw) > SLOP) d.moved = true;
    setDragging(true);
    setDy(hidden ? Math.max(-UP_LIMIT, Math.min(0, raw)) : Math.max(0, raw));
  };
  const onTouchEnd = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    // A drag must not also press the button it started on.
    if (d.moved) {
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 60);
    }
    const speed = Math.abs(dy) / Math.max(1, Date.now() - d.t);
    setDy(0);
    if (!hidden && (dy > HIDE_PX || (dy > FLICK_PX && speed > FLICK_SPEED))) onHiddenChange(true);
    else if (hidden && dy < -SHOW_PX) onHiddenChange(false);
  };

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      style={{ transform: dy ? `translateY(${dy}px)` : undefined, transition: dragging ? "none" : "transform 0.2s ease-out" }}
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md touch-none rounded-t-[22px] bg-primary px-3 text-white shadow-[0_-8px_24px_rgba(0,0,0,0.5)]"
    >
      {/* Floats 8 px above the dock in both states. data-no-sheet-drag: touching it never drags the dock. */}
      {toast && (
        <div
          data-no-sheet-drag
          role={toast.warn ? "alert" : "status"}
          className="absolute inset-x-3 bottom-[calc(100%+8px)] flex h-12 items-center gap-2 rounded-2xl border border-line bg-card-2 pr-0.5 pl-4 text-ink"
        >
          <span className="num min-w-0 flex-1 truncate text-sm font-bold">
            <span className={toast.warn ? "text-warn" : "text-good"}>{toast.warn ? "!" : "✓"}</span> {toast.text}
          </span>
          {toast.onUndo && (
            <button type="button" onClick={toast.onUndo} className="display h-11 min-w-11 shrink-0 rounded-xl px-3 text-base font-extrabold text-accent active:bg-line">
              Undo
            </button>
          )}
        </div>
      )}
      <button type="button" onClick={() => onHiddenChange(!hidden)} aria-label={hidden ? "Show the set panel" : "Hide the set panel"} className="flex h-5 w-full items-center justify-center">
        <span className="h-[5px] w-10 rounded-full bg-white/45" />
      </button>

      {hidden ? <HiddenRow rest={rest} content={content} onShow={() => onHiddenChange(false)} /> : <ShownRows rest={rest} content={content} />}
    </div>
  );
}

function HiddenRow({ rest, content, onShow }: { rest: DockRest | null; content: DockSet | DockUpNext; onShow: () => void }) {
  const upNext = content.kind === "upnext";
  return (
    <div className="flex h-14 items-center gap-3 px-2 pb-1">
      <button type="button" onClick={onShow} className="flex min-w-0 flex-1 flex-col items-start text-left" aria-label="Show the set panel">
        <span className={`display num text-[11px] leading-none font-bold tracking-[0.12em] ${upNext ? "text-[#C9F7DA]" : "text-[#DCE4FF]"}`}>
          {upNext ? "✓ DONE · UP NEXT" : content.micro}
          {!upNext && rest && ` · REST ${formatDuration(rest.left)}`}
        </span>
        {upNext ? (
          <span className="display mt-1 block w-full truncate text-[24px] leading-none font-extrabold">{content.nextName}</span>
        ) : (
          <span className="display num mt-1 block w-full truncate text-[26px] leading-none font-extrabold">{content.big}</span>
        )}
      </button>
      <button type="button" onClick={upNext ? content.onStart : content.onLog} className={`${white} h-12 shrink-0 px-5 text-lg`}>
        {upNext ? "Start" : content.logLabel}
      </button>
    </div>
  );
}

function ShownRows({ rest, content }: { rest: DockRest | null; content: DockSet | DockUpNext }) {
  const status = rest ? (
    <RestBar {...rest} />
  ) : content.kind === "set" ? (
    <div className="flex h-11 items-center justify-between gap-3 px-2">
      <span className={`display min-w-0 truncate text-sm font-extrabold ${content.hint.tone === "good" ? "text-[#C9F7DA]" : content.hint.tone === "warn" ? "text-[#FFD2B3]" : "text-[#DCE4FF]"}`}>
        {content.hint.text}
      </span>
      <span className="display num shrink-0 text-xl font-extrabold">
        {content.last ? (
          <>
            {content.last.main}
            {content.last.rpe && <span className="text-sm text-[#DCE4FF]"> · RPE {content.last.rpe}</span>}
          </>
        ) : (
          "First time"
        )}
      </span>
    </div>
  ) : (
    <div className="h-11" />
  );

  if (content.kind === "upnext") {
    return (
      <>
        {status}
        <div className="flex h-[114px] flex-col justify-center px-2">
          <p className="display truncate text-sm font-extrabold text-[#C9F7DA]">✓ {content.doneName} done · Up next</p>
          <p className="display mt-1 truncate text-[30px] leading-[0.95] font-extrabold">{content.nextName}</p>
          <p className="mt-1 truncate text-[15px] font-semibold text-[#DCE4FF]">{content.detail}</p>
        </div>
        <div className="mt-2.5 flex gap-2">
          <button type="button" onClick={content.onStart} className={`${white} h-14 flex-1 text-xl`}>
            {content.startLabel}
          </button>
          <button type="button" onClick={content.onInfo} aria-label="How to do it" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 text-2xl active:bg-white/25">
            ⓘ
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {status}
      <div className="grid h-16 grid-cols-2 gap-2">
        <Stepper {...content.weight} />
        <Stepper {...content.reps} />
      </div>
      <div className="mt-2 flex h-[42px] items-center gap-2">
        {content.rpe ? (
          <>
            <span className="display w-11 shrink-0 pl-1 text-sm font-extrabold text-[#DCE4FF]">RPE</span>
            <div className="min-w-0 flex-1">{content.rpe}</div>
          </>
        ) : (
          <span className="pl-1 text-sm font-bold text-[#DCE4FF]">WARM-UP · NO RPE</span>
        )}
      </div>
      <button type="button" onClick={content.onLog} className={`${white} mt-2.5 h-14 w-full text-xl`}>
        {content.logLabel}
      </button>
    </>
  );
}

export type StepperProps = { label: string; value: string; onMinus: () => void; onPlus: () => void; onTap: () => void };

export function Stepper({ label: l, value, onMinus, onPlus, onTap }: StepperProps) {
  // 4+ characters ("1,005", "102.5") shrink so the ± buttons never overlap the number.
  const big = value.length >= 4 ? "text-[30px]" : "text-[40px]";
  return (
    <div className="flex items-center gap-1 rounded-[14px] bg-white/10 p-1">
      <button
        type="button"
        onClick={onMinus}
        aria-label={`Less ${l}`}
        className="flex h-14 w-[52px] shrink-0 items-center justify-center rounded-full text-xl font-bold shadow-[inset_0_0_0_2px_rgba(255,255,255,0.7),inset_0_0_0_7px_transparent,inset_0_0_0_8px_rgba(255,255,255,0.28)]"
      >
        −
      </button>
      <button type="button" onClick={onTap} className="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center" aria-label={`${l} ${value}. Tap to type`}>
        <span className={`display num leading-none font-extrabold ${big}`}>{value}</span>
        <span className="display mt-0.5 max-w-full truncate text-[11px] leading-none font-bold tracking-[0.12em] text-[#DCE4FF]">{l}</span>
      </button>
      <button
        type="button"
        onClick={onPlus}
        aria-label={`More ${l}`}
        className="flex h-14 w-[52px] shrink-0 items-center justify-center rounded-full bg-white text-xl font-bold text-primary shadow-[inset_0_0_0_7px_#fff,inset_0_0_0_8px_rgba(31,75,255,0.4)]"
      >
        +
      </button>
    </div>
  );
}

/** Rest countdown: REST, a draining track, time left, +15 and Skip rest. */
export function RestBar({ left, total, onAdd, onSkip }: DockRest) {
  const pct = Math.min(1, left / Math.max(1, total));
  useEffect(() => {
    if (left === 1 && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
  }, [left]);
  return (
    <div className="flex h-11 items-center gap-3 px-2" role="timer" aria-label={`Rest ${formatDuration(left)} left`}>
      <span className="display w-10 shrink-0 text-sm font-extrabold tracking-[0.1em] text-[#DCE4FF]">REST</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full bg-white transition-[width] duration-1000 ease-linear" style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="display num w-12 shrink-0 text-right text-2xl font-extrabold">{formatDuration(left)}</span>
      <button type="button" onClick={onAdd} className="display -mr-1 h-11 min-w-11 rounded-xl px-2 text-base font-extrabold text-[#DCE4FF]">+15</button>
      <button type="button" onClick={onSkip} className="display h-11 min-w-11 shrink-0 rounded-xl px-2 text-base font-extrabold whitespace-nowrap text-white">Skip rest</button>
    </div>
  );
}
