"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useData, useProfile } from "@/lib/db/provider";
import { newId } from "@/lib/db/dexie";
import { useActiveGym, useCatalog } from "@/lib/hooks";
import { useCardioTimer } from "@/lib/cardio-timer";
import { CARDIO_TYPES, cardioElapsedSec, cardioLabel, cardioSummary, cardioTypeFor, isCardioExercise, type CardioTimer } from "@/lib/cardio";
import { useExerciseHistory, useWorkoutActions, type RestState } from "@/lib/workout";
import { loadFor, suggestNext } from "@/lib/progression";
import { startingWeightFor, useStartingProfile } from "@/lib/smart";
import { useNow } from "@/lib/use-now";
import { isAvailable } from "@/lib/availability";
import { RPE_SCALE } from "@/lib/defaults";
import { formatDuration, formatWeight, fromDisplayWeight, isPerHand, toDisplayWeight, volumeLb, weightStep, weightUnit } from "@/lib/units";
import { ExercisePicker } from "@/components/exercise-picker";
import { useSmartPicks } from "@/lib/ai/picks";
import type { SwapWhy } from "@/lib/generator";
import { ExerciseInfo } from "@/components/exercise-info";
import { Sheet, btn, doneDisc, field, label } from "@/components/ui/kit";
import { RpeSlider } from "@/components/rpe-slider";
import { ReorderList, type ReorderItem, type RowAction } from "@/components/reorder-list";
import { filledSets, nextSlot, slotRows } from "@/lib/set-slots";
import { setsLine, shortDate } from "@/lib/compare";
import { isDoubleTap } from "@/lib/double-tap";
import { useWorkoutComparison } from "@/lib/compare-data";
import { NotDoneBlock, PrBadge } from "@/components/workout-summary";
import { WARMUP_SLOT, plannedWarmupId, warmupDose } from "@/lib/warmup";
import { CardioPanel, type CardioSave } from "./cardio-panel";
import { RestBar, SetDock, type DockSet, type DockToast, type DockUpNext } from "./set-dock";
import type { CardioSession, CardioType, SetType, Units, Workout, WorkoutExercise, WorkoutSet } from "@/lib/db/types";

type Draft = { weight: number | null; reps: number | null; rpe: number | null; type: SetType };

const TYPE_LABEL: Record<SetType, string> = { warmup: "Warm-up", working: "Working", drop: "Drop" };

