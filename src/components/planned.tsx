"use client";

import type { Catalog } from "@/lib/hooks";
import type { Suggestion } from "@/lib/progression";
import { formatWeight, weightUnit } from "@/lib/units";
import type { Units } from "@/lib/db/types";

type Item = { exercise_id: string; sets: number; rep_min: number | null; rep_max: number | null; superset_group: number | null; notes: string | null };

export const repsLabel = (min: number | null, max: number | null) =>
  min && max && min !== max ? `${min}–${max}` : String(max ?? min ?? "?");

/** "3 × 8–12" for lifts, "20 min" for cardio. */
export function doseLabel(catalog: Catalog, item: Item) {
  if (catalog.byId.get(item.exercise_id)?.category === "cardio") return item.notes ?? "Cardio";
  return `${item.sets} × ${repsLabel(item.rep_min, item.rep_max)}`;
}

export function suggestionLabel(s: Suggestion | undefined, units: Units) {
  if (!s) return null;
  if (s.change === "new") return s.estimated && s.weight !== null ? `Try ~${formatWeight(s.weight, units)} ${weightUnit(units)}` : "New";
  if (s.weight === null) return s.reps ? `Aim for ${s.reps} reps` : null;
  return `${formatWeight(s.weight, units)} ${weightUnit(units)}${s.change === "up" ? " ↑" : s.change === "down" ? " ↓" : ""}`;
}

/** Muscle names as small pills. */
export function MusclePills({ catalog, ids, light = false, max = 6 }: { catalog: Catalog; ids: string[]; light?: boolean; max?: number }) {
  const shown = ids.slice(0, max);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((m) => (
        <span
          key={m}
          className={`rounded-full px-2.5 py-1 text-xs font-bold tracking-[0.04em] ${light ? "bg-white/18 text-white" : "bg-card-2 text-accent-soft"}`}
        >
          {catalog.muscleName.get(m) ?? m}
        </span>
      ))}
      {ids.length > max && <span className={`px-1 py-1 text-xs font-bold ${light ? "text-[#DCE4FF]" : "text-muted"}`}>+{ids.length - max}</span>}
    </div>
  );
}

/** A superset letter for group numbers: 1 → A. */
export const supersetLetter = (g: number) => String.fromCharCode(64 + g);
