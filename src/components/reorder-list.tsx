"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type RowAction = { key: string; label: string; icon: ReactNode; className: string; onPress: () => void };

export type ReorderItem = {
  id: string;
  /** The row's card. Taps on it call onTap (unless they ended a swipe or drag). */
  face: ReactNode;
  faceClassName: string;
  actions: RowAction[];
  onTap: () => void;
  ariaLabel: string;
  /** Drawn above the row, e.g. the line joining a superset. */
  before?: ReactNode;
  liClassName?: string;
};

/** Sets a row's transition and/or transform directly (these change every frame while dragging, so they bypass React). */
function setMotion(el: HTMLElement, motion: { transition?: string; transform?: string }) {
  if (motion.transition !== undefined) el.style.transition = motion.transition;
  if (motion.transform !== undefined) el.style.transform = motion.transform;
}

const ACTION_W = 66;
const HOLD_MS = 350;
const SLOP = 9;
const GAP = 8;

type Gesture = {
  id: string;
  pointerId: number;
  x: number;
  y: number;
  mode: "pending" | "swipe" | "drag" | "scroll";
  base: number;
  dx: number;
  timer: ReturnType<typeof setTimeout>;
  // drag
  lastY: number;
  scroll0: number;
  from: number;
  to: number;
  rects: { el: HTMLElement; top: number; h: number }[];
  auto?: ReturnType<typeof setInterval>;
};

/**
 * A list you can rearrange and act on with gestures:
 * - swipe a row left to show its actions; tap one, or tap anywhere else to close
 * - hold a row (about a third of a second) and drag it up or down to move it
 * Vertical swipes still scroll the page.
 */
