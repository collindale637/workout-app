"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useNow } from "@/lib/use-now";
import { isAvailable } from "@/lib/availability";
import { RPE_SCALE } from "@/lib/defaults";
import { formatDuration, formatMax, formatWeight, fromDisplayWeight, toDisplayWeight, volumeLb, weightStep, weightUnit } from "@/lib/units";
import { bestE1rm } from "@/lib/progress";
import { ExercisePicker } from "@/components/exercise-picker";
import { ExerciseInfo } from "@/components/exercise-info";
import { Sheet, btn, field, label } from "@/components/ui/kit";
import { RpeSlider } from "@/components/rpe-slider";
import { ReorderList, type ReorderItem } from "@/components/reorder-list";
import { filledSets, nextSlot, slotRows } from "@/lib/set-slots";
import { CardioPanel, type CardioSave } from "./cardio-panel";
import type { CardioSession, CardioType, SetType, Units, Workout, WorkoutExercise, WorkoutSet } from "@/lib/db/types";

type Draft = { weight: number | null; reps: number | null; rpe: number | null; type: SetType };

const TYPE_LABEL: Record<SetType, string> = { warmup: "Warm-up", working: "Working", drop: "Drop" };

export function LiveWorkout({ workout }: { workout: Workout }) {
  const router = useRouter();
  const { db } = useData();
  const { profile } = useProfile();
  const catalog = useCatalog();
  const { gym, equipment, equipmentRows } = useActiveGym();
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

  // Prefill the next set: your last set of this exercise today, else the same set from last time.
  useEffect(() => {
    // Wait until this exercise's history has loaded, or the first set would prefill blank and never update.
    if (!current || !history || !history.has(current.exercise_id) || isCardioWex(current)) return;
    const key = `${current.id}:${(setsBy.get(current.id) ?? []).length}`;
    if (draftFor === key) return;
    const done = setsBy.get(current.id) ?? [];
    const lastToday = [...done].reverse().find((s) => s.type !== "warmup") ?? done[done.length - 1];
    const prev = history.get(current.exercise_id)?.last.filter((s) => s.type !== "warmup") ?? [];
    const sameSetLastTime = prev[nextSlot(done, current.target_sets ?? 3, current.skipped_sets) - 1] ?? prev[prev.length - 1];
    // First set of an exercise: double progression from last time (more weight once you hit the top of the range).
    const suggestion = !lastToday && prev.length ? suggestNext(prev, current.rep_min, current.rep_max, loadFor(catalog?.needs.get(current.exercise_id) ?? [], gym ? equipmentRows : null)) : null;
    const src = lastToday ?? sameSetLastTime;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill when the current exercise or set changes
    setDraft({
      weight: suggestion && suggestion.weight !== null ? suggestion.weight : (src?.weight ?? null),
      reps: suggestion?.reps ?? src?.reps ?? current.rep_max ?? null,
      rpe: null,
      type: "working",
    });
    setDraftFor(key);
  }, [current, history, setsBy, draftFor, catalog]); // eslint-disable-line react-hooks/exhaustive-deps

  const [picker, setPicker] = useState<null | { mode: "add" } | { mode: "swap"; wex: WorkoutExercise }>(null);
  const [menuFor, setMenuFor] = useState<WorkoutExercise | null>(null);
  const [editSet, setEditSet] = useState<WorkoutSet | null>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [notesFor, setNotesFor] = useState<WorkoutExercise | "workout" | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [allDoneOpen, setAllDoneOpen] = useState(false);
  const [typing, setTyping] = useState<null | "weight" | "reps">(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [addCardioOpen, setAddCardioOpen] = useState(false);
  // After the last set of an exercise, the blue card shows "Up next" (set to that exercise's id) until you start the next one.
  const [upNextFrom, setUpNextFrom] = useState<string | null>(null);

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
    await actions.logSet(current.id, draft);
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
  // "Up 5 lb from last time" when double progression added weight for today.
  const upHint = (() => {
    if (!current || isCardio || doneSets.length || !history) return null;
    const prev = history.get(current.exercise_id)?.last.filter((s) => s.type !== "warmup") ?? [];
    if (!prev.length) return null;
    const sug = suggestNext(prev, current.rep_min, current.rep_max, loadFor(catalog.needs.get(current.exercise_id) ?? [], gym ? equipmentRows : null));
    if (sug.change !== "up" || sug.weight === null || sug.from === null) return null;
    return `▲ UP ${formatWeight(sug.weight - sug.from, units)} ${weightUnit(units).toUpperCase()}`;
  })();

  const listItems: ReorderItem[] = wexs.map((w, i) => {
    const e = catalog.byId.get(w.exercise_id);
    const cardioWex = isCardioWex(w);
    const cardioDone = cardioByWex.get(w.id);
    const running = timer && timer.wexId === w.id ? timer : null;
    const linkedAbove = i > 0 && w.superset_group !== null && wexs[i - 1].superset_group === w.superset_group;
    const skippedN = (w.skipped_sets ?? []).filter((n) => n <= (w.target_sets ?? 3)).length;
    const isCur = !extra && w.id === current?.id;
    return {
      id: w.id,
      ariaLabel: `${e?.name ?? w.exercise_id}. Tap to open. Swipe left for options. Hold to drag.`,
      liClassName: linkedAbove ? "-mt-2" : "",
      before: linkedAbove ? <div className="ml-6 h-2 w-1 bg-accent-strong" aria-hidden="true" /> : undefined,
      faceClassName: `flex min-h-16 items-center rounded-2xl border-2 py-2 pr-3 pl-4 ${isCur ? "border-accent-strong bg-[#0f1638]" : "border-line bg-card"}`,
      onTap: () => {
        setUpNextFrom(null);
        setCurrentId(w.id);
      },
      face: (
        <>
          <span className={`display flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-extrabold ${done(w) ? "bg-primary text-white" : "bg-card-2 text-muted"}`}>
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
              {w.notes ? <span className="text-accent-soft"> · {w.notes}</span> : null}
            </span>
          </span>
          <svg className="shrink-0 text-[#454d6e]" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
          </svg>
        </>
      ),
      actions: [
        { key: "swap", label: "Swap", icon: <RowIcon name="swap" />, className: "bg-primary text-white", onPress: () => setPicker({ mode: "swap", wex: w }) },
        { key: "how", label: "How-to", icon: <RowIcon name="how" />, className: "bg-[#2a3150] text-white", onPress: () => setInfoFor(w.exercise_id) },
        { key: "notes", label: "Notes", icon: <RowIcon name="notes" />, className: "bg-[#3b4a8c] text-white", onPress: () => setNotesFor(w) },
        {
          key: "remove",
          label: "Remove",
          icon: <RowIcon name="remove" />,
          className: "bg-danger text-white",
          onPress: async () => {
            if (confirm(cardioWex ? "Remove this cardio and its results?" : "Remove this exercise and its sets?")) await actions.removeWex(w.id);
          },
        },
      ],
    };
  });

  return (
    <main className="flex min-h-dvh flex-col pb-10">
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
            {rest && restLeft > 0 && (
              <RestBar left={restLeft} total={rest.total} onAdd={() => db.setMeta("rest", { ...rest, endsAt: rest.endsAt + 15000, total: rest.total + 15 })} onSkip={() => db.setMeta("rest", null)} />
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
        ) : current && ex ? (
          <>
            <button type="button" onClick={() => setInfoFor(current.exercise_id)} className="mt-1 block text-left">
              <h1 className="display text-[34px] leading-[0.95] font-extrabold">{ex.name}</h1>
            </button>
            <p className="mt-1.5 flex flex-wrap items-center gap-y-1 text-sm font-bold tracking-[0.08em] text-[#DCE4FF]">
              <button type="button" onClick={() => setTypeOpen(true)} className="relative mr-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 pr-2.5 pl-3 after:absolute after:-inset-2 after:content-[''] active:bg-white/25" aria-label="Change set type: working, warm-up or drop">
                {draft.type === "warmup" ? "WARM-UP" : draft.type === "drop" ? "DROP SET" : setNumber > (current.target_sets ?? 3) ? `EXTRA SET ${setNumber}` : `SET ${setNumber} OF ${current.target_sets ?? 3}`}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setMenuFor(current)}
                className="relative ml-1 inline-flex h-9 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-white/45 px-3 after:absolute after:-inset-1 after:content-[''] active:bg-white/15"
                aria-label="Edit sets, reps and rest"
              >
                TARGET {targetLabel.toUpperCase()} ✎
              </button>
              {current.superset_group !== null && <span>&nbsp;· SUPERSET</span>}
            </p>
            {gym && !isAvailable(catalog.needs.get(current.exercise_id) ?? [], equipment) && (
              <p className="mt-1 text-sm font-bold text-[#FFD2B3]">Heads up: {gym.name} may not have the equipment for this. Swap?</p>
            )}

            {upHint && <p className="mt-2 -mb-1.5 w-[calc(50%-5px)] text-center text-sm font-bold tracking-[0.08em] text-[#C9F7DA]">{upHint}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <Stepper
                label={isBodyweight && draft.weight === null ? "BODYWEIGHT" : weightUnit(units).toUpperCase()}
                value={draft.weight === null ? (isBodyweight ? "BW" : "—") : formatWeight(draft.weight, units)}
                onMinus={() => bumpWeight(-1)}
                onPlus={() => bumpWeight(1)}
                onTap={() => setTyping("weight")}
              />
              <Stepper label="REPS" value={draft.reps === null ? "—" : String(draft.reps)} onMinus={() => bumpReps(-1)} onPlus={() => bumpReps(1)} onTap={() => setTyping("reps")} />
            </div>

            <div className="mt-2.5">
              <div className="mb-1.5 text-xs leading-none font-bold tracking-[0.1em] text-[#DCE4FF]">RPE · HOW HARD?</div>
              <RpeSlider value={draft.rpe} defaultRpe={defaultRpe} resetKey={current.id} onChange={(rpe) => setDraft({ ...draft, rpe })} />
            </div>

            {rest && restLeft > 0 && (
              <RestBar left={restLeft} total={rest.total} onAdd={() => db.setMeta("rest", { ...rest, endsAt: rest.endsAt + 15000, total: rest.total + 15 })} onSkip={() => db.setMeta("rest", null)} />
            )}

            <button
              type="button"
              onClick={log}
              className="display mt-3.5 flex h-15 w-full items-center justify-center rounded-2xl bg-white text-xl font-extrabold tracking-[0.04em] text-primary shadow-[inset_0_-4px_0_#C9D3FF] active:translate-y-px"
            >
              Log {draft.type === "warmup" ? "warm-up" : draft.type === "drop" ? "drop set" : `set ${setNumber}`}
            </button>
          </>
        ) : (
          <div className="py-6">
            <h1 className="display text-4xl font-extrabold">{workout.name ?? "Workout"}</h1>
            <p className="mt-1 text-base font-semibold text-[#DCE4FF]">Add your first exercise to start logging.</p>
          </div>
        )}
      </section>

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
                <button type="button" onClick={() => setCurrentId(it.key)} className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 py-2 pr-4 pl-4 text-left ${on ? "border-accent-strong bg-primary/10" : "border-line bg-card"}`}>
                  <span className={`display flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-extrabold ${it.session && !t ? "bg-primary text-white" : "bg-card-2 text-muted"}`}>{it.session && !t ? "✓" : "+"}</span>
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

      {/* Sheets */}
      <Sheet open={picker !== null} onClose={() => setPicker(null)} title={picker?.mode === "swap" ? "Swap for…" : "Add exercises"}>
        {picker && (
          <ExercisePicker
            mode={picker.mode === "swap" ? "single" : "multi"}
            gymEquipment={gym ? equipment : null}
            gymName={gym?.name}
            excludeIds={wexs.map((w) => w.exercise_id)}
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
          bestBefore={history}
          names={catalog.byId}
          onSave={async () => {
            await actions.finish(workout.id);
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

function Stepper({ label: l, value, onMinus, onPlus, onTap }: { label: string; value: string; onMinus: () => void; onPlus: () => void; onTap: () => void }) {
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-white/10 p-1">
      <button type="button" onClick={onMinus} aria-label={`Less ${l}`} className="flex h-[52px] w-11 shrink-0 items-center justify-center rounded-full border-2 border-white/60 text-xl font-bold">−</button>
      <button type="button" onClick={onTap} className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center" aria-label={`${l} ${value}. Tap to type`}>
        <span className="display num text-[40px] leading-none font-extrabold">{value}</span>
        <span className="display mt-0.5 truncate text-[11px] leading-none font-bold tracking-[0.12em] text-[#DCE4FF]">{l}</span>
      </button>
      <button type="button" onClick={onPlus} aria-label={`More ${l}`} className="flex h-[52px] w-11 shrink-0 items-center justify-center rounded-full bg-white text-xl font-bold text-primary">+</button>
    </div>
  );
}

/** Slim rest countdown inside the blue card, just above Log. */
function RestBar({ left, total, onAdd, onSkip }: { left: number; total: number; onAdd: () => void; onSkip: () => void }) {
  const pct = Math.min(1, left / Math.max(1, total));
  useEffect(() => {
    if (left === 1 && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
  }, [left]);
  return (
    <div className="mt-2 flex h-11 items-center gap-3" role="timer" aria-label={`Rest ${formatDuration(left)} left`}>
      <span className="display w-10 shrink-0 text-sm font-extrabold tracking-[0.1em] text-[#DCE4FF]">REST</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full bg-white transition-[width] duration-1000 ease-linear" style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="display num w-12 shrink-0 text-right text-2xl font-extrabold">{formatDuration(left)}</span>
      <button type="button" onClick={onAdd} className="display -mr-1 h-11 min-w-11 rounded-xl px-2 text-base font-extrabold text-[#DCE4FF]">+15</button>
      <button type="button" onClick={onSkip} className="display h-11 min-w-11 rounded-xl px-2 text-base font-extrabold text-white">Skip</button>
    </div>
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
  done, history, units, defaultRpe, nextType, target, skipped, hideNext, onEdit, onSkip, onUnskip,
}: {
  done: WorkoutSet[];
  history?: { last: WorkoutSet[]; lastDate: string | null };
  units: Units;
  defaultRpe: number;
  nextType: SetType;
  target: number;
  skipped: number[];
  hideNext: boolean;
  onEdit: (s: WorkoutSet) => void;
  onSkip: (slot: number) => void;
  onUnskip: (slot: number) => void;
}) {
  const last = history?.last.filter((s) => s.type !== "warmup") ?? [];
  const u = weightUnit(units) === "kg" ? "kg" : "lbs";
  const cols = "grid grid-cols-[2.75rem_1.15fr_1fr_4.25rem] items-center";
  const badge = "display flex h-8 w-8 items-center justify-center rounded-lg text-base font-extrabold";
  const skipBtn = "display relative h-9 min-w-14 justify-self-end rounded-[10px] bg-card-2 px-2.5 text-sm font-extrabold tracking-[0.08em] text-muted after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] active:bg-line";

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
                  <span className="rounded-md bg-primary/20 px-1.5 py-px text-accent-soft">RPE {s.rpe ?? defaultRpe}</span>
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
        if (r.kind === "next") {
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
      <span className={label}>RPE (BLANK = {defaultRpe})</span>
      <div className="grid grid-cols-7 gap-1.5">
        {RPE_SCALE.map((v) => (
          <button key={v} type="button" onClick={() => setRpe(rpe === v ? null : v)} className={`display num h-11 rounded-xl text-lg font-extrabold ${rpe === v ? "bg-primary text-white" : "bg-card-2 text-muted"}`}>{v}</button>
        ))}
      </div>
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
  workout, wexs, setsBy, units, elapsed, cardio, timer, bestBefore, names, onSave, onDiscard, onClose,
}: {
  workout: Workout; wexs: WorkoutExercise[]; setsBy: Map<string, WorkoutSet[]>; units: Units; elapsed: number;
  cardio: CardioSession[]; timer: CardioTimer | null;
  bestBefore: Map<string, { bestWeight: number; best1RM: number }> | undefined; names: Map<string, { name: string }>;
  onSave: () => void; onDiscard: () => void; onClose: () => void;
}) {
  const all = wexs.flatMap((w) => setsBy.get(w.id) ?? []);
  const workingSets = all.filter((s) => s.type !== "warmup").length;
  const volume = volumeLb(all);
  const prs = wexs.flatMap((w) => {
    const prev = bestBefore?.get(w.exercise_id);
    const sets = (setsBy.get(w.id) ?? []).filter((s) => s.type !== "warmup" && s.weight && s.reps);
    if (!prev || !sets.length || (prev.bestWeight === 0 && prev.best1RM === 0)) return [];
    const top = Math.max(...sets.map((s) => s.weight!));
    const top1 = bestE1rm(sets);
    if (top > prev.bestWeight) return [`${names.get(w.exercise_id)?.name}: heaviest ever, ${formatWeight(top, units)} ${weightUnit(units)}`];
    if (top1 > prev.best1RM + 0.5) return [`${names.get(w.exercise_id)?.name}: best estimated max, ${formatMax(top1, units)} ${weightUnit(units)}`];
    return [];
  });
  // Every logged set of each lift, in order (exercises without sets are dropped on save).
  const setText = (s: WorkoutSet) => {
    const load = s.weight ? `${formatWeight(s.weight, units)} ${weightUnit(units)}` : "Bodyweight";
    return s.reps ? `${load} × ${s.reps}` : load;
  };
  const lifts = wexs.flatMap((w) => {
    const sets = [...(setsBy.get(w.id) ?? [])].sort((a, b) => a.set_no - b.set_no);
    if (!sets.length) return [];
    return [{ id: w.id, name: names.get(w.exercise_id)?.name ?? w.exercise_id, sets }];
  });
  const stat = (v: string, l: string) => (
    <div className="rounded-2xl bg-card-2 p-3 text-center">
      <div className="display num text-3xl font-extrabold">{v}</div>
      <div className="text-xs font-bold tracking-[0.1em] text-muted">{l}</div>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {stat(formatDuration(elapsed), "TIME")}
        {stat(String(workingSets), "SETS")}
        {stat(`${Math.round(units === "kg" ? volume / 2.2046 : volume).toLocaleString()}`, `${weightUnit(units).toUpperCase()} MOVED`)}
      </div>
      {prs.length > 0 && (
        <div className="rounded-2xl border-2 border-accent-strong bg-primary/15 p-3">
          <div className="display text-lg font-extrabold text-accent-soft">🏆 New records</div>
          <ul className="mt-1 text-sm font-semibold">{prs.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {lifts.length > 0 && (
        <ul className="flex flex-col gap-3 rounded-2xl bg-card-2 px-3 py-3 text-sm font-semibold">
          {lifts.map((l) => (
            <li key={l.id}>
              <div className="truncate text-base font-bold">{l.name}</div>
              <ol className="mt-1 flex flex-col">
                {l.sets.map((st, i) => (
                  <li key={st.id} className="flex justify-between gap-3 py-0.5">
                    <span className="text-muted">
                      {i + 1}
                      {st.type === "warmup" ? " · warm-up" : st.type === "drop" ? " · drop" : ""}
                    </span>
                    <span className="num">
                      {setText(st)}
                      {st.rpe ? <span className="text-muted"> · RPE {st.rpe}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
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
      <p className="text-center text-xs font-medium text-muted">{workout.name ?? "Workout"} · started {new Date(workout.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
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
