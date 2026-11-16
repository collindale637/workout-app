"use client";

import { useState } from "react";
import { describeNeeds, isAvailable } from "@/lib/availability";
import { exerciseImageUrl } from "@/lib/exercise-images";
import type { Catalog } from "@/lib/hooks";

/** Pictures, muscles, equipment and how-to for one exercise. */
export function ExerciseInfo({ catalog, id, gymEquipment, gymName }: { catalog: Catalog; id: string; gymEquipment: Set<string> | null; gymName?: string }) {
  const ex = catalog.byId.get(id);
  const [frame, setFrame] = useState(0);
  if (!ex) return <p className="text-muted">Exercise not found.</p>;
  const muscles = catalog.musclesOf.get(id) ?? [];
  const needs = catalog.needs.get(id) ?? [];
  const available = gymEquipment ? isAvailable(needs, gymEquipment) : null;
  const name = (m: string) => catalog.muscleName.get(m) ?? m;

  return (
    <div className="flex flex-col gap-4">
      {ex.images.length > 0 && (
        <button
          type="button"
          onClick={() => setFrame((f) => (f + 1) % ex.images.length)}
          className="relative overflow-hidden rounded-3xl bg-white"
          aria-label="Show the other position"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- remote images, cached by the service worker */}
          <img src={exerciseImageUrl(ex.images[frame])} alt={`${ex.name}, position ${frame + 1}`} className="aspect-[4/3] w-full object-contain" loading="lazy" />
          {ex.images.length > 1 && (
            <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white">
              {frame + 1}/{ex.images.length} · tap
            </span>
          )}
        </button>
      )}
      <div className="flex flex-wrap gap-1.5">
        {muscles.filter((m) => m.role === "primary").map((m) => (
          <span key={m.muscle_id} className="display rounded-full bg-primary px-3 py-1 text-sm font-bold tracking-[0.06em] text-white">{name(m.muscle_id)}</span>
        ))}
        {muscles.filter((m) => m.role === "secondary").map((m) => (
          <span key={m.muscle_id} className="display rounded-full border-2 border-line px-3 py-0.5 text-sm font-bold tracking-[0.06em] text-muted">{name(m.muscle_id)}</span>
        ))}
      </div>
      <div className="rounded-2xl bg-card-2 px-4 py-3">
        <div className="text-xs font-bold tracking-[0.1em] text-muted">NEEDS</div>
        <div className="text-base font-semibold">{describeNeeds(needs, catalog.equipmentName)}</div>
        {available !== null && (
          <div className={`mt-1 text-sm font-bold ${available ? "text-good" : "text-warn"}`}>
            {available ? `✓ ${gymName ?? "This gym"} has this` : `✕ ${gymName ?? "This gym"} doesn't have everything for this`}
          </div>
        )}
      </div>
      {ex.instructions.length > 0 && (
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-base font-medium text-ink/90 marker:font-bold marker:text-accent">
          {ex.instructions.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
    </div>
  );
}