export function ReorderList({ items, onReorder }: { items: ReorderItem[]; onReorder: (ids: string[]) => void }) {
  const list = useRef<HTMLUListElement>(null);
  const g = useRef<Gesture | null>(null);
  const suppressTap = useRef(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Shown order while the database catches up after a drop (so rows don't jump back for a frame).
  const [pending, setPending] = useState<string[] | null>(null);

  const ids = items.map((i) => i.id).join(",");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved order arrived; stop overriding it
    setPending(null);
  }, [ids]);

  const ordered = pending ? (pending.map((id) => items.find((i) => i.id === id)).filter(Boolean) as ReorderItem[]) : items;
  const actionsWidth = (it: ReorderItem) => it.actions.length * ACTION_W;

  // iOS only stops the page scrolling if a non-passive touchmove listener cancels it.
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (g.current && (g.current.mode === "drag" || g.current.mode === "swipe")) e.preventDefault();
    };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  // Tapping outside an open row closes it.
  useEffect(() => {
    if (!openId) return;
    const close = (e: PointerEvent) => {
      const li = (e.target as HTMLElement).closest?.("[data-row]");
      if (!li || li.getAttribute("data-row") !== openId) setOpenId(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [openId]);

  const faceOf = (id: string) => list.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"] [data-face]`) ?? null;

  function beginDrag() {
    const s = g.current;
    if (!s || !list.current) return;
    s.mode = "drag";
    setOpenId(null);
    if ("vibrate" in navigator) navigator.vibrate?.(15);
    const lis = [...list.current.querySelectorAll<HTMLElement>(":scope > li[data-row]")];
    s.rects = lis.map((el) => {
      const r = el.getBoundingClientRect();
      return { el, top: r.top + window.scrollY, h: r.height };
    });
    s.from = lis.findIndex((el) => el.getAttribute("data-row") === s.id);
    s.to = s.from;
    s.scroll0 = window.scrollY;
    for (const r of s.rects) setMotion(r.el, { transition: r.el.getAttribute("data-row") === s.id ? "none" : "transform 160ms ease" });
    setDraggingId(s.id);
    s.auto = setInterval(() => {
      const edge = 90;
      if (s.lastY < edge) window.scrollBy(0, -10);
      else if (s.lastY > window.innerHeight - edge) window.scrollBy(0, 10);
      else return;
      moveDrag();
    }, 16);
  }

  function moveDrag() {
    const s = g.current;
    if (!s || s.mode !== "drag" || s.from < 0) return;
    const dy = s.lastY - s.y + (window.scrollY - s.scroll0);
    const me = s.rects[s.from];
    setMotion(me.el, { transform: `translateY(${dy}px)` });
    const center = me.top + me.h / 2 + dy;
    let to = 0;
    s.rects.forEach((r, i) => {
      if (i !== s.from && r.top + r.h / 2 < center) to++;
    });
    s.to = to;
    const step = me.h + GAP;
    s.rects.forEach((r, i) => {
      if (i === s.from) return;
      const shift = s.from < to && i > s.from && i <= to ? -step : s.from > to && i < s.from && i >= to ? step : 0;
      setMotion(r.el, { transform: shift ? `translateY(${shift}px)` : "" });
    });
  }

  function endDrag(commit: boolean) {
    const s = g.current;
    if (!s) return;
    clearInterval(s.auto);
    for (const r of s.rects) setMotion(r.el, { transition: "none", transform: "" });
    setDraggingId(null);
    if (commit && s.from >= 0 && s.to !== s.from) {
      const next = ordered.map((i) => i.id);
      const [moved] = next.splice(s.from, 1);
      next.splice(s.to, 0, moved);
      setPending(next);
      onReorder(next);
    }
  }

  function settleSwipe(id: string, open: boolean) {
    const face = faceOf(id);
    const it = items.find((i) => i.id === id);
    if (face && it) {
      face.style.transition = "";
      face.style.transform = open ? `translateX(-${actionsWidth(it)}px)` : "";
    }
    setOpenId(open ? id : null);
  }

  const handlers = (it: ReorderItem) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button > 0 || g.current) return;
      const base = openId === it.id ? -actionsWidth(it) : 0;
      g.current = {
        id: it.id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, mode: "pending", base, dx: base,
        timer: setTimeout(() => g.current?.mode === "pending" && beginDrag(), HOLD_MS),
        lastY: e.clientY, scroll0: 0, from: -1, to: -1, rects: [],
      };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = g.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (s.mode === "pending") {
        if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) {
          s.mode = "swipe";
          clearTimeout(s.timer);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          if (openId && openId !== it.id) settleSwipe(openId, false);
        } else if (Math.abs(dy) > SLOP) {
          s.mode = "scroll";
          clearTimeout(s.timer);
        }
      }
      if (s.mode === "swipe") {
        s.dx = Math.max(-actionsWidth(it) - 30, Math.min(0, s.base + dx));
        const face = e.currentTarget as HTMLElement;
        face.style.transition = "none";
        face.style.transform = `translateX(${s.dx}px)`;
      } else if (s.mode === "drag") {
        if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        s.lastY = e.clientY;
        moveDrag();
      }
    },
    onPointerUp: (e: React.PointerEvent) => finish(e, true),
    onPointerCancel: (e: React.PointerEvent) => finish(e, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  function finish(e: React.PointerEvent, ok: boolean) {
    const s = g.current;
    if (!s || e.pointerId !== s.pointerId) return;
    clearTimeout(s.timer);
    if (s.mode === "swipe") {
      suppressTap.current = true;
      const it = items.find((i) => i.id === s.id);
      settleSwipe(s.id, Boolean(it) && s.dx < -actionsWidth(it!) / 2.5);
    } else if (s.mode === "drag") {
      suppressTap.current = true;
      endDrag(ok || s.to !== s.from);
    }
    g.current = null;
    setTimeout(() => (suppressTap.current = false), 60);
  }

  return (
    <ul ref={list} className="flex flex-col gap-2">
      {ordered.map((it) => {
        const open = openId === it.id;
        return (
          <li key={it.id} data-row={it.id} className={`relative ${draggingId === it.id ? "z-10" : ""} ${it.liClassName ?? ""}`}>
            {it.before}
            <div className="relative">
              <div className="absolute inset-0 flex justify-end overflow-hidden rounded-2xl" aria-hidden={!open}>
                {it.actions.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    tabIndex={open ? 0 : -1}
                    onClick={() => {
                      settleSwipe(it.id, false);
                      a.onPress();
                    }}
                    className={`display flex h-full flex-col items-center justify-center gap-1 text-xs font-extrabold tracking-[0.06em] ${a.className}`}
                    style={{ width: ACTION_W }}
                  >
                    {a.icon}
                    {a.label}
                  </button>
                ))}
              </div>
              <div
                data-face
                {...handlers(it)}
                className={`relative touch-pan-y transition-transform duration-200 select-none [-webkit-touch-callout:none] ${draggingId === it.id ? "scale-[1.03] shadow-[0_14px_30px_rgba(0,0,0,0.55)]" : ""} ${it.faceClassName}`}
                style={open ? { transform: `translateX(-${actionsWidth(it)}px)` } : undefined}
              >
                <button
                  type="button"
                  aria-label={it.ariaLabel}
                  onClick={() => {
                    if (suppressTap.current) return;
                    if (openId) return setOpenId(null);
                    it.onTap();
                  }}
                  className="flex w-full min-w-0 items-center gap-3 text-left"
                >
                  {it.face}
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
