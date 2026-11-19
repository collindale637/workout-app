"use client";

import { useEffect, useState } from "react";
import { useData } from "@/lib/db/provider";
import { useGeneratorInputs } from "@/lib/smart";
import { aiProfile, allowedAtGym, askAI, gymContext, historyLines, recoveryRecord, usageLine, useAiUsage } from "@/lib/ai/client";
import { formatDuration } from "@/lib/units";
import { doseLabel, supersetLetter } from "@/components/planned";
import { Sheet, btn, field } from "@/components/ui/kit";
import type { Catalog } from "@/lib/hooks";
import type { AiItem, AiUsage, AiWorkout } from "@/lib/ai/types";

/** The little four-point sparkle used on every AI button. Always violet; `onCobalt` is for cobalt fills (primary buttons), where the page-colored violet would vanish in light mode. `white` is for the Up next card, where violet did not read (Collin, Nov 19). */
export function Sparkle({ size = 18, className = "", onCobalt = false, white = false }: { size?: number; className?: string; onCobalt?: boolean; white?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className} style={{ color: white ? "#fff" : onCobalt ? "var(--ai-bright)" : "var(--ai)" }}>
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" opacity=".7" />
    </svg>
  );
}

/** Exercises with their dose, notes and superset letters. */
export function AiItems({ catalog, items, highlight, hideRest }: { catalog: Catalog; items: AiItem[]; highlight?: Set<string>; hideRest?: boolean }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {items.map((it, i) => {
        const cardio = catalog.byId.get(it.exercise_id)?.category === "cardio";
        return (
          <li key={`${it.exercise_id}-${i}`} className="flex flex-col gap-0.5 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className={`min-w-0 truncate text-base font-bold ${highlight?.has(it.exercise_id) ? "text-accent-soft" : ""}`}>
                {it.superset_group !== null && <span className="mr-1.5 text-accent">{supersetLetter(it.superset_group)}</span>}
                {catalog.byId.get(it.exercise_id)?.name ?? it.exercise_id}
              </span>
              <span className="display num shrink-0 text-base font-bold text-muted">
                {cardio ? (it.notes?.split(" · ")[0] ?? "Cardio") : doseLabel(catalog, it)}
                {!cardio && !hideRest && it.rest_sec ? <span className="text-sm font-semibold"> · {formatDuration(it.rest_sec)}</span> : null}
              </span>
            </div>
            {(cardio ? it.notes?.split(" · ").slice(1).join(" · ") : it.notes) && (
              <span className="text-sm font-medium text-muted">{cardio ? it.notes!.split(" · ").slice(1).join(" · ") : it.notes}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const WAITING = ["Reading your setup…", "Checking what your gym has…", "Picking exercises…", "Dosing sets and reps…", "Double-checking everything…"];

/** Shown while Claude works (plans can take a minute). */
export function AiThinking({ what = "Building" }: { what?: string }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-line bg-card px-5 py-8 text-center" role="status" aria-live="polite">
      <Sparkle size={34} className="animate-pulse text-accent" />
      <span className="display text-2xl font-extrabold">{what}…</span>
      <span className="text-sm font-semibold text-muted">{WAITING[Math.min(WAITING.length - 1, Math.floor(t / 6))]}</span>
      <span className="display num text-sm font-bold text-muted">{t}s</span>
    </div>
  );
}

export function AiProblem({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border-2 border-warn/40 bg-warn/10 px-4 py-3 text-sm font-semibold text-ink">{children}</p>;
}

export function AiUsageNote({ usage }: { usage: AiUsage | null }) {
  const line = usageLine(usage);
  return line ? <p className="text-center text-xs font-semibold text-muted">{line}</p> : null;
}

export type WorkoutAction = { label: string; primary?: boolean; run: (w: AiWorkout) => Promise<void> | void };

const WORKOUT_IDEAS = ["30 minutes", "Go easy, I'm sore", "No barbell", "Finish with core", "Add 20 min cardio", "Something new"];

/**
 * "Customize with AI" for one workout (Today) or one plan day (day editor): type what you want, see what
 * Claude suggests, then use it. Nothing changes until you tap an action.
 */
export function AiWorkoutSheet({
  open, onClose, kind, current, title, actions, intro,
}: {
  open: boolean;
  onClose: () => void;
  kind: "workout" | "day";
  current: { name: string; items: AiItem[] } | null;
  title: string;
  intro: string;
  actions: WorkoutAction[];
}) {
  const { db } = useData();
  const inputs = useGeneratorInputs();
  const { usage, setUsage } = useAiUsage();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ workout: AiWorkout; warnings: string[] } | null>(null);
  const [acting, setActing] = useState(false);

  const close = () => {
    if (busy) return;
    setResult(null);
    setError(null);
    onClose();
  };

  async function ask() {
    const { catalog, profile, gym, gymEquipment, prefs, recovery } = inputs;
    if (!catalog || !profile) return;
    setBusy(true);
    setError(null);
    const res = await askAI({
      kind,
      prompt: text,
      profile: aiProfile(profile),
      gym: gymContext(catalog, gym, gymEquipment),
      exercises: allowedAtGym(catalog, gymEquipment, prefs, current?.items.map((i) => i.exercise_id) ?? []),
      recovery: recoveryRecord(recovery?.map),
      history: await historyLines(db, catalog, profile.units),
      current: current ?? undefined,
    });
    setBusy(false);
    if (res.usage) setUsage(res.usage);
    if (!res.ok) return setError(res.error);
    if (res.kind === "workout" || res.kind === "day") setResult({ workout: res.workout, warnings: res.warnings });
  }

  const catalog = inputs.catalog;
  return (
    <Sheet open={open} onClose={close} title={result ? result.workout.name : title}>
      {!catalog ? null : busy ? (
        <AiThinking what="Building your workout" />
      ) : result ? (
        <div className="flex flex-col gap-3">
          {result.workout.summary && <p className="text-[15px] font-medium text-muted">{result.workout.summary}</p>}
          {result.warnings.map((w) => <AiProblem key={w}>{w}</AiProblem>)}
          <AiItems catalog={catalog} items={result.workout.items} />
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={acting}
              className={a.primary ? btn.primary : btn.secondary}
              onClick={async () => {
                setActing(true);
                await a.run(result.workout);
                setActing(false);
                setResult(null);
                setText("");
              }}
            >
              {a.label}
            </button>
          ))}
          <button type="button" className={btn.ghost} disabled={acting} onClick={() => setResult(null)}>← Change the request</button>
          <AiUsageNote usage={usage} />
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <p className="-mt-1 text-[15px] font-medium text-muted">{intro}</p>
          <textarea
            className={`${field} h-28 resize-none py-3 leading-snug`}
            placeholder={kind === "day" ? "e.g. swap squats for something knee-friendly, and add more glutes" : "e.g. 30 minutes, hotel gym, no jumping, finish with core"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1500}
          />
          <div className="flex flex-wrap gap-2">
            {WORKOUT_IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                className="min-h-11 rounded-2xl border-2 border-line bg-card-2 px-3 text-sm font-bold text-muted"
                onClick={() => setText((t) => (t.trim() ? `${t.trim().replace(/[.,]$/, "")}, ${idea.toLowerCase()}` : idea))}
              >
                + {idea}
              </button>
            ))}
          </div>
          {error && <AiProblem>{error}</AiProblem>}
          <button type="submit" className={btn.primary} disabled={!text.trim() || !inputs.ready}>
            <Sparkle /> Ask Claude
          </button>
          <AiUsageNote usage={usage} />
        </form>
      )}
    </Sheet>
  );
}
