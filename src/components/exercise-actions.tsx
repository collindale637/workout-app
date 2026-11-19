"use client";

import { useState } from "react";
import { ExercisePicker } from "@/components/exercise-picker";
import { useSmartPicks } from "@/lib/ai/picks";
import { useCatalog } from "@/lib/hooks";
import type { SwapWhy } from "@/lib/generator";
import { btn, field } from "@/components/ui/kit";

/* Shared by the live workout list and Today's exercise sheet: the swipe-left Swap / How-to / Notes / Remove pieces. */

export function RowIcon({ name }: { name: "swap" | "how" | "notes" | "remove" }) {
  const d = {
    swap: "M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
    how: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5v.01",
    notes: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3",
    remove: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  }[name];
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function NotesForm({ initial, onSave }: { initial: string | null; onSave: (t: string | null) => void }) {
  const [text, setText] = useState(initial ?? "");
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); onSave(text.trim() || null); }}>
      <textarea className={`${field} h-32 py-3`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Seat height 4, felt strong, left shoulder tight…" autoFocus />
      <button type="submit" className={btn.primary}>Save</button>
    </form>
  );
}

const LIFT_REASONS: { key: Exclude<SwapWhy, null>; label: string }[] = [
  { key: "busy", label: "Equipment taken" },
  { key: "hurts", label: "Hurts" },
  { key: "hard", label: "Too hard" },
  { key: "different", label: "Something different" },
];
const CARDIO_REASONS: { key: Exclude<SwapWhy, null>; label: string }[] = [
  { key: "busy", label: "Machine taken" },
  { key: "impact", label: "Lower impact" },
  { key: "outdoors", label: "Outdoors" },
  { key: "different", label: "Something different" },
];

/** The exercise picker with "Best swaps" / "Suggested for today" (rules first, then AI) on top. */
export function SmartExercisePicker({
  mode,
  swapFrom,
  fromIsCardio,
  today,
  onPick,
  ...picker
}: {
  mode: "swap" | "add";
  swapFrom?: string;
  fromIsCardio: boolean;
  today: { name: string; items: { exercise_id: string; sets_done: number; sets_planned: number }[] };
  onPick: (ids: string[]) => void;
  gymEquipment: Set<string> | null;
  gymName?: string;
  excludeIds: string[];
  initialMuscles?: string[];
}) {
  const [why, setWhy] = useState<SwapWhy>(null);
  const picks = useSmartPicks({ kind: mode === "swap" ? "swap" : "suggest", active: true, fromId: swapFrom, why, today });
  const name = useCatalog()?.byId.get(swapFrom ?? "")?.name;
  return (
    <div className="flex flex-col gap-3">
      {mode === "swap" && name && (
        <p className="text-sm font-semibold text-muted">
          Replacing <b className="text-ink">{name}</b>
        </p>
      )}
      <ExercisePicker
        {...picker}
        mode={mode === "swap" ? "single" : "multi"}
        onPick={onPick}
        initialFilter={fromIsCardio ? "cardio" : undefined}
        smart={{ title: mode === "swap" ? "Best swaps" : "Suggested for today", picks }}
        reasons={mode === "swap" ? (fromIsCardio ? CARDIO_REASONS : LIFT_REASONS) : undefined}
        reason={why}
        onReason={(k) => setWhy(k as SwapWhy)}
      />
    </div>
  );
}
