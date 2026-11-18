"use client";

import { useEffect, useRef, useState } from "react";

/** How far (as a share of the width) or how fast (px per ms) a swipe must go to move to the next image. */
const SWIPE_SHARE = 0.2;
const FLING_SPEED = 0.3;
/** Movement (px) before deciding whether the finger is going sideways or up/down. */
const DECIDE_AT = 3;
/** Settle: an ease-out that starts at about the finger's speed and glides in (no hard snap). */
const SETTLE_EASE = "cubic-bezier(0.25, 0.9, 0.35, 1)";
const SETTLE_MIN = 320;
const SETTLE_MAX = 560;

type Gesture = {
  x: number;
  y: number;
  axis: "x" | "y" | null;
  dx: number;
  width: number;
  lastX: number;
  lastT: number;
  speed: number;
};

/**
 * Swipe between images. It works out which way the finger is going: a sideways swipe changes the image and holds the
 * page still, an up/down drag scrolls the page as normal. (A plain scroll-snap row can't do both: locking it to
 * sideways-only made the picture a dead zone for scrolling the page.)
 */
export function ImageCarousel({ srcs, altFor }: { srcs: string[]; altFor: (i: number) => string }) {
  const [frame, setFrame] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const gesture = useRef<Gesture | null>(null);
  const count = srcs.length;

  useEffect(() => {
    const el = box.current;
    const row = track.current;
    if (!el || !row || count < 2) return;

    /** animate: settle time in ms (0 = follow the finger). */
    const place = (index: number, offset: number, animate: number) => {
      row.style.transition = animate ? `transform ${animate}ms ${SETTLE_EASE}` : "none";
      row.style.transform = `translateX(calc(${-index * 100}% + ${offset}px))`;
    };

    const start = (x: number, y: number) => {
      const now = performance.now();
      gesture.current = { x, y, axis: null, dx: 0, width: el.clientWidth, lastX: x, lastT: now, speed: 0 };
    };

    /** Returns true while this is a sideways swipe, so the caller can hold the page still. */
    const move = (x: number, y: number) => {
      const g = gesture.current;
      if (!g || g.axis === "y") return false;
      const dx = x - g.x;
      const dy = y - g.y;
      if (g.axis === null) {
        if (Math.abs(dx) < DECIDE_AT && Math.abs(dy) < DECIDE_AT) return false;
        g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (g.axis === "y") return false;
      }
      const now = performance.now();
      if (now > g.lastT) g.speed = (x - g.lastX) / (now - g.lastT);
      g.lastX = x;
      g.lastT = now;
      const f = frameRef.current;
      // Past the first or last image it pulls with resistance instead of sliding freely.
      const atEdge = (f === 0 && dx > 0) || (f === count - 1 && dx < 0);
      // Rubber band: easy at first, stiffer the further you pull.
      g.dx = atEdge ? dx / (1 + Math.abs(dx) / (g.width * 0.35)) : dx;
      place(f, g.dx, 0);
      return true;
    };

    const end = () => {
      const g = gesture.current;
      gesture.current = null;
      if (!g || g.axis !== "x") return;
      const f = frameRef.current;
      let next = f;
      if (g.dx < -g.width * SWIPE_SHARE || (g.dx < 0 && g.speed < -FLING_SPEED)) next = Math.min(count - 1, f + 1);
      else if (g.dx > g.width * SWIPE_SHARE || (g.dx > 0 && g.speed > FLING_SPEED)) next = Math.max(0, f - 1);
      frameRef.current = next;
      // Time it from how far is left and how fast the finger was going, so a flick glides and a slow drag eases in.
      // Track is at -f·W + dx now and ends at -next·W.
      const left = Math.abs((f - next) * g.width - g.dx);
      const speed = Math.max(Math.abs(g.speed), 0.6);
      place(next, 0, Math.round(Math.min(SETTLE_MAX, Math.max(SETTLE_MIN, (left / speed) * 1.6))));
      setFrame(next);
    };

    // Touch: listeners added by hand so touchmove can be cancelled (React's are passive), which is what stops iOS
    // from moving the page during a sideways swipe.
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        gesture.current = null;
        return;
      }
      start(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || !move(t.clientX, t.clientY)) return;
      if (e.cancelable) e.preventDefault();
      // Keep a sideways swipe away from the sheet's swipe-down-to-close, so the sheet doesn't wobble with it.
      e.stopPropagation();
    };
    // Mouse (desktop): drag with the button held down.
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      start(e.clientX, e.clientY);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") move(e.clientX, e.clientY);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") end();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, [count]);

  return (
    <div
      ref={box}
      // touch-pan-y: the browser only scrolls the page up/down from here; sideways moves are ours.
      className={`relative overflow-hidden rounded-3xl bg-white select-none ${count > 1 ? "touch-pan-y" : ""}`}
    >
      <div ref={track} className="flex will-change-transform">
        {srcs.map((src, i) => (
          <div key={src} className="w-full shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote images, cached by the service worker */}
            <img src={src} alt={altFor(i)} className="aspect-[4/3] w-full object-contain" loading="lazy" draggable={false} />
          </div>
        ))}
      </div>
      {count > 1 && (
        <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white">
          {frame + 1}/{count} · swipe
        </span>
      )}
    </div>
  );
}
