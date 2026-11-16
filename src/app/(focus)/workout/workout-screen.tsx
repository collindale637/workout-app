"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActiveGym, useOpenWorkout } from "@/lib/hooks";
import { useWorkoutActions } from "@/lib/workout";
import { ExercisePicker } from "@/components/exercise-picker";
import { btn, field, label } from "@/components/ui/kit";
import { LiveWorkout } from "./live-workout";

/** Shows the workout in progress, or lets you start one. */
export function WorkoutScreen() {
  const open = useOpenWorkout();
  if (open === undefined) return null;
  return open ? <LiveWorkout workout={open} /> : <StartWorkout />;
}

function StartWorkout() {
  const router = useRouter();
  const params = useSearchParams();
  const repeat = params.get("repeat");
  const { gym, equipment } = useActiveGym();
  const { start } = useWorkoutActions();
  const [name, setName] = useState("");
  const started = useRef(false);

  // "Repeat this workout" from history starts straight away.
  useEffect(() => {
    if (!repeat || started.current) return;
    started.current = true;
    void start({ copyFrom: repeat, gymId: gym?.id ?? null });
  }, [repeat, start, gym?.id]);

  if (repeat) return null;

  return (
    <main className="safe-top flex flex-col gap-4 px-5 pb-6">
      <header className="flex items-center gap-2 pt-2">
        <Link href="/" aria-label="Close" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-accent">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </Link>
        <h1 className="display flex-1 text-3xl font-extrabold">New workout</h1>
      </header>
      <label className="flex flex-col gap-2">
        <span className={label}>NAME (OPTIONAL)</span>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Push day, Legs, Upper A…" />
      </label>
      <div className="flex items-baseline justify-between">
        <h2 className="display text-xl font-extrabold">Pick exercises</h2>
        <button
          type="button"
          className={btn.ghost}
          onClick={async () => {
            await start({ exerciseIds: [], name: name.trim() || null, gymId: gym?.id ?? null });
          }}
        >
          Start empty
        </button>
      </div>
      <ExercisePicker
        mode="multi"
        gymEquipment={gym ? equipment : null}
        gymName={gym?.name}
        onPick={async (ids) => {
          await start({ exerciseIds: ids, name: name.trim() || null, gymId: gym?.id ?? null });
          router.replace("/workout");
        }}
      />
    </main>
  );
}
