"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useData } from "@/lib/db/provider";
import { useGeneratorInputs } from "@/lib/smart";
import { usePlanActions } from "@/lib/plans";
import { useWorkoutActions } from "@/lib/workout";
import { useOpenWorkout } from "@/lib/hooks";
import { adaptToGym, dayStyle, dose, generateWorkout, isTimed } from "@/lib/generator";
import { isCardioExercise } from "@/lib/cardio";
import { formatDuration } from "@/lib/units";
import { ExercisePicker } from "@/components/exercise-picker";
import { ExerciseInfo } from "@/components/exercise-info";
import { MuscleChooser } from "@/components/muscle-chooser";
import { doseLabel, MusclePills, supersetLetter } from "@/components/planned";
import { PageHeader, Sheet, btn, field, label } from "@/components/ui/kit";
import { ReorderList, type ReorderItem } from "@/components/reorder-list";
import { TargetsEditor } from "@/components/targets-editor";
import { UndoIcon } from "@/components/icons";
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
        // Hold a row and drag to reorder (like the live workout); swipe left for Swap / How-to / Remove; tap for targets.
        <ReorderList
          onReorder={(ids) => void actions.reorderExercises(day.id, ids)}
          items={list.map((e, i): ReorderItem => {
            const ex = catalog.byId.get(e.exercise_id);
            const linked = e.superset_group !== null;
            const linkedAbove = linked && i > 0 && list[i - 1].superset_group === e.superset_group;
            return {
              id: e.id,
              ariaLabel: `${ex?.name ?? e.exercise_id}: edit targets`,
              onTap: () => setMenuFor(e),
              before: linkedAbove ? <div className="ml-6 h-2 w-1 bg-accent-strong" aria-hidden="true" /> : undefined,
              faceClassName: `flex min-h-16 items-center rounded-3xl bg-card py-3 pr-3 pl-4 ring-inset ${linked ? "ring-2 ring-accent-strong/50" : "ring-1 ring-line"}`,
              face: (
                <>
                  <span className="display num w-6 shrink-0 text-lg font-extrabold text-muted">{i + 1}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-base font-bold">{ex?.name ?? e.exercise_id}</span>
                    <span className="text-sm font-medium text-muted">
                      {doseLabel(catalog, e)}
                      {e.rest_sec ? ` · rest ${formatDuration(e.rest_sec)}` : ""}
                      {linked ? ` · Superset ${supersetLetter(e.superset_group!)}` : ""}
                    </span>
                  </span>
                </>
              ),
              trailing: (
                <svg className="shrink-0 text-[#454d6e]" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
                </svg>
              ),
              actions: [
                { key: "swap", label: "Swap", icon: <span className="text-xl" aria-hidden="true">⇄</span>, className: "bg-primary text-white", onPress: () => setPicker(e) },
                { key: "how", label: "How-to", icon: <span className="text-xl" aria-hidden="true">ⓘ</span>, className: "bg-[#2a3150] text-white", onPress: () => setInfoFor(e.exercise_id) },
                { key: "remove", label: "Remove", icon: <span className="text-xl" aria-hidden="true">✕</span>, className: "bg-danger text-white", onPress: () => void actions.removeExercise(e.id) },
              ],
            };
          })}
        />
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
          <button type="button" className="display flex min-h-11 items-center gap-1.5 px-3 text-sm font-extrabold tracking-[0.06em] text-accent" onClick={() => void restore(false)}>
            <UndoIcon size={16} /> Undo regenerate
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
            timed={isTimed(catalog.byId.get(menuFor.exercise_id)?.name ?? "", menuFor.notes)}
            isCardio={isCardioExercise(catalog.byId.get(menuFor.exercise_id))}
            onSave={(c) => actions.updateExercise(menuFor.id, c)}
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
  row, timed, isCardio, canSuperset, onSave, onSwap, onInfo, onSuperset, onRemove,
}: {
  row: PlanExercise; timed: boolean; isCardio: boolean; canSuperset: boolean;
  onSave: (c: Partial<PlanExercise>) => void | Promise<void>; onSwap: () => void; onInfo: () => void; onSuperset: () => void; onRemove: () => void;
}) {
  const [minutes, setMinutes] = useState(Number(/\d+/.exec(row.notes ?? "")?.[0] ?? 15));
  if (!isCardio) {
    return (
      <TargetsEditor
        timed={timed}
        initial={{ sets: row.sets, repMin: row.rep_min ?? 8, repMax: row.rep_max ?? 12, rest: row.rest_sec ?? 90 }}
        onSave={(t) => onSave({ sets: t.sets, rep_min: t.repMin, rep_max: t.repMax, rest_sec: t.rest })}
        onSwap={onSwap}
        onInfo={onInfo}
        superset={canSuperset ? { linked: row.superset_group !== null, onToggle: onSuperset } : undefined}
        onRemove={onRemove}
        removeLabel="Remove from this day"
      />
    );
  }
  const chip = "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-card-2 px-2 text-sm font-bold active:bg-line";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-1 rounded-2xl bg-card-2 p-3">
        <span className={label}>MINUTES</span>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Fewer minutes" className="h-11 w-11 rounded-full border-2 border-line text-xl font-bold" onClick={() => setMinutes(Math.max(5, minutes - 5))}>−</button>
          <span className="display num w-14 text-center text-2xl font-extrabold">{minutes}</span>
          <button type="button" aria-label="More minutes" className="h-11 w-11 rounded-full border-2 border-line text-xl font-bold" onClick={() => setMinutes(minutes + 5)}>+</button>
        </div>
        <button type="button" className={`${btn.secondary} mt-1 w-full`} onClick={() => void onSave({ notes: `${minutes} min` })}>Save</button>
      </div>
      <div className="flex gap-2">
        <button type="button" className={chip} onClick={onSwap}>⇄ Swap</button>
        <button type="button" className={chip} onClick={onInfo}>ⓘ How-to</button>
      </div>
      <button type="button" className="min-h-12 text-base font-bold text-danger" onClick={onRemove}>Remove from this day</button>
    </div>
  );
}
