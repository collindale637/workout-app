"use client";

import Link from "next/link";
import { useState } from "react";
import { useData, useProfile } from "@/lib/db/provider";
import { markDirty } from "@/lib/db/sync";
import { useActiveGym, useCatalog, useOpenWorkout } from "@/lib/hooks";
import { useEffectivePrefs } from "@/lib/smart";
import { closestMatch, type Swap } from "@/lib/generator";
import { isAvailable } from "@/lib/availability";
import { Sheet, btn } from "@/components/ui/kit";

/** The active-gym pill from the design. Tap to switch gyms. */
export function GymSwitcher() {
  const { gyms, gym } = useActiveGym();
  const { db, requestSync } = useData();
  const { profile, save } = useProfile();
  const catalog = useCatalog();
  const open = useOpenWorkout();
  const { prefs } = useEffectivePrefs();
  const [sheet, setSheet] = useState(false);
  const [result, setResult] = useState<{ gym: string; swaps: Swap[] } | null>(null);

  /** In a workout that's going, swap exercises you haven't started that the new gym can't do. */
  async function swapOpenWorkout(gymId: string): Promise<Swap[]> {
    if (!open || !catalog) return [];
    const have = new Set((await db.gym_equipment.where("gym_id").equals(gymId).toArray()).map((r) => r.equipment_id));
    const wexs = await db.workout_exercises.where("workout_id").equals(open.id).sortBy("sort_order");
    const started = new Set([
      ...(await db.sets.where("workout_exercise_id").anyOf(wexs.map((w) => w.id)).toArray()).map((s) => s.workout_exercise_id),
      ...(await db.cardio_sessions.where("workout_id").equals(open.id).toArray()).map((c) => c.workout_exercise_id),
    ]);
    const used = new Set(wexs.map((w) => w.exercise_id));
    const swaps: Swap[] = [];
    for (const w of wexs) {
      if (started.has(w.id) || isAvailable(catalog.needs.get(w.exercise_id) ?? [], have)) continue;
      const to = closestMatch(catalog, w.exercise_id, { gymEquipment: have, experience: profile?.experience ?? "intermediate", prefs, exclude: used });
      swaps.push({ from: w.exercise_id, to });
      if (to) {
        used.add(to);
        await db.workout_exercises.update(w.id, { exercise_id: to });
        await markDirty(db, "workout_exercises", w.id);
      }
    }
    await db.workouts.update(open.id, { gym_id: gymId });
    await markDirty(db, "workouts", open.id);
    requestSync(2000);
    return swaps;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setSheet(true)}
        className="display flex h-10 max-w-[45vw] items-center gap-1.5 rounded-full border-2 border-accent-strong/70 bg-card px-3.5 text-[15px] font-bold tracking-[0.06em] text-accent-soft"
        aria-label={gym ? `Active gym: ${gym.name}. Change gym` : "Set up a gym"}
      >
        <span className="truncate">{gym ? gym.name : "No gym yet"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Where are you training?">
        <ul className="flex flex-col gap-2">
          {gyms.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={async () => {
                  const changed = g.id !== gym?.id;
                  await save({ active_gym_id: g.id });
                  setSheet(false);
                  if (changed && open) {
                    const swaps = await swapOpenWorkout(g.id);
                    if (swaps.length) setResult({ gym: g.name, swaps });
                  }
                }}
                className={`flex min-h-14 w-full items-center justify-between rounded-2xl border-2 px-4 text-left text-lg font-bold ${
                  g.id === gym?.id ? "border-accent-strong bg-primary/15 text-accent-soft" : "border-line bg-card-2"
                }`}
              >
                {g.name}
                {g.id === gym?.id && <span className="display text-sm font-extrabold tracking-[0.08em]">Here now</span>}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm font-medium text-muted">Today&apos;s workout adjusts to the gym you pick: anything it can&apos;t do swaps for the closest match.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href="/more/gyms/edit?new=1" className={btn.secondary} onClick={() => setSheet(false)}>+ Add gym</Link>
          <Link href="/more/gyms" className={btn.secondary} onClick={() => setSheet(false)}>Edit gyms</Link>
        </div>
      </Sheet>
      <Sheet open={result !== null} onClose={() => setResult(null)} title={`Switched to ${result?.gym ?? ""}`}>
        {result && catalog && (
          <div className="flex flex-col gap-3">
            <p className="text-base font-medium text-muted">Your workout in progress was adjusted:</p>
            <ul className="flex flex-col gap-2">
              {result.swaps.map((s) => (
                <li key={s.from} className="rounded-2xl bg-card-2 px-4 py-3 text-base font-bold">
                  {catalog.byId.get(s.from)?.name ?? s.from}
                  <span className="text-muted"> → </span>
                  {s.to ? catalog.byId.get(s.to)?.name ?? s.to : <span className="text-warn">no match here, kept as is</span>}
                </li>
              ))}
            </ul>
            <button type="button" className={btn.primary} onClick={() => setResult(null)}>Got it</button>
          </div>
        )}
      </Sheet>
    </>
  );
}
