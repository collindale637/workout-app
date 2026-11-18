"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/units";

/*
  The fixed blue panel at the bottom of the live workout (lifts only): rest/last-time row, weight and reps
  wheels (white selected bar), RPE and Log. Every row has a fixed height so Log never moves. Swipe it down
  (or tap the handle) to shrink it to one row ("hidden"), up to bring it back. Hidden, a raised ring sits
  half out of the bar: the rest countdown (tap to skip) or, when not resting, set progress.
  UX spec Part 1 + 5.4, redesigned Nov 2026 (wheels + raised ring mockups).
*/

/** Bright green that reads on the blue dock; the rest numbers turn this at 0:00. */
const REST_DONE = "#5CF2A0";

export type DockRest = { left: number; total: number; onAdd: () => void; onSkip: () => void };

export type DockSet = {
  kind: "set";
  /** Left of the status row: a hint ("▲ UP 5 LB") or "LAST TIME · 3d ago". */
  hint: { text: string; tone: "plain" | "good" | "warn" };
  /** Right of the status row: the same set last time, or "First time". */
  last: { main: string; rpe: string | null } | null;
  weight: WheelProps;
  reps: WheelProps;
  /** The RPE slider, or null for a warm-up (the row keeps its height and says so). */
  rpe: React.ReactNode | null;
  logLabel: string;
  onLog: () => void;
  /** Hidden bar: micro line ("SET 2 OF 3", "WARM-UP") and big line ("70 LB × 10"). */
  micro: string;
  big: string;
  /** Hidden bar ring when not resting: set N of total. */
  progress: { set: number; total: number };
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
  // Hidden with a set: the raised ring takes the handle's place.
  const ring = hidden && content.kind === "set";

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
      // viewTransitionName: a fixed panel isn't part of the page's snapshot, so it gets its own to slide down on ⌄.
      style={{ transform: dy ? `translateY(${dy}px)` : undefined, transition: dragging ? "none" : "transform 0.2s ease-out", viewTransitionName: "workout-dock" }}
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md touch-none rounded-t-[22px] bg-primary px-3 text-white shadow-[0_-8px_24px_rgba(0,0,0,0.5)]"
    >
      {/* Floats 8 px above the dock in both states. data-no-sheet-drag: touching it never drags the dock. */}
      {toast && (
        <div
          data-no-sheet-drag
          role={toast.warn ? "alert" : "status"}
          className={`absolute inset-x-3 ${ring ? "bottom-[calc(100%+48px)]" : "bottom-[calc(100%+8px)]"} flex h-12 items-center gap-2 rounded-2xl border border-line bg-card-2 pr-0.5 pl-4 text-ink`}
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
      {!ring && (
        <button type="button" onClick={() => onHiddenChange(!hidden)} aria-label={hidden ? "Show the set panel" : "Hide the set panel"} className="flex h-5 w-full items-center justify-center">
          <span className="h-[5px] w-10 rounded-full bg-white/45" />
        </button>
      )}

      {hidden ? <HiddenRow rest={rest} content={content} onShow={() => onHiddenChange(false)} /> : <ShownRows rest={rest} content={content} />}
    </div>
  );
}

function HiddenRow({ rest, content, onShow }: { rest: DockRest | null; content: DockSet | DockUpNext; onShow: () => void }) {
  if (content.kind === "upnext") {
    return (
      <div className="flex h-14 items-center gap-3 px-2 pb-1">
        <button type="button" onClick={onShow} className="flex min-w-0 shrink -translate-y-[3px] flex-col items-start text-left" aria-label="Show the set panel">
          <span className="display num text-[11px] leading-none font-bold tracking-[0.12em] text-[#C9F7DA]">✓ DONE · UP NEXT</span>
          <span className="display mt-1 block w-full truncate text-[24px] leading-none font-extrabold">{content.nextName}</span>
        </button>
        <div className="flex-1" />
        <button type="button" onClick={content.onStart} className={`${white} h-12 shrink-0 px-5 text-lg`}>
          Start
        </button>
      </div>
    );
  }
  return (
    <div className="relative grid h-[76px] grid-cols-[minmax(0,1fr)_92px_minmax(0,1fr)] items-end gap-1 px-2 pb-2.5">
      <RaisedRing rest={rest} progress={content.progress} onShow={onShow} />
      <button type="button" onClick={onShow} className="flex min-w-0 flex-col items-start text-left" aria-label="Show the set panel">
        <span className="display num max-w-full truncate text-[11px] leading-none font-bold tracking-[0.12em] text-[#DCE4FF]">{content.micro}</span>
        <span className="display num mt-1 block max-w-full truncate text-[24px] leading-none font-extrabold">{content.big}</span>
      </button>
      <span />
      <button type="button" onClick={content.onLog} className={`${white} h-[50px] max-w-full justify-self-end truncate px-4 text-lg`}>
        {content.logLabel}
      </button>
    </div>
  );
}

/**
 * Hidden-bar hero: a 92 px blue disc lifted half out of the bar with an 80 px ring inside.
 * Resting: the countdown drains, tap skips (or clears a finished 0:00). Not resting: set progress, tap opens the panel.
 */
function RaisedRing({ rest, progress, onShow }: { rest: DockRest | null; progress: { set: number; total: number }; onShow: () => void }) {
  const done = rest ? rest.left <= 0 : false;
  const R = 37;
  const C = 2 * Math.PI * R;
  const total = Math.max(1, progress.total);
  const pct = rest ? (done ? 0 : Math.min(1, rest.left / Math.max(1, rest.total))) : Math.min(1, (progress.set - 1) / total);
  const label = rest
    ? done ? "Rest finished. Tap to clear" : `Rest ${formatDuration(rest.left)} left. Tap to skip rest`
    : `Set ${progress.set} of ${total}. Show the set panel`;
  return (
    <button
      type="button"
      onClick={rest ? rest.onSkip : onShow}
      aria-label={label}
      role={rest ? "timer" : undefined}
      className="absolute top-[-36px] left-1/2 h-[92px] w-[92px] -translate-x-1/2 rounded-full bg-primary p-1.5 shadow-[0_-6px_18px_rgba(0,0,0,0.35)] active:scale-95"
    >
      <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="6" />
        <circle
          cx="40" cy="40" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
          stroke={done ? REST_DONE : "#fff"} strokeDasharray={C} strokeDashoffset={C * (1 - (done ? 1 : pct))}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="display num text-[24px] leading-none font-extrabold" style={done ? { color: REST_DONE } : undefined}>
          {rest ? formatDuration(rest.left) : `${progress.set}/${total}`}
        </span>
        <span className="display mt-0.5 text-[10px] leading-none font-bold tracking-[0.1em] text-[#DCE4FF]">
          {rest ? (done ? "DONE" : "SKIP") : "SETS"}
        </span>
      </span>
    </button>
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
      <div className="grid h-[150px] grid-cols-2 gap-2.5">
        <Wheel {...content.weight} />
        <Wheel {...content.reps} />
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

/** One wheel row, in px. Three rows show: the one above, the picked one on the white bar, the one below. */
const ROW = 50;

export type WheelProps = {
  /** Shown on the white bar beside the number ("LB", "LB EACH", "REPS"). */
  label: string;
  /** Every value the wheel can land on, as shown ("100", "102.5", "BW", "—"). */
  options: string[];
  /** Which option is picked. */
  index: number;
  onPick: (index: number) => void;
  /** Tapping the picked value opens the type-it-in sheet. */
  onTap: () => void;
};

/**
 * Scroll-wheel picker: flick for big jumps, tap a value to land on it, tap the picked value to type one.
 * Built like the iOS picker: the white bar is a window onto a second copy of the list that moves in step with
 * the scroll, so numbers turn blue gradually as they slide under it instead of switching style on the row change.
 */
export function Wheel({ label: l, options, index, onPick, onTap }: WheelProps) {
  const box = useRef<HTMLDivElement>(null);
  const lens = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const scrolling = useRef(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The copy inside the white bar follows the scroll position on every frame (no React render involved).
  const follow = () => {
    if (box.current && lens.current) lens.current.style.transform = `translate3d(0,${-box.current.scrollTop}px,0)`;
  };

  // Follow the value when it changes from outside (typed, next set, undo), but never fight a finger mid-flick.
  useEffect(() => {
    const el = box.current;
    if (!el || scrolling.current) return;
    if (Math.round(el.scrollTop / ROW) !== index) el.scrollTop = index * ROW;
    follow();
  }, [index, options.length]);
  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    if (idle.current) clearTimeout(idle.current);
  }, []);

  const onScroll = () => {
    follow();
    scrolling.current = true;
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => (scrolling.current = false), 160);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = box.current;
      if (!el) return;
      const i = Math.max(0, Math.min(options.length - 1, Math.round(el.scrollTop / ROW)));
      if (i !== index) onPick(i);
    });
  };

  // One size for every row in both layers so the two copies line up exactly; long values ("102.5") shrink together.
  const size = options.some((o) => o.length >= 5) ? "text-[32px]" : "text-[38px]";
  const row = `display num block h-[50px] w-full pr-5 leading-[50px] font-extrabold ${size}`;

  return (
    <div className="relative h-[150px] overflow-hidden rounded-[18px] bg-black/15">
      <div
        ref={box}
        data-no-sheet-drag
        role="spinbutton"
        tabIndex={0}
        aria-label={l}
        aria-valuetext={options[index]}
        aria-valuenow={index}
        aria-valuemin={0}
        aria-valuemax={options.length - 1}
        onScroll={onScroll}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const i = Math.max(0, Math.min(options.length - 1, index + (e.key === "ArrowUp" ? -1 : 1)));
            if (i !== index) onPick(i);
          } else if (e.key === "Enter") onTap();
        }}
        className="relative h-full touch-pan-y snap-y snap-mandatory overflow-y-auto overscroll-contain py-[50px] [mask-image:linear-gradient(transparent,#000_35%,#000_65%,transparent)] [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-white [&::-webkit-scrollbar]:hidden"
      >
        {options.map((o, i) => (
          <button
            key={`${i}-${o}`}
            type="button"
            tabIndex={-1}
            onClick={() => (i === index ? onTap() : box.current?.scrollTo({ top: i * ROW, behavior: "smooth" }))}
            className={`${row} snap-center text-white/45`}
          >
            {o}
          </button>
        ))}
      </div>
      {/* The white bar: touches pass through to the wheel underneath. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-2 top-[50px] h-[50px] overflow-hidden rounded-[14px] bg-white shadow-[0_6px_16px_rgba(0,0,30,0.25)]">
        <div ref={lens} className="-mx-2 will-change-transform">
          {options.map((o, i) => (
            <span key={`${i}-${o}`} className={`${row} text-center text-primary`}>
              {o}
            </span>
          ))}
        </div>
        <span className="display absolute top-[17px] right-1.5 max-w-[40%] truncate text-[12px] leading-none font-bold tracking-[0.08em] text-primary/75">{l}</span>
      </div>
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
      <span className="display num w-12 shrink-0 text-right text-2xl font-extrabold" style={left <= 0 ? { color: REST_DONE } : undefined}>{formatDuration(left)}</span>
      <button type="button" onClick={onAdd} className="display -mr-1 h-11 min-w-11 rounded-xl px-2 text-base font-extrabold text-[#DCE4FF]">+15</button>
      <button type="button" onClick={onSkip} className="display h-11 min-w-11 shrink-0 rounded-xl px-2 text-base font-extrabold whitespace-nowrap text-white">Skip rest</button>
    </div>
  );
}