export function LiveWorkout({ workout }: { workout: Workout }) {
  const router = useRouter();
  const { db } = useData();
  const { profile } = useProfile();
  const catalog = useCatalog();
  const { gym, equipment, equipmentRows } = useActiveGym();
  const who = useStartingProfile();
  const actions = useWorkoutActions();
  const now = useNow(1000);
  const units: Units = profile?.units ?? "lb";
  const defaultRpe = profile?.default_rpe ?? 8;

  const wexs = useLiveQuery(() => db.workout_exercises.where("workout_id").equals(workout.id).sortBy("sort_order"), [db, workout.id]);
  const sets = useLiveQuery(
    async () => (wexs?.length ? db.sets.where("workout_exercise_id").anyOf(wexs.map((w) => w.id)).toArray() : []),
    [db, wexs],
  );
  const rest = useLiveQuery(() => db.getMeta<RestState>("rest"), [db]) ?? null;
  const history = useExerciseHistory(useMemo(() => [...new Set((wexs ?? []).map((w) => w.exercise_id))], [wexs]), workout.id);

  const setsBy = useMemo(() => {
    const m = new Map<string, WorkoutSet[]>();
    for (const s of sets ?? []) m.set(s.workout_exercise_id, [...(m.get(s.workout_exercise_id) ?? []), s]);
    for (const list of m.values()) list.sort((a, b) => a.set_no - b.set_no);
    return m;
  }, [sets]);

  // Cardio exercises have no sets: they're done once their results are saved.
  const cardioRows = useLiveQuery(() => db.cardio_sessions.where("workout_id").equals(workout.id).toArray(), [db, workout.id]);
  const { timer, start: startTimer, stop: stopTimer, resume: resumeTimer, clear: clearTimer } = useCardioTimer();
  const cardioByWex = useMemo(() => {
    const m = new Map<string, CardioSession>();
    for (const c of cardioRows ?? []) if (c.workout_exercise_id) m.set(c.workout_exercise_id, c);
    return m;
  }, [cardioRows]);
  const extraCardio = (cardioRows ?? []).filter((c) => !c.workout_exercise_id).sort((a, b) => a.started_at.localeCompare(b.started_at));

  const isCardioWex = (w: WorkoutExercise) => isCardioExercise(catalog?.byId.get(w.exercise_id));
  /** Planned sets that are finished: logged, or skipped. */
  const filled = (w: WorkoutExercise) => filledSets(setsBy.get(w.id) ?? [], w.target_sets ?? 3, w.skipped_sets);
  const done = (w: WorkoutExercise) => (isCardioWex(w) ? cardioByWex.has(w.id) : filled(w) >= (w.target_sets ?? 3));
  const remaining = (w: WorkoutExercise) => !done(w);
  const equipmentIdsOf = (exerciseId: string) => (catalog?.needs.get(exerciseId) ?? []).map((n) => n.equipment_id);
  // The one lift (at most) that gets a planned warm-up row; see src/lib/warmup.ts for when it's worth it.
  const warmupId = wexs && catalog ? plannedWarmupId(wexs, (id) => catalog.byId.get(id), equipmentIdsOf) : null;
  /** pending = warm-up row is next; skipped = you tapped Skip on it; null = none planned, or it's logged. */
  const warmupState = (w: WorkoutExercise): "pending" | "skipped" | null => {
    if (w.id !== warmupId) return null;
    const logged = setsBy.get(w.id) ?? [];
    if (logged.some((s) => s.type === "warmup")) return null;
    if ((w.skipped_sets ?? []).includes(WARMUP_SLOT)) return "skipped";
    return logged.length ? null : "pending"; // started working sets without it: no nagging
  };

  const [currentId, setCurrentId] = useState<string | null>(null);
  const timerWexId = timer && timer.workoutId === workout.id ? timer.wexId : null;
  // Cardio added with "+ Cardio" (not part of the plan) runs in the blue card too: currentId "cardio:<session id or timer>".
  const extraTimer = timer && timer.workoutId === workout.id && !timer.wexId ? timer : null;
  const extraKey = currentId?.startsWith("cardio:") ? currentId.slice(7) : currentId === null && extraTimer ? "timer" : null;
  const extra = (() => {
    if (!extraKey) return null;
    const sessionId = extraKey === "timer" ? (extraTimer?.sessionId ?? null) : extraKey;
    const session = sessionId ? (extraCardio.find((c) => c.id === sessionId) ?? null) : null;
    const t = extraTimer && (extraKey === "timer" || extraTimer.sessionId === extraKey) ? extraTimer : null;
    if (!session && !t) return null;
    return { key: `cardio:${session?.id ?? "timer"}`, session, timer: t, type: (t?.type ?? session!.type) as CardioType };
  })();
  const current =
    wexs?.find((w) => w.id === currentId) ?? wexs?.find((w) => w.id === timerWexId) ?? wexs?.find(remaining) ?? wexs?.[wexs.length - 1] ?? null;

  const [draft, setDraft] = useState<Draft>({ weight: null, reps: null, rpe: null, type: "working" });
  const [draftFor, setDraftFor] = useState<string | null>(null);
  // Undo puts back the weight/reps you had entered, instead of a fresh prefill.
  const restoreDraft = useRef<{ wexId: string; count: number; draft: Draft } | null>(null);

  // Prefill the next set: your last set of this exercise today, else the same set from last time.
  useEffect(() => {
    // Wait until this exercise's history has loaded, or the first set would prefill blank and never update.
    if (!current || !history || !history.has(current.exercise_id) || isCardioWex(current)) return;
    // `who` is in the key so the starting-weight estimate fills in if your bodyweight finishes loading after the screen opens.
    const warm = warmupState(current);
    const key = `${current.id}:${(setsBy.get(current.id) ?? []).length}:${who ? "w" : "n"}:${warm ?? ""}`;
    const back = restoreDraft.current;
    if (back && back.wexId === current.id && back.count === (setsBy.get(current.id) ?? []).length) {
      restoreDraft.current = null;
      setDraft(back.draft);
      setDraftFor(key);
      return;
    }
    if (draftFor === key) return;
    const done = setsBy.get(current.id) ?? [];
    // Warm-ups never set the weight for a working set.
    const lastToday = [...done].reverse().find((s) => s.type !== "warmup");
    const prev = history.get(current.exercise_id)?.last.filter((s) => s.type !== "warmup") ?? [];
    const sameSetLastTime = prev[nextSlot(done, current.target_sets ?? 3, current.skipped_sets) - 1] ?? prev[prev.length - 1];
    // First set of an exercise: double progression from last time (more weight once you hit the top of the range).
    const suggestion = !lastToday && prev.length ? suggestNext(prev, current.rep_min, current.rep_max, loadFor(catalog?.needs.get(current.exercise_id) ?? [], gym ? equipmentRows : null)) : null;
    // A lift you've never logged: start from an estimate based on your bodyweight, height, sex and experience.
    const estimate = catalog && !lastToday && !prev.length ? startingWeightFor(catalog, current.exercise_id, who, current.rep_min, current.rep_max, gym ? equipmentRows : null) : null;
    const src = lastToday ?? sameSetLastTime;
    const working = suggestion && suggestion.weight !== null ? suggestion.weight : (src?.weight ?? estimate ?? null);
    const warmup = warm === "pending" ? warmupDose(working, current.rep_max, equipmentIdsOf(current.exercise_id)) : null;
    setDraft(
      warmup
        ? { weight: warmup.weight, reps: warmup.reps, rpe: null, type: "warmup" }
        : { weight: working, reps: suggestion?.reps ?? src?.reps ?? current.rep_max ?? null, rpe: null, type: "working" },
    );
    setDraftFor(key);
  }, [current, history, setsBy, draftFor, catalog, who]); // eslint-disable-line react-hooks/exhaustive-deps

  const [picker, setPicker] = useState<null | { mode: "add" } | { mode: "swap"; wex: WorkoutExercise }>(null);
  const [menuFor, setMenuFor] = useState<WorkoutExercise | null>(null);
  const [editSet, setEditSet] = useState<WorkoutSet | null>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [notesFor, setNotesFor] = useState<WorkoutExercise | "workout" | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [allDoneOpen, setAllDoneOpen] = useState(false);
  const [toast, setToast] = useState<(DockToast & { id: string }) | null>(null);
  const lastLogAt = useRef(0);
  // The undo toast lasts 5 s; a new log replaces it and restarts the clock.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const [typing, setTyping] = useState<null | "weight" | "reps">(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [addCardioOpen, setAddCardioOpen] = useState(false);
  // After the last set of an exercise, the blue card shows "Up next" (set to that exercise's id) until you start the next one.
  const [upNextFrom, setUpNextFrom] = useState<string | null>(null);
  // The bottom set panel (lifts): hidden = shrunk to one row. Stays as you left it until the screen is reopened.
  const [dockHidden, setDockHidden] = useState(false);
  // "⋯" on a row or the title: Swap / How-to / Notes / Remove in one sheet.
  const [actionsFor, setActionsFor] = useState<WorkoutExercise | null>(null);

  if (!wexs || !sets || !catalog) return null;

  const ex = current ? catalog.byId.get(current.exercise_id) : undefined;
  const doneSets = current ? setsBy.get(current.id) ?? [] : [];
  const index = current ? wexs.findIndex((w) => w.id === current.id) : -1;
  const elapsed = (now - new Date(workout.started_at).getTime()) / 1000;
  const isBodyweight = current ? (catalog.needs.get(current.exercise_id) ?? []).length === 0 : false;
  const restLeft = rest ? Math.max(0, Math.round((rest.endsAt - now) / 1000)) : 0;
  const isCardio = extra !== null || (current ? isCardioWex(current) : false);
  const cardioType = ex ? cardioTypeFor(ex) : "other";
  const currentSession = current ? (cardioByWex.get(current.id) ?? null) : null;
  const wexTimer = timer && current && timer.wexId === current.id ? timer : null;
  const otherTimer = timer && !(extra ? extra.timer : wexTimer) ? timer : null;
  const liveTimer: CardioTimer | null = timer && timer.workoutId === workout.id ? timer : null;
  const liftCount = wexs.filter((w) => !isCardioWex(w)).length;
  const cardioCount = wexs.length - liftCount + extraCardio.length;

  /** Saves cardio results (new or edited), clears the timer they came from, and stays on the card to show them. */
  async function saveCardio(r: CardioSave, ctx: { wexId: string | null; type: CardioType; session: CardioSession | null; timer: CardioTimer | null }) {
    const id = ctx.session?.id ?? newId();
    await actions.logCardio({
      id,
      workout_id: workout.id,
      workout_exercise_id: ctx.wexId,
      type: ctx.type,
      started_at: ctx.session?.started_at ?? r.startedAt,
      duration_sec: r.durationSec,
      distance: r.distance,
      incline: r.incline,
      avg_hr: r.avgHr,
      rpe: r.rpe,
      intervals: ctx.session?.intervals ?? null,
      notes: r.notes,
    });
    if (ctx.timer) await clearTimer();
    setEditingKey(null);
    setCurrentId(ctx.wexId ?? `cardio:${id}`);
  }

  const discardTimer = async () => {
    if (confirm("Throw this cardio timer away?")) await clearTimer();
  };

  /** What "Next" goes to after cardio: the next unfinished exercise, else nothing (finish). */
  const nextAfter = (wexId: string | null) => {
    const i = wexId ? wexs!.findIndex((w) => w.id === wexId) : -1;
    return wexs!.slice(i + 1).find(remaining) ?? wexs!.find((w) => w.id !== wexId && remaining(w)) ?? null;
  };

  async function startRest(seconds: number, wexId: string) {
    if (seconds <= 0) return db.setMeta("rest", null);
    await db.setMeta("rest", { endsAt: Date.now() + seconds * 1000, total: seconds, wexId });
  }

  async function log() {
    if (!current) return;
    // A second tap within 700 ms is a double tap, not another set.
    if (isDoubleTap(lastLogAt)) return;
    const before = { currentId, upNextFrom, rest, draft, wexId: current.id, count: (setsBy.get(current.id) ?? []).length };
    const saved = await actions.logSet(current.id, draft);
    showLogged(saved, before);
    const group = current.superset_group;
    const doneNow = filled(current) + (draft.type === "warmup" ? 0 : 1);
    // This set finished the last planned set of the whole workout: no rest, say well done.
    const finishedAll =
      draft.type !== "warmup" &&
      remaining(current) &&
      wexs!.every((w) => (w.id === current.id ? doneNow >= (w.target_sets ?? 3) : done(w)));
    if (finishedAll) {
      await db.setMeta("rest", null);
      if ("vibrate" in navigator) navigator.vibrate?.([80, 60, 80]);
      setAllDoneOpen(true);
      return;
    }
    if (group !== null) {
      const members = wexs!.filter((w) => w.superset_group === group);
      const pos = members.findIndex((w) => w.id === current.id);
      const nextInRound = members.slice(pos + 1).find((w) => filled(w) < (w.target_sets ?? 3));
      if (nextInRound && draft.type !== "warmup") {
        setCurrentId(nextInRound.id); // superset: go straight to the partner, no rest
        await db.setMeta("rest", null);
        return;
      }
      const first = members.find((w) => (w.id === current.id ? doneNow : filled(w)) < (w.target_sets ?? 3));
      await startRest(current.rest_sec ?? 90, current.id);
      if (!first && draft.type !== "warmup" && nextAfter(current.id)) {
        // Whole superset finished: show "Up next" from its last exercise instead of jumping ahead.
        setCurrentId(current.id);
        setUpNextFrom(current.id);
        return;
      }
      setCurrentId(first?.id ?? wexs!.find((w) => w.superset_group !== group && remaining(w))?.id ?? current.id);
      return;
    }
    await startRest(draft.type === "warmup" ? 60 : (current.rest_sec ?? 90), current.id);
    if (doneNow >= (current.target_sets ?? 3) && draft.type !== "warmup" && nextAfter(current.id)) {
      // Keep the finished exercise as the current one so the blue card can show "Up next" (otherwise current jumps ahead).
      setCurrentId(current.id);
      setUpNextFrom(current.id);
    }
  }

  /** "✓ Set 2 logged · 70 lb × 10 · Undo" for 5 s. Undo deletes the set and puts the screen back as it was. */
  function showLogged(saved: WorkoutSet, before: { currentId: string | null; upNextFrom: string | null; rest: RestState | null; draft: Draft; wexId: string; count: number }) {
    const what = saved.type === "warmup" ? "Warm-up" : saved.type === "drop" ? "Drop set" : `Set ${setNumber}`;
    const load = `${saved.weight === null ? "BW" : `${formatWeight(saved.weight, units)} ${weightUnit(units)}`} × ${saved.reps ?? "—"}`;
    setToast({
      id: saved.id,
      text: `${what} logged · ${load}`,
      onUndo: async () => {
        setToast(null);
        restoreDraft.current = { wexId: before.wexId, count: before.count, draft: before.draft };
        await actions.deleteSet(saved);
        await db.setMeta("rest", before.rest);
        setAllDoneOpen(false);
        setCurrentId(before.currentId);
        setUpNextFrom(before.upNextFrom);
      },
    });
  }

  /** Skips a planned set. Skipping the last one finishes the exercise, same as logging it. */
  async function skipSet(w: WorkoutExercise, slot: number) {
    const skipped = [...new Set([...(w.skipped_sets ?? []), slot])].sort((a, b) => a - b);
    await actions.updateWex(w.id, { skipped_sets: skipped });
    if (filledSets(setsBy.get(w.id) ?? [], w.target_sets ?? 3, skipped) < (w.target_sets ?? 3)) return;
    await db.setMeta("rest", null);
    if (wexs!.every((x) => x.id === w.id || done(x))) setAllDoneOpen(true);
    else if (nextAfter(w.id)) {
      setCurrentId(w.id);
      setUpNextFrom(w.id);
    }
  }

  async function unskipSet(w: WorkoutExercise, slot: number) {
    await actions.updateWex(w.id, { skipped_sets: (w.skipped_sets ?? []).filter((n) => n !== slot) });
    if (upNextFrom === w.id) setUpNextFrom(null);
  }

  const step = weightStep(units);
  const shownWeight = draft.weight === null ? null : toDisplayWeight(draft.weight, units);
  const bumpWeight = (dir: 1 | -1) => {
    const base = shownWeight ?? 0;
    const v = Math.max(0, Math.round((base + dir * step) / step) * step);
    setDraft({ ...draft, weight: v === 0 && isBodyweight ? null : fromDisplayWeight(v, units) });
  };
  const bumpReps = (dir: 1 | -1) => setDraft({ ...draft, reps: Math.max(0, (draft.reps ?? 0) + dir) });

  const targetLabel = current
    ? current.rep_min && current.rep_max && current.rep_min !== current.rep_max
      ? `${current.rep_min}–${current.rep_max} reps`
      : `${current.rep_max ?? current.rep_min ?? "?"} reps`
    : "";
  const setNumber = current ? nextSlot(doneSets, current.target_sets ?? 3, current.skipped_sets) : 1;
  const upNextWex = upNextFrom && current && current.id === upNextFrom && done(current) ? current : null;
  const upNextTarget = upNextWex ? nextAfter(upNextWex.id) : null;
  const upNextEx = upNextTarget ? catalog.byId.get(upNextTarget.exercise_id) : undefined;
  const upNextLast = upNextTarget ? history?.get(upNextTarget.exercise_id)?.last.find((x) => x.type !== "warmup") : undefined;
  const upNextDetail = upNextTarget
    ? isCardioWex(upNextTarget)
      ? "Cardio"
      : `${upNextTarget.target_sets ?? 3} sets · ${upNextTarget.rep_min ?? "?"}–${upNextTarget.rep_max ?? "?"} reps${upNextLast && upNextLast.weight !== null ? ` · last time ${formatWeight(upNextLast.weight, units)} ${weightUnit(units)} × ${upNextLast.reps ?? "?"}` : ""}`
    : "";
  // "Up 5 lb" when double progression added weight for today; "Down 5 lb" when last time was too heavy.
  const upHint = (() => {
    if (!current || isCardio || doneSets.some((s) => s.type !== "warmup") || draft.type === "warmup" || !history) return null;
    const prev = history.get(current.exercise_id)?.last.filter((s) => s.type !== "warmup") ?? [];
    if (!prev.length) return null;
    const sug = suggestNext(prev, current.rep_min, current.rep_max, loadFor(catalog.needs.get(current.exercise_id) ?? [], gym ? equipmentRows : null));
    if ((sug.change !== "up" && sug.change !== "down") || sug.weight === null || sug.from === null) return null;
    return `${sug.change === "up" ? "▲ UP" : "▼ DOWN"} ${formatWeight(Math.abs(sug.weight - sug.from), units)} ${weightUnit(units).toUpperCase()}`;
  })();

  // Never logged this lift: the weight above is an estimate from your bodyweight, so say so.
  const estHint = (() => {
    if (!current || isCardio || doneSets.some((s) => s.type !== "warmup") || draft.type === "warmup" || !history) return null;
    if ((history.get(current.exercise_id)?.last ?? []).some((s) => s.type !== "warmup")) return null;
    return startingWeightFor(catalog, current.exercise_id, who, current.rep_min, current.rep_max, gym ? equipmentRows : null) !== null ? "EST. START" : null;
  })();

  // The planned warm-up: say how light it is.
  const warmHint = (() => {
    if (!current || isCardio || draft.type !== "warmup" || warmupState(current) !== "pending") return null;
    const d = warmupDose(1, current.rep_max, []);
    return draft.weight === null ? "LIGHT · AN EASY WEIGHT" : `LIGHT · ABOUT ${d.pct}% OF WORKING`;
  })();

  /** Swap / How-to / Notes / Remove for one exercise: the swipe-left buttons and the ⋯ sheet use the same list. */
  const rowActions = (w: WorkoutExercise): RowAction[] => [
    { key: "swap", label: "Swap", icon: <RowIcon name="swap" />, className: "bg-primary text-white", onPress: () => setPicker({ mode: "swap", wex: w }) },
    { key: "how", label: "How-to", icon: <RowIcon name="how" />, className: "bg-[#2a3150] text-white", onPress: () => setInfoFor(w.exercise_id) },
    { key: "notes", label: "Notes", icon: <RowIcon name="notes" />, className: "bg-[#3b4a8c] text-white", onPress: () => setNotesFor(w) },
    {
      key: "remove",
      label: "Remove",
      icon: <RowIcon name="remove" />,
      className: "bg-danger text-white",
      onPress: async () => {
        if (confirm(isCardioWex(w) ? "Remove this cardio and its results?" : "Remove this exercise and its sets?")) await actions.removeWex(w.id);
      },
    },
  ];
  const menuLabel = (w: WorkoutExercise) => `${catalog.byId.get(w.exercise_id)?.name ?? w.exercise_id}: swap, how-to, notes, remove`;

  const listItems: ReorderItem[] = wexs.map((w, i) => {
    const e = catalog.byId.get(w.exercise_id);
    const cardioWex = isCardioWex(w);
    const cardioDone = cardioByWex.get(w.id);
    const running = timer && timer.wexId === w.id ? timer : null;
    const linkedAbove = i > 0 && w.superset_group !== null && wexs[i - 1].superset_group === w.superset_group;
    const skippedN = (w.skipped_sets ?? []).filter((n) => n >= 1 && n <= (w.target_sets ?? 3)).length;
    const isCur = !extra && w.id === current?.id;
    return {
      id: w.id,
      ariaLabel: `${e?.name ?? w.exercise_id}. Tap to open. Swipe left for options. Hold to drag.`,
      liClassName: linkedAbove ? "-mt-2" : "",
      before: linkedAbove ? <div className="ml-6 h-2 w-1 bg-accent-strong" aria-hidden="true" /> : undefined,
      // Outlines are inset rings (box-shadow), so they keep the 14px corners and survive the drag shadow.
      faceClassName: `flex min-h-16 items-center rounded-[14px] py-2 pr-2 pl-4 ring-inset ${isCur ? "bg-[#0f1638] ring-2 ring-[var(--accent-strong)]" : "bg-card ring-1 ring-[#262d49]"}`,
      onTap: () => {
        setUpNextFrom(null);
        setCurrentId(w.id);
      },
      face: (
        <>
          <span className={`display flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-extrabold ${done(w) ? doneDisc : numberDisc}`}>
            {done(w) ? "✓" : i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-bold">{e?.name ?? w.exercise_id}</span>
            <span className="block truncate text-sm font-medium text-muted">
              {cardioWex ? (
                cardioDone
                  ? cardioSummary(cardioDone, units)
                  : running
                    ? running.stoppedAt
                      ? `${formatDuration(cardioElapsedSec(running, now))} · enter results`
                      : `Running ${formatDuration(cardioElapsedSec(running, now))}`
                    : "Cardio · tap to start"
              ) : (
                <>
                  {filled(w)}/{w.target_sets ?? 3} sets{skippedN ? ` (${skippedN} skipped)` : ""} · {w.rep_min ?? "?"}–{w.rep_max ?? "?"} reps{w.superset_group !== null ? ` · Superset ${String.fromCharCode(64 + w.superset_group)}` : ""}
                </>
              )}
              {w.notes?.startsWith("Warm up") ? (
                w.id === warmupId ? <span className="text-accent-soft"> · 1 warm-up set</span> : null
              ) : w.notes ? (
                <span className="text-accent-soft"> · {w.notes}</span>
              ) : null}
            </span>
          </span>
        </>
      ),
      trailing: (
        <>
          <button
            type="button"
            aria-label={menuLabel(w)}
            // Not a tap on the row, and never the start of a swipe or drag.
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setActionsFor(w);
            }}
            className="-mx-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-card-2"
          >
            <Dots />
          </button>
          <svg className="shrink-0 text-[#454d6e]" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
          </svg>
        </>
      ),
      actions: rowActions(w),
    };
  });

  // ---- The bottom set panel (lifts only; cardio and an empty workout keep the blue card at the top). ----
  const dock = !extra && current && ex && !isCardio ? current : null;
  const restProps =
    rest && restLeft > 0
      ? { left: restLeft, total: rest.total, onAdd: () => void db.setMeta("rest", { ...rest, endsAt: rest.endsAt + 15000, total: rest.total + 15 }), onSkip: () => void db.setMeta("rest", null) }
      : null;
  const setChipLabel = current
    ? draft.type === "warmup"
      ? "WARM-UP"
      : draft.type === "drop"
        ? "DROP SET"
        : setNumber > (current.target_sets ?? 3)
          ? `EXTRA SET ${setNumber}`
          : `SET ${setNumber} OF ${current.target_sets ?? 3}`
    : "";
  const logLabel = `Log ${draft.type === "warmup" ? "warm-up" : draft.type === "drop" ? "drop set" : `set ${setNumber}`}`;
  const dockContent: DockSet | DockUpNext | null = (() => {
    if (!dock || !ex) return null;
    if (upNextWex && upNextTarget) {
      return {
        kind: "upnext",
        doneName: ex.name,
        nextName: upNextEx?.name ?? upNextTarget.exercise_id,
        detail: upNextDetail,
        startLabel: `Start ${isCardioWex(upNextTarget) ? "cardio" : "exercise"}`,
        onStart: () => {
          setCurrentId(upNextTarget.id);
          setUpNextFrom(null);
        },
        onInfo: () => setInfoFor(upNextTarget.exercise_id),
      };
    }
    const hist = history?.get(dock.exercise_id);
    const prev = hist?.last.filter((x) => x.type !== "warmup") ?? [];
    const same = prev[setNumber - 1] ?? prev[prev.length - 1] ?? null;
    const unit = weightUnit(units);
    const weightLabel = isBodyweight && draft.weight === null ? "BODYWEIGHT" : `${unit.toUpperCase()}${isPerHand(ex) ? " EACH" : ""}`;
    const weightValue = draft.weight === null ? (isBodyweight ? "BW" : "—") : formatWeight(draft.weight, units);
    return {
      kind: "set",
      hint: warmHint
        ? { text: warmHint, tone: "plain" }
        : upHint
          ? { text: upHint, tone: upHint.startsWith("▼") ? "warn" : "good" }
          : estHint
            ? { text: estHint, tone: "plain" }
            : { text: hist?.lastDate ? `LAST TIME · ${lastTimeLabel(hist.lastDate)}` : "LAST TIME", tone: "plain" },
      last: same ? { main: `${same.weight === null ? "BW" : `${formatWeight(same.weight, units)} ${unit}`} × ${same.reps ?? "—"}`, rpe: same.rpe !== null ? String(same.rpe) : null } : null,
      weight: { label: weightLabel, value: weightValue, onMinus: () => bumpWeight(-1), onPlus: () => bumpWeight(1), onTap: () => setTyping("weight") },
      reps: { label: "REPS", value: draft.reps === null ? "—" : String(draft.reps), onMinus: () => bumpReps(-1), onPlus: () => bumpReps(1), onTap: () => setTyping("reps") },
      // Warm-ups are easy by design, so no RPE for them.
      rpe:
        draft.type === "warmup" ? null : (
          <RpeSlider value={draft.rpe} defaultRpe={defaultRpe} resetKey={dock.id} onChange={(rpe) => setDraft({ ...draft, rpe })} bleed={false} pill />
        ),
      logLabel,
      onLog: () => void log(),
      micro: setChipLabel,
      big: `${draft.weight === null ? (isBodyweight ? "BW" : "—") : `${formatWeight(draft.weight, units)} ${unit.toUpperCase()}`} × ${draft.reps ?? "—"}`,
    };
  })();
  const mainPad = dock
    ? dockHidden
      ? "pb-[calc(92px+env(safe-area-inset-bottom))]"
      : "pb-[calc(260px+env(safe-area-inset-bottom))]"
    : "pb-10";

  return (
    <main className={`flex min-h-dvh flex-col ${mainPad}`}>
      {/* Current set panel */}
      <div className="safe-top px-5 text-white">
        <div className="flex h-11 items-center justify-between">
          <Link href="/" aria-label="Minimize workout" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </Link>
          <span className="display num text-sm font-bold tracking-[0.12em] text-[#DCE4FF]">
            {extra ? "CARDIO · " : wexs.length ? `${isCardio ? "CARDIO" : "LIFT"} ${index + 1}/${wexs.length} · ` : ""}{formatDuration(elapsed)}
          </span>
          <button type="button" onClick={() => setFinishOpen(true)} className="display h-10 rounded-full bg-white px-4 text-base font-extrabold tracking-[0.08em] text-primary">
            Finish
          </button>
        </div>
      </div>

      {dock && ex ? (
        <section className="px-5 pt-1.5">
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => setInfoFor(dock.exercise_id)} className="min-w-0 flex-1 text-left">
              <h1 className="display min-w-0 flex-1 pt-1 text-[32px] leading-[0.95] font-extrabold">{ex.name}</h1>
            </button>
            <button
              type="button"
              onClick={() => setActionsFor(dock)}
              aria-label={menuLabel(dock)}
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card-2 text-accent-soft"
            >
              <Dots />
            </button>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-y-1 text-sm font-bold tracking-[0.08em] text-muted">
            <button type="button" onClick={() => setTypeOpen(true)} className="relative mr-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-card-2 pr-2.5 pl-3 text-accent-soft after:absolute after:-inset-2 after:content-[''] active:bg-line" aria-label="Change set type: working, warm-up or drop">
              {setChipLabel}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <button
              type="button"
              onClick={() => setMenuFor(dock)}
              className="relative ml-1 inline-flex h-9 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-line px-3 text-muted after:absolute after:-inset-1 after:content-[''] active:bg-card-2"
              aria-label="Edit sets, reps and rest"
            >
              TARGET {targetLabel.toUpperCase()} ✎
            </button>
            {dock.superset_group !== null && <span>&nbsp;· SUPERSET</span>}
          </p>
          {gym && !isAvailable(catalog.needs.get(dock.exercise_id) ?? [], equipment) && (
            <p className="mt-1 text-sm font-bold text-warn">Heads up: {gym.name} may not have the equipment for this. Swap?</p>
          )}
        </section>
      ) : (
      <section className="mx-3 mt-1.5 rounded-[28px] bg-primary px-5 py-[18px] text-white shadow-[0_10px_30px_rgba(31,75,255,0.25)]">
        {extra ? (
          <CardioPanel
            name={cardioLabel(extra.type)}
            type={extra.type}
            units={units}
            now={now}
            session={extra.session}
            timer={extra.timer}
            otherTimer={otherTimer}
            editing={editingKey === extra.key}
            nextLabel={(() => {
              const n = nextAfter(null);
              return n ? (catalog.byId.get(n.exercise_id)?.name ?? null) : null;
            })()}
            onStart={() => {}}
            onDone={() => void stopTimer()}
            onResume={() => void resumeTimer()}
            onCancelTimer={discardTimer}
            onDiscard={discardTimer}
            onSave={(r) => saveCardio(r, { wexId: null, type: extra.type, session: extra.session, timer: extra.timer })}
            onEnterByHand={() => setEditingKey(extra.key)}
            onEdit={() => setEditingKey(extra.key)}
            onCancelEdit={() => setEditingKey(null)}
            onNext={() => {
              const n = nextAfter(null);
              if (n) setCurrentId(n.id);
              else setFinishOpen(true);
            }}
            onResumeSaved={async () => {
              if (!extra.session) return;
              await startTimer(extra.type, { workoutId: workout.id, wexId: null, sessionId: extra.session.id, fromSec: extra.session.duration_sec });
            }}
            onGoToOther={() => setCurrentId(otherTimer?.wexId ?? null)}
          />
        ) : upNextWex && upNextTarget ? (
          <>
            <p className="display mt-1 text-sm font-extrabold tracking-[0.1em] text-[#C9F7DA]">✓ {ex?.name} DONE</p>
            <p className="display mt-3.5 text-[13px] font-bold tracking-[0.14em] text-[#DCE4FF]">UP NEXT</p>
            <h1 className="display mt-1 text-[34px] leading-[0.95] font-extrabold">{upNextEx?.name ?? upNextTarget.exercise_id}</h1>
            <p className="mt-1.5 text-[15px] font-semibold text-[#DCE4FF]">{upNextDetail}</p>
            {restProps && (
              <div className="-mx-2 mt-2">
                <RestBar {...restProps} />
              </div>
            )}
            <div className="mt-3.5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setCurrentId(upNextTarget.id);
                  setUpNextFrom(null);
                }}
                className="display flex h-15 flex-1 items-center justify-center rounded-2xl bg-white text-xl font-extrabold tracking-[0.04em] text-primary shadow-[inset_0_-4px_0_#C9D3FF] active:translate-y-px"
              >
                Start {isCardioWex(upNextTarget) ? "cardio" : "exercise"}
              </button>
              <button type="button" onClick={() => setInfoFor(upNextTarget.exercise_id)} aria-label="How to do it" className="flex h-15 w-15 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl active:bg-white/25">ⓘ</button>
            </div>
          </>
        ) : current && ex && isCardio ? (
          <CardioPanel
            name={ex.name}
            type={cardioType}
            units={units}
            now={now}
            session={currentSession}
            timer={wexTimer}
            otherTimer={otherTimer}
            editing={editingKey === current.id}
            nextLabel={(() => {
              const n = nextAfter(current.id);
              return n ? (catalog.byId.get(n.exercise_id)?.name ?? null) : null;
            })()}
            warning={gym && !isAvailable(catalog.needs.get(current.exercise_id) ?? [], equipment) ? `Heads up: ${gym.name} may not have the equipment for this. Swap?` : null}
            onInfo={() => setInfoFor(current.exercise_id)}
            onStart={() => void startTimer(cardioType, { workoutId: workout.id, wexId: current.id })}
            onDone={() => void stopTimer()}
            onResume={() => void resumeTimer()}
            onCancelTimer={discardTimer}
            onDiscard={discardTimer}
            onSave={(r) => saveCardio(r, { wexId: current.id, type: cardioType, session: currentSession, timer: wexTimer })}
            onEnterByHand={() => setEditingKey(current.id)}
            onEdit={() => setEditingKey(current.id)}
            onCancelEdit={() => setEditingKey(null)}
            onNext={() => {
              const n = nextAfter(current.id);
              if (n) setCurrentId(n.id);
              else setFinishOpen(true);
            }}
            onResumeSaved={async () => {
              if (!currentSession) return;
              await startTimer(cardioType, { workoutId: workout.id, wexId: current.id, sessionId: currentSession.id, fromSec: currentSession.duration_sec });
            }}
            onGoToOther={() => setCurrentId(otherTimer?.wexId ?? (otherTimer?.sessionId ? `cardio:${otherTimer.sessionId}` : null))}
          />
        ) : (
          <div className="py-6">
            <h1 className="display text-4xl font-extrabold">{workout.name ?? "Workout"}</h1>
            <p className="mt-1 text-base font-semibold text-[#DCE4FF]">Add your first exercise to start logging.</p>
          </div>
        )}
      </section>
      )}

      <div className="flex flex-col gap-3 px-5 pt-4">
        {current && !isCardio && (
          <>
            <SetTable
              done={doneSets}
              history={history?.get(current.exercise_id)}
              units={units}
              defaultRpe={defaultRpe}
              nextType={draft.type}
              target={current.target_sets ?? 3}
              skipped={current.skipped_sets ?? []}
              warmup={warmupState(current)}
              hideNext={upNextWex !== null}
              onEdit={setEditSet}
              onSkip={(slot) => void skipSet(current, slot)}
              onUnskip={(slot) => void unskipSet(current, slot)}
            />

          </>
        )}

        <div className="mt-2 flex items-baseline justify-between">
          <h2 className="display text-xl font-extrabold">This workout</h2>
          <button type="button" className="h-10 text-sm font-bold text-accent" onClick={() => setNotesFor("workout")}>{workout.notes ? "Edit notes" : "+ Notes"}</button>
        </div>
        <ReorderList items={listItems} onReorder={(ids) => void actions.reorder(workout.id, ids)} />
        <ul className="-mt-1 flex flex-col gap-2">
          {[
            ...extraCardio.map((c) => ({ key: `cardio:${c.id}`, type: c.type, session: c as CardioSession | null })),
            ...(extraTimer && !extraTimer.sessionId ? [{ key: "cardio:timer", type: extraTimer.type, session: null }] : []),
          ].map((it) => {
            const t = extraTimer && (it.session ? extraTimer.sessionId === it.session.id : !extraTimer.sessionId) ? extraTimer : null;
            const on = extra?.key === it.key;
            return (
              <li key={it.key}>
                <button type="button" onClick={() => setCurrentId(it.key)} className={`flex min-h-16 w-full items-center gap-3 rounded-[14px] py-2 pr-4 pl-4 text-left ring-inset ${on ? "bg-primary/10 ring-2 ring-[var(--accent-strong)]" : "bg-card ring-1 ring-[#262d49]"}`}>
                  <span className={`display flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-extrabold ${it.session && !t ? doneDisc : numberDisc}`}>{it.session && !t ? "✓" : "+"}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-bold">{cardioLabel(it.type)}</span>
                    <span className="block truncate text-sm font-medium text-muted">
                      {t
                        ? t.stoppedAt
                          ? `${formatDuration(cardioElapsedSec(t, now))} · enter results`
                          : `Running ${formatDuration(cardioElapsedSec(t, now))}`
                        : it.session
                          ? cardioSummary(it.session, units)
                          : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={btn.secondary} onClick={() => setPicker({ mode: "add" })}>+ Exercise</button>
          <button type="button" className={btn.secondary} onClick={() => setAddCardioOpen(true)}>+ Cardio</button>
        </div>
      </div>

      {dock && dockContent && <SetDock hidden={dockHidden} onHiddenChange={setDockHidden} rest={restProps} content={dockContent} toast={toast} />}

      {/* Sheets */}
      <Sheet open={actionsFor !== null} onClose={() => setActionsFor(null)} title={actionsFor ? catalog.byId.get(actionsFor.exercise_id)?.name : undefined}>
        {actionsFor && (
          <div className="flex flex-col gap-2">
            {rowActions(actionsFor).map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => {
                  setActionsFor(null);
                  a.onPress();
                }}
                className="flex min-h-14 items-center gap-3 rounded-2xl bg-card-2 px-3 py-2 text-left active:bg-line"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${a.className}`}>{a.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-base font-bold ${a.key === "remove" ? "text-danger" : ""}`}>{a.label}</span>
                  <span className="block truncate text-sm font-medium text-muted">{ACTION_HELP[a.key]}</span>
                </span>
              </button>
            ))}
            <p className="pt-1 text-sm text-muted">Shortcut: swipe a row left for the same four.</p>
          </div>
        )}
      </Sheet>
      <Sheet open={picker !== null} onClose={() => setPicker(null)} title={picker?.mode === "swap" ? "Swap for…" : "Add exercises"}>
        {picker && (
          <SmartExercisePicker
            mode={picker.mode}
            swapFrom={picker.mode === "swap" ? picker.wex.exercise_id : undefined}
            fromIsCardio={picker.mode === "swap" && isCardioWex(picker.wex)}
            gymEquipment={gym ? equipment : null}
            gymName={gym?.name}
            excludeIds={wexs.map((w) => w.exercise_id)}
            today={{
              name: workout.name ?? "Workout",
              items: wexs.map((w) => ({ exercise_id: w.exercise_id, sets_done: isCardioWex(w) ? (cardioByWex.has(w.id) ? 1 : 0) : filled(w), sets_planned: w.target_sets ?? 3 })),
            }}
            initialMuscles={
              picker.mode === "swap"
                ? (catalog.musclesOf.get(picker.wex.exercise_id) ?? []).filter((m) => m.role === "primary").map((m) => m.muscle_id)
                : undefined
            }
            onPick={async (ids) => {
              if (picker.mode === "swap") {
                const w = picker.wex;
                if ((setsBy.get(w.id) ?? []).length === 0) {
                  await actions.updateWex(w.id, { exercise_id: ids[0] });
                  setCurrentId(w.id);
                } else {
                  const [newId] = await actions.addExercises(workout.id, ids, w.sort_order);
                  setCurrentId(newId);
                }
              } else {
                const added = await actions.addExercises(workout.id, ids);
                if (!current || !remaining(current)) setCurrentId(added[0]);
              }
              setPicker(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={menuFor !== null} onClose={() => setMenuFor(null)} title={menuFor ? catalog.byId.get(menuFor.exercise_id)?.name : undefined}>
        {menuFor && (
          <ExerciseMenu
            wex={menuFor}
            isLast={wexs[wexs.length - 1]?.id === menuFor.id}
            nextIsCardio={(() => {
              const next = wexs[wexs.findIndex((w) => w.id === menuFor.id) + 1];
              return next ? isCardioWex(next) : false;
            })()}
            onClose={() => setMenuFor(null)}
            actions={actions}
            workoutId={workout.id}
          />
        )}
      </Sheet>

      <Sheet open={addCardioOpen} onClose={() => setAddCardioOpen(false)} title="Add cardio">
        {addCardioOpen && (
          <AddCardio
            busy={timer ? cardioLabel(timer.type) : null}
            pastHref={`/cardio?manual=1&workout=${workout.id}`}
            onStart={async (type) => {
              if (await startTimer(type, { workoutId: workout.id, wexId: null })) setCurrentId("cardio:timer");
              setAddCardioOpen(false);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}
      </Sheet>

      <Sheet open={editSet !== null} onClose={() => setEditSet(null)} title={editSet ? `Edit set ${editSet.set_no}` : undefined}>
        {editSet && (
          <EditSetForm
            set={editSet}
            units={units}
            defaultRpe={defaultRpe}
            onSave={async (changes) => {
              await actions.updateSet(editSet.id, changes);
              setEditSet(null);
            }}
            onDelete={async () => {
              await actions.deleteSet(editSet);
              setEditSet(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={infoFor !== null} onClose={() => setInfoFor(null)} title={infoFor ? catalog.byId.get(infoFor)?.name : undefined}>
        {infoFor && <ExerciseInfo catalog={catalog} id={infoFor} gymEquipment={gym ? equipment : null} gymName={gym?.name} />}
      </Sheet>

      <Sheet open={notesFor !== null} onClose={() => setNotesFor(null)} title={notesFor === "workout" ? "Workout notes" : "Exercise notes"}>
        {notesFor && (
          <NotesForm
            initial={notesFor === "workout" ? workout.notes : notesFor.notes}
            onSave={async (text) => {
              if (notesFor === "workout") await actions.updateWorkout(workout.id, { notes: text });
              else await actions.updateWex(notesFor.id, { notes: text });
              setNotesFor(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={typing !== null} onClose={() => setTyping(null)} title={typing === "weight" ? `Weight (${weightUnit(units)})` : "Reps"}>
        {typing && (
          <NumberForm
            initial={typing === "weight" ? shownWeight : draft.reps}
            decimal={typing === "weight"}
            allowBlank={typing === "weight"}
            blankLabel={isBodyweight ? "Bodyweight" : "No weight"}
            onSave={(v) => {
              if (typing === "weight") setDraft({ ...draft, weight: v === null ? null : fromDisplayWeight(v, units) });
              else setDraft({ ...draft, reps: v });
              setTyping(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={typeOpen} onClose={() => setTypeOpen(false)} title="Set type">
        <div className="flex flex-col gap-2">
          {(["working", "warmup", "drop"] as SetType[]).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={draft.type === t}
              onClick={() => {
                setDraft({ ...draft, type: t });
                setTypeOpen(false);
              }}
              className={`flex min-h-14 items-center justify-between rounded-2xl border-2 px-4 text-left ${draft.type === t ? "border-accent-strong bg-primary/15" : "border-line bg-card-2"}`}
            >
              <span className={`text-base font-bold ${draft.type === t ? "text-accent-soft" : ""}`}>{TYPE_LABEL[t]}</span>
              <span className="text-sm font-medium text-muted">{t === "working" ? "Counts toward your sets" : t === "warmup" ? "Light, doesn't count" : "Lighter right after a set"}</span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={allDoneOpen} onClose={() => setAllDoneOpen(false)}>
        <div className="flex flex-col items-center gap-2 pb-2 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </div>
          <h2 className="display text-3xl font-extrabold">Nice work!</h2>
          <p className="text-base font-medium text-muted">
            Everything planned is done:{" "}
            {[
              liftCount > 0 ? `${liftCount} ${liftCount === 1 ? "lift" : "lifts"} (${[...setsBy.values()].flat().filter((x) => x.type !== "warmup").length} sets)` : null,
              cardioCount > 0 ? `${cardioCount} cardio` : null,
            ]
              .filter(Boolean)
              .join(", ")}{" "}
            in {formatDuration(elapsed)}.
          </p>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            className={btn.primary}
            onClick={() => {
              setAllDoneOpen(false);
              setFinishOpen(true);
            }}
          >
            Finish workout
          </button>
          <button type="button" className={btn.secondary} onClick={() => setAllDoneOpen(false)}>
            Keep going
          </button>
        </div>
      </Sheet>

      <Sheet open={finishOpen} onClose={() => setFinishOpen(false)} title="Finish workout?">
        <FinishSummary
          workout={workout}
          wexs={wexs}
          setsBy={setsBy}
          units={units}
          elapsed={elapsed}
          cardio={cardioRows ?? []}
          timer={liveTimer}
          names={catalog.byId}
          isCardioWex={isCardioWex}
          cardioDone={(w) => cardioByWex.has(w.id)}
          onSave={async () => {
            await actions.finish(workout.id, (id) => catalog.byId.get(id)?.name);
            router.replace(`/progress/session?id=${workout.id}&done=1`);
          }}
          onDiscard={async () => {
            if (!confirm("Delete this whole workout? This can't be undone.")) return;
            await actions.discard(workout.id);
            router.replace("/");
          }}
          onClose={() => setFinishOpen(false)}
        />
      </Sheet>
    </main>
  );
}

function lastTimeLabel(iso: string) {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(new Date(iso))) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Every planned set, one row each: logged sets (tap to edit), skipped sets (Undo), the next one, and the rest still to come
 * (Skip). Warm-ups are "W" and drop sets are "D"; drop sets still use up a planned set. Last time is paired by set number.
 */
function SetTable({
  done, history, units, defaultRpe, nextType, target, skipped, warmup, hideNext, onEdit, onSkip, onUnskip,
}: {
  done: WorkoutSet[];
  history?: { last: WorkoutSet[]; lastDate: string | null };
  units: Units;
  defaultRpe: number;
  nextType: SetType;
  target: number;
  skipped: number[];
  /** The planned warm-up row (slot 0): pending shows it as next with Skip, skipped shows it struck through. */
  warmup: "pending" | "skipped" | null;
  hideNext: boolean;
  onEdit: (s: WorkoutSet) => void;
  onSkip: (slot: number) => void;
  onUnskip: (slot: number) => void;
}) {
  const last = history?.last.filter((s) => s.type !== "warmup") ?? [];
  const u = weightUnit(units) === "kg" ? "kg" : "lbs";
  const cols = "grid grid-cols-[2.75rem_1.15fr_1fr_4.25rem] items-center";
  const badge = "display flex h-8 w-8 items-center justify-center rounded-lg text-base font-extrabold";
  const skipBtn = "display relative h-9 min-w-14 justify-self-end rounded-full bg-card-2 px-2.5 text-sm font-extrabold tracking-[0.08em] text-muted after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] active:bg-line";

  const amount = (s: WorkoutSet) => (
    <>
      {s.weight === null ? "BW" : formatWeight(s.weight, units)}
      <span className="text-sm font-semibold text-muted">{s.weight === null ? "" : ` ${u}`}&nbsp;&nbsp;</span>
      {s.reps ?? "—"}
      <span className="text-sm font-semibold text-muted"> reps</span>
    </>
  );
  const lastCell = (slot: number) => (last[slot - 1] ? amount(last[slot - 1]) : "—");
  const lastClass = "display num text-[22px] leading-none font-extrabold text-muted";

  return (
    <section aria-label="Sets" className="flex flex-col">
      <div className={`${cols} pb-1 text-xs font-bold tracking-[0.12em] text-muted`}>
        <span>SET</span>
        <span>TODAY</span>
        <span>LAST{history?.lastDate && last.length ? ` · ${lastTimeLabel(history.lastDate).toUpperCase()}` : ""}</span>
        <span />
      </div>
      {warmup === "pending" && !hideNext && (
        <div className={`${cols} min-h-14 border-t border-line py-2`} aria-current="step">
          <span className={`${badge} bg-primary/20 text-accent-soft`}>W</span>
          <span className="flex flex-col items-start gap-0.5">
            <span className="display text-[22px] leading-none font-extrabold text-accent-soft">NEXT</span>
            <span className="display text-[11px] font-semibold tracking-[0.08em] text-muted">WARM-UP · DOESN&apos;T COUNT</span>
          </span>
          <span />
          <button type="button" onClick={() => onSkip(WARMUP_SLOT)} className={skipBtn} aria-label="Skip the warm-up set">SKIP</button>
        </div>
      )}
      {warmup === "skipped" && (
        <div className={`${cols} min-h-14 border-t border-line py-2`}>
          <span className={`${badge} text-muted`}>W</span>
          <span className="display text-[22px] font-extrabold text-muted line-through decoration-2">SKIPPED</span>
          <span />
          {done.length ? <span /> : <button type="button" onClick={() => onUnskip(WARMUP_SLOT)} className={skipBtn} aria-label="Undo skipping the warm-up">UNDO</button>}
        </div>
      )}
      {slotRows(done, target, skipped).map((r) => {
        if (r.kind === "logged") {
          const s = r.set;
          const tag = s.type === "warmup" ? "W" : s.type === "drop" ? "D" : String(r.slot);
          return (
            <button key={s.id} type="button" onClick={() => onEdit(s)} className={`${cols} min-h-14 border-t border-line py-2 text-left active:bg-card`} aria-label={`Edit set ${tag}`}>
              <span className={`${badge} text-muted`}>{tag}</span>
              <span className="flex flex-col items-start gap-0.5">
                <span className={`display num text-[22px] leading-none font-extrabold ${s.type === "warmup" ? "text-muted" : "text-ink"}`}>{amount(s)}</span>
                <span className="display flex gap-1 text-[11px] font-semibold tracking-[0.08em]">
                  {s.type !== "warmup" && <span className="rounded-md bg-primary/20 px-1.5 py-px text-accent-soft">RPE {s.rpe ?? defaultRpe}</span>}
                  {s.type === "drop" && <span className="rounded-md bg-card-2 px-1.5 py-px text-muted">DROP</span>}
                  {s.type === "warmup" && <span className="rounded-md bg-card-2 px-1.5 py-px text-muted">WARM-UP</span>}
                </span>
              </span>
              <span className={lastClass}>{r.slot !== null ? lastCell(r.slot) : ""}</span>
              <span />
            </button>
          );
        }
        if (r.kind === "skipped") {
          return (
            <div key={`s${r.slot}`} className={`${cols} min-h-14 border-t border-line py-2`}>
              <span className={`${badge} text-muted`}>{r.slot}</span>
              <span className="display text-[22px] font-extrabold text-muted line-through decoration-2">SKIPPED</span>
              <span className={`${lastClass} opacity-60`}>{lastCell(r.slot)}</span>
              <button type="button" onClick={() => onUnskip(r.slot)} className={skipBtn} aria-label={`Undo skipping set ${r.slot}`}>UNDO</button>
            </div>
          );
        }
        if (r.kind === "next" && warmup !== "pending") {
          if (hideNext) return null;
          const tag = nextType === "warmup" ? "W" : nextType === "drop" ? "D" : String(r.slot);
          return (
            <div key={`n${r.slot}`} className={`${cols} min-h-14 border-t border-line py-2`} aria-current="step">
              <span className={`${badge} bg-primary/20 text-accent-soft`}>{tag}</span>
              <span className="display text-[22px] font-extrabold text-accent-soft">{r.extra ? "EXTRA" : "NEXT"}</span>
              <span className={lastClass}>{nextType === "warmup" ? "" : lastCell(r.slot)}</span>
              {!r.extra && nextType === "working" ? <button type="button" onClick={() => onSkip(r.slot)} className={skipBtn} aria-label={`Skip set ${r.slot}`}>SKIP</button> : <span />}
            </div>
          );
        }
        return (
          <div key={`p${r.slot}`} className={`${cols} min-h-14 border-t border-line py-2 opacity-60`}>
            <span className={`${badge} text-muted`}>{r.slot}</span>
            <span className="display text-[22px] font-extrabold text-muted">—</span>
            <span className={lastClass}>{lastCell(r.slot)}</span>
            <button type="button" onClick={() => onSkip(r.slot)} className={skipBtn} aria-label={`Skip set ${r.slot}`}>SKIP</button>
          </div>
        );
      })}
      {!last.length && <p className="pt-1 text-sm font-medium text-muted">First time logging this one.</p>}
    </section>
  );
}

function RowIcon({ name }: { name: "swap" | "how" | "notes" | "remove" }) {
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

/** Sets, reps and rest for one exercise, plus linking it as a superset (opened from the target on the blue card). */
function ExerciseMenu({
  wex, isLast, nextIsCardio, onClose, actions, workoutId,
}: {
  wex: WorkoutExercise; isLast: boolean; nextIsCardio: boolean; onClose: () => void;
  actions: ReturnType<typeof useWorkoutActions>; workoutId: string;
}) {
  const [sets, setSets] = useState(wex.target_sets ?? 3);
  const [min, setMin] = useState(wex.rep_min ?? 8);
  const [max, setMax] = useState(wex.rep_max ?? 12);
  const [rest, setRest] = useState(wex.rest_sec ?? 90);
  const item = "flex min-h-13 w-full items-center gap-3 rounded-2xl bg-card-2 px-4 text-left text-base font-bold";
  const small = (v: number, set: (n: number) => void, l: string, stepBy = 1) => (
    <div className="flex flex-col items-center gap-1">
      <span className={label}>{l}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="h-10 w-10 rounded-full border-2 border-line text-xl font-bold" onClick={() => set(Math.max(stepBy === 15 ? 0 : 1, v - stepBy))}>−</button>
        <span className="display num w-12 text-center text-2xl font-extrabold">{stepBy === 15 ? formatDuration(v) : v}</span>
        <button type="button" className="h-10 w-10 rounded-full border-2 border-line text-xl font-bold" onClick={() => set(v + stepBy)}>+</button>
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-card-2 p-3">
        {small(sets, setSets, "SETS")}
        {small(rest, setRest, "REST", 15)}
        {small(min, setMin, "REPS FROM")}
        {small(max, setMax, "REPS TO")}
        <button
          type="button"
          className={`${btn.secondary} col-span-2`}
          onClick={async () => {
            await actions.updateWex(wex.id, { target_sets: sets, rep_min: Math.min(min, max), rep_max: Math.max(min, max), rest_sec: rest });
            onClose();
          }}
        >
          Save targets
        </button>
      </div>
      {((!isLast && !nextIsCardio) || wex.superset_group !== null) && (
        <button type="button" className={item} onClick={async () => { await actions.toggleSuperset(workoutId, wex.id); onClose(); }}>
          🔗 {wex.superset_group !== null ? "Remove from superset" : "Superset with the next exercise"}
        </button>
      )}
    </div>
  );
}

function EditSetForm({ set, units, defaultRpe, onSave, onDelete }: { set: WorkoutSet; units: Units; defaultRpe: number; onSave: (c: Partial<WorkoutSet>) => void; onDelete: () => void }) {
  const [w, setW] = useState(set.weight === null ? "" : String(toDisplayWeight(set.weight, units)));
  const [r, setR] = useState(set.reps === null ? "" : String(set.reps));
  const [rpe, setRpe] = useState<number | null>(set.rpe);
  const [type, setType] = useState<SetType>(set.type);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const wn = w.trim() === "" ? null : Number(w.replace(",", "."));
        onSave({ weight: wn === null || Number.isNaN(wn) ? null : fromDisplayWeight(wn, units), reps: r.trim() === "" ? null : Number(r), rpe, type });
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-2"><span className={label}>WEIGHT ({weightUnit(units).toUpperCase()})</span><input className={field} inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} placeholder="Bodyweight" /></label>
        <label className="flex flex-col gap-2"><span className={label}>REPS</span><input className={field} inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)} /></label>
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
      <button type="submit" className={btn.primary}>Save set</button>
      <button type="button" className={btn.danger} onClick={onDelete}>Delete set</button>
    </form>
  );
}

function NotesForm({ initial, onSave }: { initial: string | null; onSave: (t: string | null) => void }) {
  const [text, setText] = useState(initial ?? "");
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); onSave(text.trim() || null); }}>
      <textarea className={`${field} h-32 py-3`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Seat height 4, felt strong, left shoulder tight…" autoFocus />
      <button type="submit" className={btn.primary}>Save</button>
    </form>
  );
}

function NumberForm({ initial, decimal, allowBlank, blankLabel, onSave }: { initial: number | null; decimal: boolean; allowBlank: boolean; blankLabel: string; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(initial === null ? "" : String(initial));
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); const n = Number(v.replace(",", ".")); onSave(v.trim() === "" || Number.isNaN(n) ? null : decimal ? n : Math.round(n)); }}>
      <input className={`${field} display num h-20 text-center text-5xl font-extrabold`} inputMode={decimal ? "decimal" : "numeric"} value={v} onChange={(e) => setV(e.target.value)} autoFocus />
      <button type="submit" className={btn.primary}>Done</button>
      {allowBlank && <button type="button" className={btn.ghost} onClick={() => onSave(null)}>{blankLabel}</button>}
    </form>
  );
}

function FinishSummary({
  workout, wexs, setsBy, units, elapsed, cardio, timer, names, isCardioWex, cardioDone, onSave, onDiscard, onClose,
}: {
  workout: Workout; wexs: WorkoutExercise[]; setsBy: Map<string, WorkoutSet[]>; units: Units; elapsed: number;
  cardio: CardioSession[]; timer: CardioTimer | null; names: Map<string, { name: string }>;
  isCardioWex: (w: WorkoutExercise) => boolean; cardioDone: (w: WorkoutExercise) => boolean;
  onSave: () => void; onDiscard: () => void; onClose: () => void;
}) {
  const cmp = useWorkoutComparison(workout.id)?.comparison;
  const [allOpen, setAllOpen] = useState(false);
  const all = wexs.flatMap((w) => setsBy.get(w.id) ?? []);
  const workingSets = all.filter((s) => s.type !== "warmup").length;
  const volume = volumeLb(all);
  const nameOf = (w: WorkoutExercise) => names.get(w.exercise_id)?.name ?? w.exercise_id;
  const last = cmp?.totals.last ?? null;

  // Third line on each tile: vs the previous workout (P).
  const vs = (diff: number, text: (n: number) => string, less: string, more: string) => (diff === 0 ? "same" : `${text(Math.abs(diff))} ${diff < 0 ? less : more}`);
  const shown = (lb: number) => Math.round(toDisplayWeight(lb, units));
  const stat = (v: string, l: string, sub: string | null) => (
    <div className="rounded-2xl bg-card-2 p-3 text-center">
      <div className="display num text-3xl font-extrabold">{v}</div>
      <div className="text-xs font-bold tracking-[0.1em] text-muted">{l}</div>
      {sub && <div className="mt-0.5 text-xs font-bold text-muted">{sub}</div>}
    </div>
  );

  // Still on today's list: sets left on started lifts, and anything not started.
  const unfinished = wexs.flatMap((w) => {
    if (isCardioWex(w)) return cardioDone(w) ? [] : [{ id: w.id, name: nameOf(w), left: "not started" }];
    const logged = (setsBy.get(w.id) ?? []).filter((x) => x.type !== "warmup").length;
    if (!logged) return [{ id: w.id, name: nameOf(w), left: "not started" }];
    const left = (w.target_sets ?? 3) - filledSets(setsBy.get(w.id) ?? [], w.target_sets ?? 3, w.skipped_sets);
    return left > 0 ? [{ id: w.id, name: nameOf(w), left: left === 1 ? "1 set left" : `${left} sets left` }] : [];
  });

  const lifts = wexs.flatMap((w) => {
    const sets = [...(setsBy.get(w.id) ?? [])].filter((x) => x.type !== "warmup").sort((a, b) => a.set_no - b.set_no);
    return sets.length ? [{ id: w.id, name: nameOf(w), line: setsLine(sets, units) }] : [];
  });
  const vsDate = cmp?.previous ? shortDate(cmp.previous.started_at) : null;
  const upLine = cmp && vsDate && cmp.compared > 0 ? `up on ${cmp.up} of ${cmp.compared} ${cmp.compared === 1 ? "lift" : "lifts"} vs ${vsDate}` : null;
  const recordCount = cmp?.records.length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {stat(formatDuration(elapsed), "TIME", last ? vs(Math.round(elapsed - last.durationSec), formatDuration, "less", "more") : null)}
        {stat(String(workingSets), "SETS", last ? vs(workingSets - last.sets, String, "fewer", "more") : null)}
        {stat(
          shown(volume).toLocaleString(),
          `${weightUnit(units).toUpperCase()} MOVED`,
          last ? vs(shown(volume) - shown(last.volumeLb), (n) => n.toLocaleString(), "less", "more") : null,
        )}
      </div>
      {recordCount > 0 ? (
        <div className="flex items-center gap-2.5 rounded-2xl bg-primary/15 px-3 py-2.5 text-sm font-bold text-accent-soft">
          <PrBadge />
          <span>
            {recordCount} {recordCount === 1 ? "record" : "records"}
            {upLine ? ` · ${upLine}` : ""}
          </span>
        </div>
      ) : (
        upLine && <div className="rounded-2xl bg-primary/15 px-3 py-2.5 text-sm font-bold text-accent-soft">{upLine[0].toUpperCase() + upLine.slice(1)}</div>
      )}
      {unfinished.length > 0 && <NotDoneBlock label="STILL ON TODAY'S LIST" rows={unfinished.map((u) => ({ key: u.id, name: u.name, right: u.left }))} />}
      {lifts.length > 0 && (
        <div className="flex flex-col rounded-2xl bg-card-2">
          <button type="button" aria-expanded={allOpen} onClick={() => setAllOpen(!allOpen)} className="flex min-h-11 items-center justify-between px-4 text-sm font-bold">
            All {workingSets} {workingSets === 1 ? "set" : "sets"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={`text-muted ${allOpen ? "rotate-180" : ""}`} aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {allOpen && (
            <ul className="flex flex-col gap-1 px-4 pb-3 text-sm font-semibold">
              {lifts.map((l) => (
                <li key={l.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate font-bold">{l.name}</span>
                  <span className="num shrink-0 text-muted">{l.line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {cardio.length > 0 && (
        <ul className="rounded-2xl bg-card-2 px-3 py-2 text-sm font-semibold">
          {cardio.map((c) => (
            <li key={c.id} className="flex justify-between gap-3 py-1">
              <span>{cardioLabel(c.type)}</span>
              <span className="num text-muted">{cardioSummary(c, units)}</span>
            </li>
          ))}
        </ul>
      )}
      {timer && (
        <p className="text-sm font-semibold text-warn">
          Your {cardioLabel(timer.type).toLowerCase()} timer {timer.stoppedAt ? "has no results yet" : "is still running"}. Tap Keep going to finish it, or it won&apos;t be saved.
        </p>
      )}
      {workingSets === 0 && cardio.length === 0 && <p className="text-sm font-semibold text-warn">Nothing logged yet. Exercises without sets or results are left out when you save.</p>}
      <button type="button" className={btn.primary} onClick={onSave}>Save workout</button>
      <button type="button" className={btn.secondary} onClick={onClose}>Keep going</button>
      <button type="button" className={`${btn.ghost} text-danger`} onClick={onDiscard}>Discard workout</button>
    </div>
  );
}

/** "+ Cardio" mid-workout: pick a type and it runs in the blue card, so the workout stays on screen. */
function AddCardio({ busy, pastHref, onStart }: { busy: string | null; pastHref: string; onStart: (t: CardioType) => void }) {
  const [type, setType] = useState<CardioType | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="-mt-1 text-base font-medium text-muted">It runs in the blue card, so you can keep scrolling your workout.</p>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Cardio type">
        {CARDIO_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={type === t.id}
            onClick={() => setType(t.id)}
            className={`display h-16 rounded-2xl border-2 text-xl font-extrabold tracking-[0.04em] ${type === t.id ? "border-accent-strong bg-primary/15 text-accent-soft" : "border-line bg-card-2 text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {busy && <p className="text-sm font-semibold text-warn">Your {busy.toLowerCase()} timer is still going. Finish it first.</p>}
      <button type="button" disabled={!type || Boolean(busy)} className={btn.primary} onClick={() => type && onStart(type)}>
        {type ? `Start ${cardioLabel(type).toLowerCase()}` : "Pick one to start"}
      </button>
      <Link href={pastHref} className={btn.ghost}>Log a past session instead</Link>
    </div>
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
function SmartExercisePicker({
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

const ACTION_HELP: Record<string, string> = {
  swap: "Pick a different exercise",
  how: "Cues and pictures",
  notes: "Seat height, how it felt",
  remove: "Take it out of this workout",
};

/** Row number disc in the workout list, with a faint inner ring (UX spec 5.4). */
const numberDisc = "bg-card-2 text-muted shadow-[inset_0_0_0_5px_var(--card-2),inset_0_0_0_6px_rgba(255,255,255,0.16)]";

function Dots() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
    </svg>
  );
}
