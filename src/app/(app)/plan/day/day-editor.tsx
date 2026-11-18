"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useData } from "@/lib/db/provider";
import { useGeneratorInputs } from "@/lib/smart";
import { usePlanActions } from "@/lib/plans";
import { useWorkoutActions } from "@/lib/workout";
import { useOpenWorkout } from "@/lib/hooks";
import { adaptToGym, dayStyle, dose, generateWorkout } from "@/lib/generator";
import { isCardioExercise } from "@/lib/cardio";
import { formatDuration } from "@/lib/units";
import { ExercisePicker } from "@/components/exercise-picker";
import { ExerciseInfo } from "@/components/exercise-info";
import { MuscleChooser } from "@/components/muscle-chooser";
import { doseLabel, MusclePills, supersetLetter } from "@/components/planned";
import { PageHeader, Sheet, btn, field, label } from "@/components/ui/kit";
import { AiWorkoutSheet, Sparkle } from "@/components/ai";
import { targetsFor } from "@/lib/ai/apply";
import type { PlanExercise } from "@/lib/db/types";

export function DayEditor() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const { db } = useData();
  const inputs = useGeneratorInputs();
  const actions = usePlanActions();
  const { start } = useWorkoutActions();
  const open = useOpenWorkout();
  const data = useLiveQuery(async () => {
    const day = await db.plan_days.get(id);
    if (!day) return null;
    const plan = await db.plans.get(day.plan_id);
    const list = (await db.plan_exercises.where("plan_day_id").equals(id).toArray()).sort((a, b) => a.sort_order - b.sort_order);
    return { day, plan, list };
  }, [db, id]);

  const [menuFor, setMenuFor] = useState<PlanExercise | null>(null);
  const [picker, setPicker] = useState<null | "add" | PlanExercise>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  const [musclesOpen, setMusclesOpen] = useState(false);
  const [regenSeed, setRegenSeed] = useState(1);
  // Lists replaced by Regenerate on this visit, oldest first, so it can be undone.
  const [before, setBefore] = useState<PlanExercise[][]>([]);
  const [aiOpen, setAiOpen] = useState(false);

  const { catalog, profile, gym, gymEquipment, prefs } = inputs;
  if (data === undefined || !catalog || !profile) return null;
  if (!data) {
    return (
      <main className="flex flex-col gap-4">
        <PageHeader title="Day not found" back="/plan" />
      </main>
    );
  }
  const { day, plan, list } = data;
  const goal = plan?.goal ?? profile.goal;
  const style = dayStyle(day.name);
  const genOpts = { gymEquipment, experience: profile.experience, prefs };

  const doseFor = (exerciseId: string) => {
    const ex = catalog.byId.get(exerciseId);
    if (isCardioExercise(ex)) return { sets: 1, rep_min: null, rep_max: null, rest_sec: null, notes: "15 min" };
    const role = ex?.movement_pattern === "core" ? "core" : ex?.mechanic === "compound" ? "compound" : "isolation";
    return { ...dose(goal, role, profile.experience, style.focus), notes: null };
  };

  async function regenerate() {
    const { items } = generateWorkout(catalog!, {
      targets: day.target_muscle_ids, gymEquipment, goal, experience: profile!.experience, sessionMinutes: profile!.session_minutes,
      prefs, seed: regenSeed, cardioPref: profile!.cardio_pref, cardio: style.cardio ?? undefined, focus: style.focus, avoid: new Set(list.map((e) => e.exercise_id)),
    });
    setRegenSeed(regenSeed + 1);
    setBefore([...before, list]);
    await actions.replaceExercises(day.id, items);
  }

  /** Puts back the list from before the last regenerate (or the very first one). Rows get new ids. */
  async function restore(toOriginal: boolean) {
    const back = toOriginal ? before[0] : before[before.length - 1];
    if (!back) return;
    setBefore(toOriginal ? [] : before.slice(0, -1));
    await actions.replaceExercises(day.id, back);
  }

  async function startNow() {
    if (open) {
      router.push("/workout");
      return;
    }
    const adapted = adaptToGym(catalog!, list, genOpts);
    await start({ items: adapted.items, name: day.name, gymId: gym?.id ?? null, planDayId: day.id, source: "plan" });
    router.push("/workout");
  }

  return (
    <main className="flex flex-col gap-4 pb-6">
      <PageHeader
        title={day.name}
        back="/plan"
        right={
          <button type="button" className={btn.ghost} onClick={() => setRename(day.name)}>Rename</button>
        }
      />
      <p className="-mt-3 text-sm font-semibold text-muted">{plan?.name} · Day {day.day_order}</p>

      <button type="button" onClick={() => setMusclesOpen(true)} className="flex flex-col gap-2 rounded-3xl border border-line bg-card p-4 text-left">
        <span className="flex items-baseline justify-between">
          <span className={label}>TARGET MUSCLES</span>
          <span className="display text-sm font-extrabold tracking-[0.06em] text-accent">Edit</span>
        </span>
        <MusclePills catalog={catalog} ids={day.target_muscle_ids} max={12} />
      </button>

      {list.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-line px-5 py-8 text-center text-base font-medium text-muted">
          No exercises yet. Add some, or tap Regenerate to fill the day.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((e, i) => {
            const ex = catalog.byId.get(e.exercise_id);
            const linked = e.superset_group !== null;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setMenuFor(e)}
                  className={`flex min-h-16 w-full items-center gap-3 rounded-3xl border bg-card px-4 py-3 text-left active:bg-card-2 ${linked ? "border-accent-strong/50" : "border-line"}`}
                >
                  <span className="display num w-6 shrink-0 text-lg font-extrabold text-muted">{i + 1}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-base font-bold">{ex?.name ?? e.exercise_id}</span>
                    <span className="text-sm font-medium text-muted">
                      {doseLabel(catalog, e)}
                      {e.rest_sec ? ` · rest ${formatDuration(e.rest_sec)}` : ""}
                      {linked ? ` · Superset ${supersetLetter(e.superset_group!)}` : ""}
                    </span>
                  </span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="shrink-0 text-muted" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01" /></svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={btn.secondary} onClick={() => setPicker("add")}>+ Add</button>
        <button
          type="button"
          className={btn.secondary}
          onClick={async () => {
            if (list.length && !confirm("Replace this day's exercises with a new set for the same muscles?")) return;
            await regenerate();
          }}
        >
          ⟳ Regenerate
        </button>
      </div>
      {before.length > 0 && (
        <div className="-mt-2 flex items-center justify-center gap-2">
          <button type="button" className="display min-h-11 px-3 text-sm font-extrabold tracking-[0.06em] text-accent" onClick={() => void restore(false)}>
            ↶ Undo regenerate
          </button>
          {before.length > 1 && (
            <>
              <span className="text-muted" aria-hidden="true">·</span>
              <button type="button" className="display min-h-11 px-3 text-sm font-extrabold tracking-[0.06em] text-accent" onClick={() => void restore(true)}>
                Back to original
              </button>
            </>
          )}
        </div>
      )}
      <button type="button" className={btn.secondary} onClick={() => setAiOpen(true)}>
        <Sparkle /> Customize with AI
      </button>
      <button type="button" className={btn.primary} disabled={!list.length} onClick={startNow}>
        {open ? "Resume your open workout" : "Start this day now"}
      </button>

      {aiOpen && (
        <AiWorkoutSheet
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          kind="day"
          title={`Change ${day.name} with AI`}
          intro={`Say what to change. Claude reworks this day using what ${gym?.name ?? "your gym"} has; you'll see it before anything is saved.`}
          current={{ name: day.name, items: list }}
          actions={[
            {
              label: "Replace this day",
              primary: true,
              run: async (w) => {
                await actions.replaceExercises(day.id, w.items);
                const targets = targetsFor(catalog, w.items);
                await actions.updateDay(day.id, { name: w.name || day.name, ...(targets.length ? { target_muscle_ids: targets } : {}) });
                setAiOpen(false);
              },
            },
          ]}
        />
      )}

      <Sheet open={menuFor !== null} onClose={() => setMenuFor(null)} title={menuFor ? catalog.byId.get(menuFor.exercise_id)?.name : undefined}>
        {menuFor && (
          <ExerciseMenu
            row={menuFor}
            isCardio={isCardioExercise(catalog.byId.get(menuFor.exercise_id))}
            isFirst={list[0]?.id === menuFor.id}
            isLast={list[list.length - 1]?.id === menuFor.id}
            onSave={async (c) => { await actions.updateExercise(menuFor.id, c); setMenuFor(null); }}
            onMove={async (dir) => { await actions.moveExercise(day.id, menuFor.id, dir); setMenuFor(null); }}
            onSwap={() => { setPicker(menuFor); setMenuFor(null); }}
            onInfo={() => { setInfoFor(menuFor.exercise_id); setMenuFor(null); }}
            onSuperset={async () => {
              const idx = list.findIndex((x) => x.id === menuFor.id);
              const next = list[idx + 1];
              if (menuFor.superset_group !== null) {
                await actions.updateExercise(menuFor.id, { superset_group: null });
                const left = list.filter((x) => x.superset_group === menuFor.superset_group && x.id !== menuFor.id);
                if (left.length === 1) await actions.updateExercise(left[0].id, { superset_group: null });
              } else if (next) {
                const group = next.superset_group ?? Math.max(0, ...list.map((x) => x.superset_group ?? 0)) + 1;
                await actions.updateExercise(menuFor.id, { superset_group: group });
                if (next.superset_group === null) await actions.updateExercise(next.id, { superset_group: group });
              }
              setMenuFor(null);
            }}
            canSuperset={menuFor.superset_group !== null || list[list.length - 1]?.id !== menuFor.id}
            onRemove={async () => { await actions.removeExercise(menuFor.id); setMenuFor(null); }}
          />
        )}
      </Sheet>

      <Sheet open={picker !== null} onClose={() => setPicker(null)} title={picker === "add" ? "Add exercises" : "Swap for…"}>
        {picker && (
          <ExercisePicker
            mode={picker === "add" ? "multi" : "single"}
            gymEquipment={gymEquipment}
            gymName={gym?.name}
            excludeIds={list.map((e) => e.exercise_id)}
            initialFilter={picker !== "add" && isCardioExercise(catalog.byId.get(picker.exercise_id)) ? "cardio" : undefined}
            initialMuscles={
              picker === "add"
                ? day.target_muscle_ids
                : (catalog.musclesOf.get(picker.exercise_id) ?? []).filter((m) => m.role === "primary").map((m) => m.muscle_id)
            }
            onPick={async (ids) => {
              if (picker === "add") {
                await actions.addExercises(day.id, ids.map((exId) => ({ exercise_id: exId, ...doseFor(exId), superset_group: null })));
              } else {
                const d = doseFor(ids[0]);
                const wasCardio = isCardioExercise(catalog.byId.get(picker.exercise_id));
                const nowCardio = isCardioExercise(catalog.byId.get(ids[0]));
                await actions.updateExercise(picker.id, wasCardio === nowCardio ? { exercise_id: ids[0] } : { exercise_id: ids[0], ...d });
              }
              setPicker(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={infoFor !== null} onClose={() => setInfoFor(null)}>
        {infoFor && <ExerciseInfo catalog={catalog} id={infoFor} gymEquipment={gymEquipment} gymName={gym?.name} />}
      </Sheet>

      <Sheet open={rename !== null} onClose={() => setRename(null)} title="Rename day">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (rename?.trim()) await actions.updateDay(day.id, { name: rename.trim() });
            setRename(null);
          }}
        >
          <input className={field} value={rename ?? ""} onChange={(e) => setRename(e.target.value)} autoFocus />
          <p className="text-sm font-medium text-muted">Tip: a name with &ldquo;+ Cardio&rdquo; gets a cardio block when regenerated; &ldquo;Power&rdquo; makes it heavy.</p>
          <button type="submit" className={btn.primary}>Save</button>
        </form>
      </Sheet>

      <Sheet open={musclesOpen} onClose={() => setMusclesOpen(false)} title="What this day trains">
        <MuscleChooser
          initial={day.target_muscle_ids}
          onSave={async (ids) => {
            await actions.updateDay(day.id, { target_muscle_ids: ids });
            setMusclesOpen(false);
          }}
        />
      </Sheet>
    </main>
  );
}

function ExerciseMenu({
  row, isCardio, isFirst, isLast, canSuperset, onSave, onMove, onSwap, onInfo, onSuperset, onRemove,
}: {
  row: PlanExercise; isCardio: boolean; isFirst: boolean; isLast: boolean; canSuperset: boolean;
  onSave: (c: Partial<PlanExercise>) => void; onMove: (dir: -1 | 1) => void; onSwap: () => void; onInfo: () => void; onSuperset: () => void; onRemove: () => void;
}) {
  const [sets, setSets] = useState(row.sets);
  const [min, setMin] = useState(row.rep_min ?? 8);
  const [max, setMax] = useState(row.rep_max ?? 12);
  const [rest, setRest] = useState(row.rest_sec ?? 90);
  const [minutes, setMinutes] = useState(Number(/\d+/.exec(row.notes ?? "")?.[0] ?? 15));
  const item = "flex min-h-13 w-full items-center gap-3 rounded-2xl bg-card-2 px-4 text-left text-base font-bold";
  const small = (v: number, set: (n: number) => void, l: string, stepBy = 1, fmt?: (n: number) => string) => (
    <div className="flex flex-col items-center gap-1">
      <span className={label}>{l}</span>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Less ${l.toLowerCase()}`} className="h-11 w-11 rounded-full border-2 border-line text-xl font-bold" onClick={() => set(Math.max(stepBy >= 5 ? stepBy : 1, v - stepBy))}>−</button>
        <span className="display num w-14 text-center text-2xl font-extrabold">{fmt ? fmt(v) : v}</span>
        <button type="button" aria-label={`More ${l.toLowerCase()}`} className="h-11 w-11 rounded-full border-2 border-line text-xl font-bold" onClick={() => set(v + stepBy)}>+</button>
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      {isCardio ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-card-2 p-3">
          {small(minutes, setMinutes, "MINUTES", 5)}
          <button type="button" className={btn.secondary} onClick={() => onSave({ notes: `${minutes} min` })}>Save</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-card-2 p-3">
          {small(sets, setSets, "SETS")}
          {small(rest, setRest, "REST", 15, formatDuration)}
          {small(min, setMin, "REPS FROM")}
          {small(max, setMax, "REPS TO")}
          <button
            type="button"
            className={`${btn.secondary} col-span-2`}
            onClick={() => onSave({ sets: Math.min(20, sets), rep_min: Math.min(min, max), rep_max: Math.max(min, max), rest_sec: rest })}
          >
            Save targets
          </button>
        </div>
      )}
      <button type="button" className={item} onClick={onSwap}>⇄ Swap exercise</button>
      <button type="button" className={item} onClick={onInfo}>ⓘ How to do it</button>
      {!isCardio && canSuperset && (
        <button type="button" className={item} onClick={onSuperset}>
          🔗 {row.superset_group !== null ? "Remove from superset" : "Superset with the next exercise"}
        </button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={isFirst} className={`${item} justify-center disabled:opacity-40`} onClick={() => onMove(-1)}>↑ Move up</button>
        <button type="button" disabled={isLast} className={`${item} justify-center disabled:opacity-40`} onClick={() => onMove(1)}>↓ Move down</button>
      </div>
      <button type="button" className={`${item} text-danger`} onClick={onRemove}>✕ Remove from this day</button>
    </div>
  );
}
