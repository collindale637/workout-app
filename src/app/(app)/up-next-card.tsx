"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/db/provider";
import { useActiveGym, useCatalog } from "@/lib/hooks";
import { repairSupersets, useWorkoutActions } from "@/lib/workout";
import { suggestionFor, useGeneratorInputs, useLastSets, useStartingProfile } from "@/lib/smart";
import { formatWait, groupReadiness, READY_AVG } from "@/lib/readiness";
import { pickAlternative } from "@/lib/today-alt";
import { useUpNext, useUpNextChoice } from "@/lib/up-next";
import { doseLabel, suggestionLabel, supersetLetter } from "@/components/planned";
import { MuscleChooser } from "@/components/muscle-chooser";
import { Sheet, btn } from "@/components/ui/kit";
import { ExerciseInfo } from "@/components/exercise-info";
import { ReorderList, type ReorderItem, type RowAction } from "@/components/reorder-list";
import { NotesForm, RowIcon, SmartExercisePicker } from "@/components/exercise-actions";
import type { GenItem } from "@/lib/generator";
import { AiWorkoutSheet, Sparkle } from "@/components/ai";
import { TODAY_TOP_EVENT } from "./today-cardio";

/** Where the exercise sheet sits: a bar above the tabs, under the card (follows it as the page scrolls), or full height. */
type SheetMode = "min" | "default" | "max";
const SHEET_UP: Record<SheetMode, SheetMode> = { min: "default", default: "max", max: "max" };
/** How far the sheet's rounded top tucks over the bottom of the blue card. */
const TUCK = 16;
const STICKY_TOP = "calc(env(safe-area-inset-top) + 8px)";

/**
 * Today's suggested workout: the next plan day, your freshest muscles, or muscles you picked.
 * The blue card is followed by a sheet holding the exercise list and `children` (quick cardio and the rest of Today).
 */
