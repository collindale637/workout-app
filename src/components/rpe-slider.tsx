"use client";

import { useEffect, useRef } from "react";
import { RPE_SCALE } from "@/lib/defaults";

/**
 * RPE picker that slides sideways from 1 to 10. Opens centred on the chosen (or default) value.
 * Sideways swipes stay inside the strip: they don't scroll the page or trigger the browser's back gesture.
 * tone "blue" sits on the blue live-workout card; "dark" sits on a dark sheet or page.
 * defaultRpe null = no default (cardio): nothing is outlined until you pick.
 */
export function RpeSlider({
  value, defaultRpe, resetKey, onChange, tone = "blue",
}: {
  value: number | null;
  defaultRpe: number | null;
  resetKey: string;
  onChange: (v: number | null) => void;
  tone?: "blue" | "dark";
}) {
  const strip = useRef<HTMLDivElement>(null);
  const shown = value ?? defaultRpe ?? 6;
  useEffect(() => {
    const el = strip.current;
    const target = el?.querySelector<HTMLElement>(`[data-rpe="${shown}"]`);
    if (el && target) el.scrollLeft = target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2;
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps -- recentre only when the item changes, not while sliding
  const blue = tone === "blue";
  return (
    <div
      ref={strip}
      role="group"
      aria-label="RPE, slide for lower values"
      className={`-mx-5 flex touch-pan-x overflow-x-auto overscroll-x-contain px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${blue ? "-my-1 gap-[5px] py-1" : "gap-1.5"}`}
    >
      {RPE_SCALE.map((r) => {
        const on = value === r;
        const isDefault = defaultRpe !== null && r === defaultRpe && value === null;
        const cls = on
          ? blue ? "bg-white text-primary" : "bg-primary text-white"
          : isDefault
            ? blue ? "border-2 border-dashed border-white/70 text-white" : "border-2 border-dashed border-accent-strong text-accent-soft"
            : blue ? "bg-white/15 text-white" : "bg-card-2 text-muted";
        return (
          <button
            key={r}
            data-rpe={r}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : r)}
            className={`display num relative shrink-0 font-extrabold ${blue ? "h-[42px] w-12 rounded-[11px] text-[17px] after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']" : "h-12 w-[3.25rem] rounded-xl text-lg"} ${cls}`}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}
