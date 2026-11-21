"use client";

import { useState } from "react";
import { RPE_SCALE } from "@/lib/defaults";
import { setProblem } from "@/lib/set-limits";
import { fromDisplayWeight, toDisplayWeight, weightUnit } from "@/lib/units";
import { btn, field, label } from "@/components/ui/kit";
import type { SetType, Units, WorkoutSet } from "@/lib/db/types";

export const TYPE_LABEL: Record<SetType, string> = { warmup: "Warm-up", working: "Working", drop: "Drop" };

/** Edit one logged set (weight, reps, RPE, type) or delete it. Used mid-workout and on a saved workout. */
export function EditSetForm({ set, units, timed = false, defaultRpe, onSave, onDelete }: { set: WorkoutSet; units: Units; /** A hold (plank): the number is seconds. */ timed?: boolean; defaultRpe: number; onSave: (c: Partial<WorkoutSet>) => void; onDelete: () => void }) {
  const [w, setW] = useState(set.weight === null ? "" : String(toDisplayWeight(set.weight, units)));
  const [r, setR] = useState(set.reps === null ? "" : String(set.reps));
  const [rpe, setRpe] = useState<number | null>(set.rpe);
  const [type, setType] = useState<SetType>(set.type);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const wn = w.trim() === "" ? null : Number(w.replace(",", "."));
        const weight = wn === null || Number.isNaN(wn) ? null : fromDisplayWeight(wn, units);
        const reps = r.trim() === "" ? null : Number(r);
        const problem = setProblem(weight, reps, units, timed);
        setError(problem);
        if (problem) return;
        onSave({ weight, reps, rpe, type });
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-2"><span className={label}>WEIGHT ({weightUnit(units).toUpperCase()})</span><input className={field} inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} placeholder="Bodyweight" /></label>
        <label className="flex flex-col gap-2"><span className={label}>{timed ? "SECONDS" : "REPS"}</span><input className={field} inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)} /></label>
      </div>
      {type !== "warmup" && (
        <>
          <span className={label}>RPE (BLANK = {defaultRpe})</span>
          <div className="grid grid-cols-7 gap-1.5">
            {RPE_SCALE.map((v) => (
              <button key={v} type="button" onClick={() => setRpe(rpe === v ? null : v)} className={`display num h-11 rounded-xl text-lg font-extrabold ${rpe === v ? "bg-primary text-white" : "bg-card-2 text-muted"}`}>{v}</button>
            ))}
          </div>
        </>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {(["warmup", "working", "drop"] as SetType[]).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} className={`display h-11 rounded-xl text-sm font-extrabold ${type === t ? "bg-primary text-white" : "bg-card-2 text-muted"}`}>{TYPE_LABEL[t]}</button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm font-bold text-warn">{error}</p>}
      <button type="submit" className={btn.primary}>Save set</button>
      <button type="button" className={btn.danger} onClick={onDelete}>Delete set</button>
    </form>
  );
}