export function UpNextCard({ hasGym, children }: { hasGym: boolean; children?: React.ReactNode }) {
  const router = useRouter();
  const up = useUpNext();
  const catalog = useCatalog();
  const { profile } = useProfile();
  const { gym, equipment, equipmentRows } = useActiveGym();
  const { choice, setChoice } = useUpNextChoice();
  const { start } = useWorkoutActions();
  const lastSets = useLastSets((up?.items ?? []).map((i) => i.exercise_id));
  const who = useStartingProfile();
  const [options, setOptions] = useState(false);
  const [pickMuscles, setPickMuscles] = useState(false);
  const [starting, setStarting] = useState(false);
  // Today stays alive in the background while you're in the workout (cacheComponents keeps page state), so a
  // discarded workout used to leave this on "Starting…". Effects are torn down when the page is hidden: reset there.
  useEffect(() => {
    if (!starting) return;
    return () => setStarting(false);
  }, [starting]);
  const [aiOpen, setAiOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [showSwaps, setShowSwaps] = useState(false);
  // Today-list edits: which row's notes or swap picker is open (by row key).
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const { recovery } = useGeneratorInputs();
  const { mode, cardRef, sheetRef, headerRef, bodyRef, restRef, headerH, dragProps, cycle, openCardio } = useExerciseSheet();

  if (up === undefined || !catalog || !profile) {
    return (
      <>
        <section className="h-[300px] animate-pulse rounded-[28px] bg-primary/40" aria-label="Loading today's workout" />
        {children}
      </>
    );
  }
  if (up === null) {
    return (
      <>
        <StartCard hasGym={hasGym} />
        {children}
      </>
    );
  }

  const units = profile.units;
  const seed = choice?.seed ?? 0;
  const regenerate = () => setChoice({ mode: up.mode, dayId: up.day?.id ?? null, muscles: choice?.muscles, seed: seed + 1, via: choice?.via, light: choice?.light });

  // Readiness of today's muscles (Part 2.1), with the same rule as the Recovery tab.
  const tau = new Map(catalog.muscles.map((m) => [m.id, m.recovery_tau_hours]));
  const readinessOf = (n: string, muscles: string[]) => (recovery ? groupReadiness({ name: n, muscles }, recovery.map, tau) : null);
  const rd = up.targets.length ? readinessOf(up.title, up.targets) : null;
  const lowest =
    rd && !rd.ready && recovery
      ? up.targets.flatMap((m) => (recovery.map.get(m) ? [recovery.map.get(m)!] : [])).sort((a, b) => a.score - b.score).slice(0, 2)
      : [];

  // One Switch when the plan day isn't ready (Part 2.2): a later ready day, or a lighter version of this one.
  const switched = choice?.via === "switch" && up.mode === "plan";
  const switchedDay = switched && !choice?.light;
  const planned = up.plan ? (switchedDay ? up.plan.nextDay : up.day) : null;
  const undo = () => setChoice({ mode: "plan", seed: 0 });
  const switchRow: null | { text: React.ReactNode; label: "Switch" | "Undo"; onPress: () => void } = (() => {
    if (up.mode !== "plan" || !up.plan || !planned || !recovery) return null;
    if (switchedDay) return { text: <>{planned.name} stays next in your plan.</>, label: "Undo", onPress: undo };
    if (switched) return { text: <>Lighter {planned.name}: 2 sets per lift, about {up.light?.minutes ?? profile.session_minutes} min.</>, label: "Undo", onPress: undo };
    if (!rd || rd.ready) return null;
    const alt = pickAlternative(up.plan.days, planned.id, (d) => readinessOf(d.name, d.target_muscle_ids) ?? { ready: false });
    if (alt.kind === "day") {
      const score = readinessOf(alt.day.name, alt.day.target_muscle_ids)?.score ?? 0;
      return {
        text: (
          <>
            <b className="font-extrabold">{alt.day.name} is ready ({score}%).</b> Train it today, {planned.name} next.
          </>
        ),
        label: "Switch",
        onPress: () => setChoice({ mode: "plan", dayId: alt.day.id, seed: 0, via: "switch" }),
      };
    }
    return {
      text: (
        <>
          <b className="font-extrabold">Nothing in your plan is ready.</b> Go lighter: 2 sets per lift.
        </>
      ),
      label: "Switch",
      onPress: () => setChoice({ mode: "plan", dayId: planned.id, seed: 0, light: true, via: "switch" }),
    };
  })();
  const startAnyway = rd !== null && !rd.ready && !switched;

  async function go() {
    if (!up || !up.items.length) return;
    setStarting(true);
    // A switched-in day starts outside the plan's order, so the planned day stays next.
    await start({ items: up.items, name: up.title, gymId: gym?.id ?? null, planDayId: switchedDay ? null : (up.day?.id ?? null), source: up.source });
    router.push("/workout");
  }

  const swapped = up.swaps.filter((s) => s.to);
  const dropped = up.swaps.filter((s) => !s.to);
  const wasFrom = new Map(swapped.map((s) => [s.to!, s.from]));
  const name = (id: string) => catalog.byId.get(id)?.name ?? id;
  const minutes = up.light?.minutes ?? profile.session_minutes;
  // Minimized sheet: the room it frees shows how recovered each of today's muscles is.
  const muscleRows =
    mode === "min" && recovery
      ? up.targets.map((m) => ({ id: m, name: catalog.muscleName.get(m) ?? m, score: Math.round(recovery.map.get(m)?.score ?? 100) }))
      : [];
  const muscleChips = up.targets.map((m) => catalog.muscleName.get(m) ?? m);

  // ---- Editing the list before you start: drag to reorder, swipe left for Swap / How-to / Notes / Remove. ----
  // Each row gets a stable key (the exercise, plus a count if it appears twice).
  const keyed = up.items.map((it, i) => ({ it, key: `${it.exercise_id}~${up.items.slice(0, i).filter((x) => x.exercise_id === it.exercise_id).length}` }));
  const byKey = new Map(keyed.map((k) => [k.key, k.it]));
  // Saved with today's choice; regenerating or changing the workout starts fresh (see UpNextEdits).
  const saveItems = (items: GenItem[]) => {
    const groups = repairSupersets(items.map((i) => i.superset_group));
    return setChoice({
      ...choice,
      mode: up.mode,
      dayId: up.mode === "plan" ? (up.day?.id ?? null) : (choice?.dayId ?? null),
      seed: up.seed,
      edits: { base: up.baseSig, items: items.map((i, n) => ({ ...i, superset_group: groups[n] })) },
    });
  };
  const updateItem = (key: string, patch: Partial<GenItem>) => saveItems(keyed.map((k) => (k.key === key ? { ...k.it, ...patch } : k.it)));
  const undoEdits = () => setChoice({ ...choice, mode: up.mode, seed: up.seed, edits: undefined });
  const rowActions = (key: string, exerciseId: string): RowAction[] => [
    { key: "swap", label: "Swap", icon: <RowIcon name="swap" />, className: "bg-primary text-white", onPress: () => setSwapFor(key) },
    { key: "how", label: "How-to", icon: <RowIcon name="how" />, className: "bg-[#2a3150] text-white", onPress: () => setViewing(exerciseId) },
    { key: "notes", label: "Notes", icon: <RowIcon name="notes" />, className: "bg-[#3b4a8c] text-white", onPress: () => setNotesFor(key) },
    { key: "remove", label: "Remove", icon: <RowIcon name="remove" />, className: "bg-danger text-white", onPress: () => void saveItems(keyed.filter((k) => k.key !== key).map((k) => k.it)) },
  ];
  const listItems: ReorderItem[] = keyed.map(({ it, key }, i) => {
    const s =
      catalog.byId.get(it.exercise_id)?.category === "cardio"
        ? undefined
        : suggestionFor(catalog, it.exercise_id, lastSets?.get(it.exercise_id), it.rep_min, it.rep_max, gym ? equipmentRows : null, who);
    const sLabel = suggestionLabel(s, units);
    const linkedAbove = i > 0 && it.superset_group !== null && up.items[i - 1].superset_group === it.superset_group;
    return {
      id: key,
      ariaLabel: `${name(it.exercise_id)}. Tap for how-to. Swipe left for options. Hold to drag.`,
      liClassName: linkedAbove ? "-mt-2" : "",
      before: linkedAbove ? <div className="ml-6 h-2 w-1 bg-accent-strong" aria-hidden="true" /> : undefined,
      faceClassName: "flex min-h-16 items-center rounded-[14px] bg-card-2 py-2 pr-2 pl-4 ring-1 ring-[#262d49] ring-inset",
      onTap: () => setViewing(it.exercise_id),
      face: (
        <>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-base font-bold">
              {it.superset_group !== null && <span className="mr-1.5 text-accent">{supersetLetter(it.superset_group)}</span>}
              {name(it.exercise_id)}
            </span>
            <span className="truncate text-sm font-medium text-muted">
              {doseLabel(catalog, it)}
              {showSwaps && wasFrom.has(it.exercise_id) && <span className="text-accent-soft"> · ⇄ was {name(wasFrom.get(it.exercise_id)!)}</span>}
              {it.notes && <span className="text-accent-soft"> · {it.notes}</span>}
            </span>
          </span>
          {sLabel &&
            (s?.change === "new" ? (
              <span className="shrink-0 text-sm font-semibold text-muted" title="First time: find a comfortable working weight">{sLabel}</span>
            ) : (
              <span className={`display num shrink-0 text-base font-extrabold ${s?.change === "up" ? "text-good" : "text-ink"}`}>{sLabel}</span>
            ))}
        </>
      ),
      // Hint that the row can be held and dragged (same grip as the workout list).
      trailing: (
        <svg className="ml-2 shrink-0 text-[#454d6e]" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
        </svg>
      ),
      actions: rowActions(key, it.exercise_id),
    };
  });
  const swapItem = swapFor ? byKey.get(swapFor) : undefined;
  const notesItem = notesFor ? byKey.get(notesFor) : undefined;

  return (
    <>
      {/* Keeps the page from showing behind the status bar while the card and the sheet's header are pinned. */}
      {mode === "default" && <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[12] mx-auto w-full max-w-md bg-bg" style={{ height: STICKY_TOP }} />}
      {/* The card pins at the top; scrolling on, the sheet slides up over it. */}
      <section
        ref={cardRef}
        className={`flex flex-col gap-3 rounded-[28px] bg-primary p-5 text-white ${mode === "default" ? "sticky" : ""}`}
        style={mode === "default" ? { top: STICKY_TOP } : undefined}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold tracking-[0.12em] text-[#DCE4FF]">
            UP NEXT{up.light ? " · LIGHTER" : up.mode === "fresh" ? " · FRESH MUSCLES" : up.mode === "muscles" ? " · YOUR PICK" : up.mode === "ai" ? " · AI" : ""}
          </span>
          <button type="button" onClick={() => setOptions(true)} className="display -mr-1 min-h-11 rounded-full px-3 text-sm font-extrabold tracking-[0.08em] text-[#DCE4FF]">
            Change
          </button>
        </div>
        <h1 className="display text-[56px] leading-[0.85] font-extrabold tracking-[-0.02em] break-words">{up.title}</h1>
        <p className="-mt-1 text-[15px] font-semibold text-[#DCE4FF]">{up.subtitle}</p>
        {rd && (
          <div className="flex flex-col gap-2 rounded-2xl bg-black/20 px-3 py-2.5">
            {/* One line so the card stays short and the list gets the room. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-xs font-bold tracking-[0.12em] text-[#DCE4FF]">READINESS</span>
              <div className="relative h-2 min-w-12 flex-1 rounded-full bg-white/20" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rd.score} aria-label="Readiness">
                <div className={`h-full rounded-full ${rd.ready ? "bg-good" : "bg-warn"}`} style={{ width: `${Math.min(100, rd.score)}%` }} />
                <span className="absolute -top-0.5 h-3 w-0.5 bg-white" style={{ left: `${READY_AVG}%` }} aria-hidden="true" />
              </div>
              <span className="display num text-xl leading-none font-extrabold">{rd.score}%</span>
              <span className={`display text-sm font-extrabold ${rd.ready ? "text-[#C9F7DA]" : "text-[#FFD2B3]"}`}>
                {rd.ready ? "Ready" : `Ready in ${formatWait(rd.hoursToReady)}`}
              </span>
            </div>
            {lowest.length > 0 && mode !== "min" && (
              <p className="text-sm font-semibold text-[#DCE4FF]">
                Lowest: {lowest.map((r) => `${catalog.muscleName.get(r.muscleId) ?? r.muscleId} ${Math.round(r.score)}%`).join(" · ")}
              </p>
            )}
            {muscleRows.length > 0 && (
              <ul className="flex flex-col gap-1.5 border-t border-white/15 pt-2" aria-label="Readiness by muscle">
                {muscleRows.map((r) => (
                  <li key={r.id} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_2.75rem] items-center gap-2 text-sm font-semibold text-[#DCE4FF]">
                    <span className="truncate">{r.name}</span>
                    <span className="h-1.5 rounded-full bg-white/20">
                      <span className={`block h-full rounded-full ${r.score >= READY_AVG ? "bg-good" : "bg-warn"}`} style={{ width: `${Math.min(100, r.score)}%` }} />
                    </span>
                    <span className="num text-right text-white">{r.score}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {switchRow && (
          <div className="flex min-h-14 items-center gap-3 rounded-2xl bg-white/15 py-1.5 pr-1.5 pl-3">
            <p className="min-w-0 flex-1 text-sm leading-tight font-semibold">{switchRow.text}</p>
            <button
              type="button"
              onClick={() => void switchRow.onPress()}
              className={`display h-11 shrink-0 rounded-xl px-4 text-base font-extrabold ${switchRow.label === "Switch" ? "bg-white text-primary" : "border-2 border-white/60 text-white"}`}
            >
              {switchRow.label}
            </button>
          </div>
        )}
        <div className="mt-1 flex items-start gap-2">
          <button
            type="button"
            onClick={go}
            disabled={starting || !up.items.length}
            className={`display flex h-[52px] flex-1 items-center justify-center gap-2.5 rounded-full text-xl font-extrabold tracking-[0.08em] disabled:opacity-60 ${
              startAnyway ? "border-2 border-white/70 text-white" : "bg-white text-primary"
            }`}
          >
            {!startAnyway && <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>}
            {starting ? "Starting…" : startAnyway ? "Start anyway" : "Start"}
          </button>
          {up.mode !== "ai" && (
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={regenerate}
                aria-label="Regenerate"
                title="Regenerate"
                className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-white/70"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
                </svg>
              </button>
              <span className="text-xs font-bold text-white/80">Regenerate</span>
            </div>
          )}
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              aria-label="Customize with AI"
              title="Customize with AI"
              className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-white/70 text-white"
            >
              <Sparkle size={22} />
            </button>
            <span className="text-xs font-bold text-white/80">Customize</span>
          </div>
        </div>
        {seed > 0 && up.mode !== "ai" && (
          // The generator is seeded, so stepping the seed back rebuilds the earlier workout exactly.
          <div className="-mb-1 flex items-center justify-center gap-2">
            <button type="button" className="display min-h-11 px-3 text-sm font-extrabold tracking-[0.06em] text-white" onClick={() => setChoice({ ...choice!, mode: up.mode, dayId: up.day?.id ?? null, seed: seed - 1 })}>
              ↶ Undo
            </button>
            {seed > 1 && (
              <>
                <span className="text-white/50" aria-hidden="true">·</span>
                <button type="button" className="display min-h-11 px-3 text-sm font-extrabold tracking-[0.06em] text-white" onClick={() => setChoice({ ...choice!, mode: up.mode, dayId: up.day?.id ?? null, seed: 0 })}>
                  Back to original
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {/* Minimized: keep the page scrollable past the bar that now sits above the tabs. */}
      {mode === "min" && <div aria-hidden="true" style={{ height: headerH }} />}

      {/*
        Default: in the page under the card. Minimized and expanded: one full-height panel fixed between the top and the
        tabs; minimized just slides it down so only the header shows. Either way it moves as one piece when dragged.
      */}
      <section
        ref={sheetRef}
        aria-label="Today's exercises"
        className={
          mode === "default"
            ? "relative z-10 -mx-5 rounded-t-[28px] bg-card shadow-[0_-12px_30px_rgba(0,0,0,0.35)]"
            : "fixed inset-x-0 z-[15] mx-auto flex w-full max-w-md flex-col rounded-t-[28px] bg-card shadow-[0_-12px_30px_rgba(0,0,0,0.4)]"
        }
        style={
          mode === "default"
            ? { marginTop: -(16 + TUCK), marginBottom: "-7rem", paddingBottom: "7rem" }
            : { top: STICKY_TOP, bottom: "var(--nav-h)", transform: mode === "min" ? restingTransform("min", headerH) : undefined }
        }
      >
        {/* The whole header is the grab area: drag it to move the sheet without scrolling the page. */}
        <div
          ref={headerRef}
          {...dragProps}
          className={`shrink-0 touch-none rounded-t-[28px] bg-card px-5 pb-2 select-none ${mode === "default" ? "sticky z-20" : ""}`}
          style={mode === "default" ? { top: STICKY_TOP } : undefined}
        >
          <button
            type="button"
            onClick={cycle}
            aria-label={mode === "max" ? "Shrink the exercise list" : "Show more of the exercise list"}
            className="-mx-5 flex h-8 w-[calc(100%+2.5rem)] items-center justify-center"
          >
            <span className="h-[5px] w-10 rounded-full bg-muted/40" />
          </button>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-xs font-bold tracking-[0.12em] text-accent">IN TODAY&apos;S {up.title.toUpperCase()}</span>
            <button type="button" onClick={openCardio} className="-my-2 flex min-h-11 shrink-0 items-center" aria-label="Cardio: jump to quick cardio">
              <span className="display flex h-8 items-center gap-1.5 rounded-full bg-chart-2/20 px-3 text-sm font-extrabold tracking-[0.06em] text-[var(--cardio-soft)]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12h4l3-7 4 14 3-7h4" />
                </svg>
                Cardio
              </span>
            </button>
          </div>
          <h2 className="display text-2xl leading-tight font-extrabold">
            {up.items.length} exercise{up.items.length === 1 ? "" : "s"} · ~{minutes} min
          </h2>
          <div className="-mx-5 flex touch-pan-x items-center gap-1.5 overflow-x-auto px-5 [scrollbar-width:none]">
            {up.swaps.length > 0 ? (
              <ChipButton active={showSwaps} onClick={() => setShowSwaps(!showSwaps)}>
                {showSwaps ? "⇄ Hide swaps" : `⇄ ${up.swaps.length} swapped`}
              </ChipButton>
            ) : up.mode === "plan" ? (
              <ChipButton onClick={() => setChoice({ mode: "fresh", seed: 0 })}>Fresh muscles only</ChipButton>
            ) : up.plan ? (
              <ChipButton onClick={() => setChoice({ mode: "plan", seed: 0 })}>Back to my plan</ChipButton>
            ) : (
              <Link href="/plan" className="flex min-h-11 shrink-0 items-center">
                <span className={chipOutline}>Set up a plan →</span>
              </Link>
            )}
            {up.edited && <ChipButton onClick={() => void undoEdits()}>↺ Undo changes</ChipButton>}
            {muscleChips.map((m) => (
              <span key={m} className="flex h-8 shrink-0 items-center rounded-full bg-primary/15 px-3 text-sm font-semibold whitespace-nowrap text-accent-soft">
                {m}
              </span>
            ))}
          </div>
        </div>

        <div
          ref={bodyRef}
          className={`flex flex-col gap-6 px-5 ${mode === "default" ? "pb-2" : `min-h-0 flex-1 overscroll-contain pb-8 ${mode === "max" ? "overflow-y-auto" : "overflow-hidden"}`}`}
        >
        <div className="flex flex-col">
        {up.items.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line px-5 py-6 text-center text-base font-medium text-muted">
            Nothing at {gym?.name ?? "this gym"} trains these muscles. Tap Change to pick others, or add equipment under More → Gyms.
          </p>
        ) : (
          <ReorderList items={listItems} onReorder={(ids) => void saveItems(ids.map((id) => byKey.get(id)!).filter(Boolean))} />
        )}
        {showSwaps && dropped.length > 0 && (
          <p className="pt-2 text-sm font-medium text-muted">Not available at {gym?.name ?? "this gym"}: {dropped.map((s) => name(s.from)).join(", ")}</p>
        )}
        </div>
        <div ref={restRef} className="flex flex-col gap-4">
          {children}
        </div>
        </div>
      </section>

      <Sheet open={viewing !== null} onClose={() => setViewing(null)} title={viewing ? name(viewing) : undefined}>
        {viewing && <ExerciseInfo catalog={catalog} id={viewing} gymEquipment={gym ? equipment : null} gymName={gym?.name} />}
      </Sheet>

      <Sheet open={swapItem !== undefined} onClose={() => setSwapFor(null)} title="Swap for…">
        {swapItem && swapFor && (
          <SmartExercisePicker
            mode="swap"
            swapFrom={swapItem.exercise_id}
            fromIsCardio={catalog.byId.get(swapItem.exercise_id)?.category === "cardio"}
            gymEquipment={gym ? equipment : null}
            gymName={gym?.name}
            excludeIds={up.items.map((i) => i.exercise_id)}
            today={{ name: up.title, items: up.items.map((i) => ({ exercise_id: i.exercise_id, sets_done: 0, sets_planned: i.sets })) }}
            initialMuscles={(catalog.musclesOf.get(swapItem.exercise_id) ?? []).filter((m) => m.role === "primary").map((m) => m.muscle_id)}
            onPick={async (ids) => {
              if (ids[0]) await updateItem(swapFor, { exercise_id: ids[0] });
              setSwapFor(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={notesItem !== undefined} onClose={() => setNotesFor(null)} title="Exercise notes">
        {notesItem && notesFor && (
          <NotesForm
            initial={notesItem.notes}
            onSave={async (text) => {
              await updateItem(notesFor, { notes: text });
              setNotesFor(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={options} onClose={() => setOptions(false)} title="What to train today">
        <div className="flex flex-col gap-2">
          {up.plan && (
            <div className="flex flex-col gap-2 rounded-2xl bg-card-2 p-3">
              <span className="text-sm font-bold text-muted">{up.plan.plan.name}</span>
              <div className="flex flex-wrap gap-2">
                {up.plan.days.map((d) => {
                  const on = up.mode === "plan" && up.day?.id === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={async () => {
                        await setChoice({ mode: "plan", dayId: d.id, seed: 0 });
                        setOptions(false);
                      }}
                      className={`min-h-11 rounded-2xl border-2 px-3 text-sm font-bold ${on ? "border-accent-strong bg-primary/15 text-accent-soft" : "border-line bg-card"}`}
                    >
                      {d.day_order}. {d.name}
                      {up.plan?.nextDay?.id === d.id ? " · next" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <button type="button" className={btn.secondary} onClick={async () => { await setChoice({ mode: "fresh", seed: 0 }); setOptions(false); }}>
            Target fresh muscles
          </button>
          <button type="button" className={btn.secondary} onClick={() => { setOptions(false); setPickMuscles(true); }}>
            Pick muscles…
          </button>
          <button type="button" className={btn.secondary} onClick={() => { setOptions(false); setAiOpen(true); }}>
            <Sparkle /> Customize with AI…
          </button>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/workout" className={btn.secondary} onClick={() => setOptions(false)}>Build your own</Link>
            <Link href="/cardio" className={btn.secondary} onClick={() => setOptions(false)}>Log cardio</Link>
          </div>
          {!up.plan && (
            <Link href="/plan" className={btn.ghost} onClick={() => setOptions(false)}>Set up a plan →</Link>
          )}
        </div>
      </Sheet>

      {aiOpen && (
        <AiWorkoutSheet
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          kind="workout"
          title="Customize with AI"
          intro={`Tell Claude what you want today. It starts from "${up.title}" and only uses what ${gym?.name ?? "your gym"} has.`}
          current={{ name: up.title, items: up.items }}
          actions={[
            {
              label: "Use for today",
              primary: true,
              run: async (w) => {
                await setChoice({ mode: "ai", seed: 0, ai: { name: w.name, summary: w.summary, items: w.items, planDayId: up.day?.id ?? null } });
                setAiOpen(false);
              },
            },
            {
              label: "Start it now",
              run: async (w) => {
                await start({ items: w.items, name: w.name, gymId: gym?.id ?? null, planDayId: up.day?.id ?? null, source: "ai" });
                router.push("/workout");
              },
            },
          ]}
        />
      )}

      <Sheet open={pickMuscles} onClose={() => setPickMuscles(false)} title="Pick muscles">
        <MuscleChooser
          initial={up.mode === "muscles" ? up.targets : []}
          saveLabel="Build workout"
          onSave={async (ids) => {
            await setChoice({ mode: "muscles", muscles: ids, seed: 0 });
            setPickMuscles(false);
          }}
        />
      </Sheet>
    </>
  );
}

/** Fallback when there's nothing to suggest (e.g. a plan with no days). */
function StartCard({ hasGym }: { hasGym: boolean }) {
  return (
    <section className="flex flex-col gap-3 rounded-[28px] bg-primary p-5 text-white">
      <span className="text-xs font-bold tracking-[0.12em] text-[#DCE4FF]">UP NEXT</span>
      <h1 className="display text-[64px] leading-[0.85] font-extrabold tracking-[-0.02em]">Your call</h1>
      <p className="text-[15px] font-medium text-[#DCE4FF]">
        Build a workout from {hasGym ? "what your gym has" : "the exercise library"}, repeat a past one, or log cardio.
      </p>
      <div className="mt-1 flex items-start gap-2">
        <Link href="/workout" className="display flex h-[52px] flex-1 items-center justify-center gap-2.5 rounded-full bg-white text-xl font-extrabold tracking-[0.08em] text-primary">
          Build
        </Link>
        <Link href="/cardio" className="display flex h-[52px] items-center justify-center rounded-full border-2 border-white px-5 text-lg font-extrabold tracking-[0.08em]">
          Cardio
        </Link>
      </div>
    </section>
  );
}

const chipOutline =
  "display flex h-8 items-center rounded-full border-[1.5px] border-accent-strong/50 px-3 text-sm font-extrabold tracking-[0.04em] whitespace-nowrap text-accent";

function ChipButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="flex min-h-11 shrink-0 items-center">
      <span className={chipOutline}>{children}</span>
    </button>
  );
}

/** The minimized panel rests slid down so only its header (height h) shows above the tabs. */
function restingTransform(mode: SheetMode, h: number, dy = 0) {
  if (mode === "min") return `translateY(calc(100% - ${h}px + ${dy}px))`;
  return `translateY(${dy}px)`;
}

/** A CSS length (e.g. with env()) in pixels. */
function cssPx(length: string) {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;top:0;left:0;visibility:hidden;height:${length}`;
  document.body.appendChild(el);
  const h = el.offsetHeight;
  el.remove();
  return h;
}

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Drag = { id: number; x: number; y: number; dy: number; active: boolean; lastY: number; lastT: number; v: number; top0: number };

/**
 * The exercise sheet under the Up next card. Three positions:
 * - default: in the page right under the card. Scrolling moves the greeting, week strip and weigh-in away, the card
 *   pins at the top, and the sheet slides up over it until its header pins at the top (all native scrolling).
 * - min: only the header shows, above the tabs; the card shows readiness by muscle in the room it frees.
 * - max: the sheet covers the page from the top, with its own scrolling.
 * Drag anywhere on the header: the sheet follows your finger and settles at the nearest position (a flick carries
 * it further). Tap the handle to step min → default → max → default. Changes slide from where the sheet was (FLIP).
 */
function useExerciseSheet() {
  const [mode, setModeState] = useState<SheetMode>("default");
  const modeRef = useRef<SheetMode>("default");
  const sheetRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const headerEl = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const restRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(0);
  const flipFrom = useRef<number | null>(null);
  const toCardio = useRef(false);
  const drag = useRef<Drag | null>(null);
  const swallowClick = useRef(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const setMode = (next: SheetMode) => {
    if (next === modeRef.current) return;
    flipFrom.current = headerEl.current?.getBoundingClientRect().top ?? null;
    modeRef.current = next;
    setModeState(next);
  };
  const setModeLatest = useRef(setMode);
  useEffect(() => {
    setModeLatest.current = setMode;
  });

  // The header's height is the minimized bar's footprint.
  const headerRef = (el: HTMLDivElement | null) => {
    headerEl.current = el;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  };

  const scrollToCardio = useCallback(() => {
    const b = bodyRef.current;
    const r = restRef.current;
    if (!b || !r) return;
    const top = b.scrollTop + r.getBoundingClientRect().top - b.getBoundingClientRect().top - 12;
    b.scrollTo({ top: Math.max(0, top), behavior: reduced() ? "auto" : "smooth" });
  }, []);

  // Slide from the old spot to the new one.
  useLayoutEffect(() => {
    const from = flipFrom.current;
    flipFrom.current = null;
    const el = sheetRef.current;
    const h = headerEl.current;
    if (from === null || !el || !h || reduced()) return;
    const d = from - h.getBoundingClientRect().top;
    if (Math.abs(d) < 1) return;
    const hh = h.offsetHeight;
    el.animate([{ transform: restingTransform(mode, hh, d) }, { transform: restingTransform(mode, hh) }], {
      duration: 320,
      easing: "cubic-bezier(0.2, 0.85, 0.25, 1)",
    });
  }, [mode]);

  // Expanded: freeze the page behind, Escape shrinks it, and the Cardio button lands on the quick cardio tiles.
  useEffect(() => {
    if (mode !== "max") return;
    const html = document.documentElement;
    const prev = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setModeLatest.current("default");
    window.addEventListener("keydown", onKey);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (toCardio.current) {
      toCardio.current = false;
      t = setTimeout(() => scrollToCardio(), reduced() ? 0 : 340);
    }
    return () => {
      [html.style.overflow, document.body.style.overflow] = prev;
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [mode, scrollToCardio]);

  // Quick cardio scrolls Today to the top when a timer starts: get out of its way.
  useEffect(() => {
    const onTop = () => {
      if (modeRef.current !== "max") return;
      setModeLatest.current("default");
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" })));
    };
    window.addEventListener(TODAY_TOP_EVENT, onTop);
    return () => window.removeEventListener(TODAY_TOP_EVENT, onTop);
  }, []);

  const openCardio = () => {
    if (modeRef.current === "max") return scrollToCardio();
    toCardio.current = true;
    setMode("max");
  };

  /** Handle tap (and keyboard): min → default → max → default. */
  const cycle = () => {
    if (swallowClick.current) return;
    setMode(modeRef.current === "max" ? "default" : SHEET_UP[modeRef.current]);
  };

  /** Where the header's top would sit in each position, in viewport pixels. */
  const targets = (d: Drag) => {
    const max = cssPx("calc(env(safe-area-inset-top) + 8px)");
    const h = headerEl.current?.offsetHeight ?? 0;
    const min = window.innerHeight - cssPx("var(--nav-h)") - h;
    const card = cardRef.current?.getBoundingClientRect();
    const def = modeRef.current === "default" ? d.top0 : card ? card.bottom - TUCK : (max + min) / 2;
    return { max, default: Math.min(min, Math.max(max, def)), min };
  };

  const dragProps = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const top0 = headerEl.current?.getBoundingClientRect().top ?? 0;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dy: 0, active: false, lastY: e.clientY, lastT: performance.now(), v: 0, top0 };
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      const el = sheetRef.current;
      if (!d || !el || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.active) {
        // Sideways first (the chip row scrolls): not a sheet drag.
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          drag.current = null;
          return;
        }
        if (Math.abs(dy) < 6) return;
        d.active = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      const t = performance.now();
      d.v = (e.clientY - d.lastY) / Math.max(1, t - d.lastT);
      d.lastY = e.clientY;
      d.lastT = t;
      // Past the top it resists, so it can't be pulled off the screen.
      const lim = targets(d).max - d.top0;
      d.dy = dy < lim ? lim + (dy - lim) / 4 : dy;
      el.style.transform = restingTransform(modeRef.current, headerEl.current?.offsetHeight ?? 0, d.dy);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      drag.current = null;
      const el = sheetRef.current;
      if (!d || !el || !d.active || e.pointerId !== d.id) return;
      // The click that follows a drag shouldn't press a button under the finger.
      swallowClick.current = true;
      setTimeout(() => (swallowClick.current = false), 0);
      const cur = modeRef.current;
      const hh = headerEl.current?.offsetHeight ?? 0;
      const top = d.top0 + d.dy;
      const at = targets(d);
      // Nearest position to where a flick would carry it.
      const aim = top + Math.max(-600, Math.min(600, d.v * 220));
      const next = (Object.keys(at) as SheetMode[]).reduce((a, b) => (Math.abs(at[b] - aim) < Math.abs(at[a] - aim) ? b : a), cur);
      if (next !== cur) {
        setMode(next); // measures the header where it was let go, then slides on from there
        el.style.transform = next === "min" ? restingTransform("min", hh) : "";
        return;
      }
      // Same position: settle back where it was.
      el.style.transform = cur === "min" ? restingTransform("min", hh) : "";
      if (!reduced()) el.animate([{ transform: restingTransform(cur, hh, d.dy) }, { transform: restingTransform(cur, hh) }], { duration: 240, easing: "ease-out" });
    },
    onPointerCancel: () => {
      const d = drag.current;
      drag.current = null;
      const el = sheetRef.current;
      if (!d?.active || !el) return;
      const cur = modeRef.current;
      el.style.transform = cur === "min" ? restingTransform("min", headerEl.current?.offsetHeight ?? 0) : "";
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (!swallowClick.current) return;
      e.stopPropagation();
      e.preventDefault();
    },
  };

  return { mode, cardRef, sheetRef, headerRef, bodyRef, restRef, headerH, dragProps, cycle, openCardio };
}
