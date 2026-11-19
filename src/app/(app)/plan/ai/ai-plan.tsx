"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useData } from "@/lib/db/provider";
import { useGeneratorInputs, usePlan } from "@/lib/smart";
import { usePlanActions } from "@/lib/plans";
import { useUpNextChoice } from "@/lib/up-next";
import { GOAL_LABELS } from "@/lib/profile";
import { aiProfile, allowedAtGym, gymContext, historyLines, recoveryRecord, startAiJob, useAiJob, useAiUsage } from "@/lib/ai/client";
import { draftSnapshot, planNotes, targetsFor } from "@/lib/ai/apply";
import { AiItems, AiProblem, AiThinking, AiUsageNote, Sparkle } from "@/components/ai";
import { MusclePills } from "@/components/planned";
import { Chip, PageHeader, StickyBar, btn, field, label } from "@/components/ui/kit";
import type { AiPlan, PlanSnapshot } from "@/lib/ai/types";
import type { Goal } from "@/lib/db/types";

const WEEKS = [4, 6, 8, 12];
const DAYS = [2, 3, 4, 5, 6];
const MINUTES = [30, 45, 60, 75, 90];
const BUILD_IDEAS = ["Bigger arms", "Bad left knee", "Training for a 10K too", "Include the big three lifts", "Lots of supersets", "Mostly machines"];
const EDIT_IDEAS = ["Make day 2 shorter", "Swap squats for something knee-friendly", "Add a fourth day", "More arm work", "Add cardio to every day"];

type Draft = { plan: AiPlan; warnings: string[] };

/** Build a full plan with AI (/plan/ai), or change the active plan in plain English (/plan/ai?edit=<plan id>). */
export function AiPlanScreen() {
  const editId = useSearchParams().get("edit");
  const router = useRouter();
  const { db } = useData();
  const inputs = useGeneratorInputs();
  const existing = usePlan(editId ?? "__none__");
  const actions = usePlanActions();
  const { setChoice } = useUpNextChoice();
  const { usage, setUsage } = useAiUsage();

  const [text, setText] = useState("");
  const [goal, setGoal] = useState<Goal | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [weeks, setWeeks] = useState(8);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The build runs on the server, so leaving this screen doesn't lose it: the draft is picked up from there.
  const job = useAiJob(editId ?? "new");
  const result = job.job?.status === "done" ? job.job.result : null;
  const draft: Draft | null = result && result.ok && (result.kind === "plan" || result.kind === "edit") ? { plan: result.plan, warnings: result.warnings } : null;
  const jobResult = job.job?.status === "failed" ? job.job.result : null;
  const shownError = error ?? (jobResult && !jobResult.ok ? jobResult.error : null);
  const busy = starting || job.job?.status === "running";
  const [name, setName] = useState<string | null>(null);
  const [more, setMore] = useState("");
  const [saving, setSaving] = useState(false);

  const { catalog, profile, gym, gymEquipment, prefs, recovery } = inputs;
  const editing = Boolean(editId);
  if (!inputs.ready || !catalog || !profile || (editing && existing === undefined)) return null;
  if (editing && !existing) {
    return (
      <main className="flex flex-col gap-4">
        <PageHeader title="Plan not found" back="/plan" />
      </main>
    );
  }

  const chosen = { goal: goal ?? profile.goal, days: days ?? profile.days_per_week, minutes: minutes ?? profile.session_minutes };
  const original: PlanSnapshot | null = existing
    ? {
        name: existing.plan.name,
        goal: existing.plan.goal ?? profile.goal,
        weeks: existing.plan.weeks ?? 8,
        notes: existing.plan.notes ?? null,
        days: existing.days.map((d) => ({ id: d.id, name: d.name, items: existing.exercises.get(d.id) ?? [] })),
      }
    : null;

  /** First ask: a new plan, or an edit of the saved one. Follow-ups edit the draft on screen. */
  async function ask(followUp: boolean) {
    if (!catalog || !profile) return;
    setStarting(true);
    setError(null);
    const base = original && !followUp ? original : draft ? snapshotOf(draft.plan) : null;
    const include = base?.days.flatMap((d) => d.items.map((i) => i.exercise_id)) ?? [];
    const res = await startAiJob({
      kind: base ? "edit" : "plan",
      prompt: followUp ? more : text,
      profile: { ...aiProfile(profile), session_minutes: chosen.minutes },
      gym: gymContext(catalog, gym, gymEquipment),
      exercises: allowedAtGym(catalog, gymEquipment, prefs, include),
      options: base ? undefined : { goal: chosen.goal, days_per_week: chosen.days, weeks, session_minutes: chosen.minutes },
      recovery: recoveryRecord(recovery?.map),
      history: await historyLines(db, catalog, profile.units),
      plan: base ?? undefined,
      jobRef: editId ?? null,
    });
    if (!res.ok && res.usage) setUsage(res.usage);
    if (!res.ok) {
      setStarting(false);
      return setError(res.error);
    }
    await job.refresh();
    setStarting(false);
    setName(null);
    setMore("");
    window.scrollTo({ top: 0 });
  }

  /** In edit mode, keep pointing at the saved days so history stays linked. */
  function snapshotOf(p: AiPlan): PlanSnapshot {
    const snap = draftSnapshot(p);
    return { ...snap, days: snap.days.map((d, i) => ({ ...d, id: p.days[i].ref_day_id ?? d.id })) };
  }

  async function accept() {
    if (!draft || !catalog) return;
    setSaving(true);
    const p = draft.plan;
    const planName = (name ?? p.name).trim() || p.name;
    const dayRows = p.days.map((d) => ({ ref_day_id: d.ref_day_id, name: d.name, target_muscle_ids: targetsFor(catalog, d.items), items: d.items }));
    if (existing) {
      await actions.applyEdit(existing.plan.id, { name: planName, goal: p.goal, weeks: p.weeks, notes: planNotes(p) ?? existing.plan.notes ?? null, days: dayRows }, existing.days[0]?.week ?? 1);
    } else {
      await actions.create({ name: planName, goal: p.goal, splitId: null, weeks: p.weeks, source: "ai", notes: planNotes(p), days: dayRows });
      await setChoice({ mode: "plan", seed: 0 });
    }
    await job.clear();
    router.replace("/plan");
  }

  const title = editing ? "Change with AI" : "Build with AI";

  if (busy) {
    return (
      <main className="flex flex-col gap-4">
        <PageHeader title={title} />
        <AiThinking what={draft || editing ? "Making the changes" : "Building your plan"} />
        <p className="text-center text-sm font-medium text-muted">Plans take up to a minute. You can leave: it keeps building and your draft will be here when you come back.</p>
      </main>
    );
  }

  if (draft) {
    const p = draft.plan;
    const oldDay = new Map(original?.days.map((d) => [d.id, new Set(d.items.map((i) => i.exercise_id))]) ?? []);
    return (
      <main className="flex flex-col gap-4 pb-24">
        <PageHeader title={editing ? "Proposed changes" : "Your AI plan"} back={editing ? "/plan" : undefined} />
        {draft.warnings.map((w) => <AiProblem key={w}>{w}</AiProblem>)}

        <label className="flex flex-col gap-2">
          <span className={label}>PLAN NAME</span>
          <input className={field} value={name ?? p.name} onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="-mt-1 text-sm font-semibold text-muted">
          {GOAL_LABELS[p.goal]} · {p.days.length} day{p.days.length === 1 ? "" : "s"} a week · {p.weeks} weeks{gym ? ` · for ${gym.name}` : ""}
        </p>
        {p.summary && <p className="text-[15px] font-medium leading-snug">{p.summary}</p>}

        {p.changes.length > 0 && (
          <section className="flex flex-col gap-1.5 rounded-3xl border-2 border-accent-strong/50 bg-primary/10 p-4">
            <span className={label}>WHAT CHANGED</span>
            <ul className="flex flex-col gap-1">
              {p.changes.map((c) => <li key={c} className="text-[15px] font-semibold">• {c}</li>)}
            </ul>
          </section>
        )}

        {p.days.map((d, i) => {
          const before = d.ref_day_id ? oldDay.get(d.ref_day_id) : undefined;
          const added = editing ? new Set(d.items.map((x) => x.exercise_id).filter((x) => !before?.has(x))) : undefined;
          return (
            <section key={i} className="flex flex-col gap-2 rounded-3xl border border-line bg-card p-4">
              <div className="flex items-baseline gap-2">
                <span className="display num text-lg font-extrabold text-muted">{i + 1}</span>
                <h2 className="display text-xl font-extrabold">{d.name}</h2>
                {editing && !d.ref_day_id && <span className="display text-xs font-extrabold tracking-[0.1em] text-accent">NEW DAY</span>}
              </div>
              <MusclePills catalog={catalog} ids={targetsFor(catalog, d.items)} max={8} />
              <AiItems catalog={catalog} items={d.items} highlight={added} />
            </section>
          );
        })}
        {editing && original && original.days.some((d) => !p.days.some((x) => x.ref_day_id === d.id)) && (
          <AiProblem>
            Removes {original.days.filter((d) => !p.days.some((x) => x.ref_day_id === d.id)).map((d) => `"${d.name}"`).join(", ")}. Workouts you&apos;ve logged
            from it stay in your history.
          </AiProblem>
        )}

        {p.progression && (
          <section className="flex flex-col gap-1.5 rounded-3xl bg-card-2 p-4">
            <span className={label}>HOW IT PROGRESSES</span>
            <p className="text-[15px] font-medium leading-snug">{p.progression}</p>
            <p className="text-xs font-semibold text-muted">The app also suggests your weights each session from what you lifted last time.</p>
          </section>
        )}

        <StickyBar aboveNav>
          <button type="button" className={`${btn.primary} w-full`} disabled={saving} onClick={accept}>
            {saving ? "Saving…" : editing ? "Save changes" : "Use this plan"}
          </button>
        </StickyBar>
        {!editing && <p className="text-center text-sm font-medium text-muted">It becomes your active plan. You can edit any day after.</p>}

        <section className="flex flex-col gap-2 rounded-3xl border border-line bg-card p-4">
          <span className={label}>WANT SOMETHING DIFFERENT?</span>
          <textarea
            className={`${field} h-24 resize-none py-3 leading-snug`}
            placeholder="e.g. swap the leg press for lunges, and make every day 45 minutes"
            value={more}
            onChange={(e) => setMore(e.target.value)}
            maxLength={1500}
          />
          {shownError && <AiProblem>{shownError}</AiProblem>}
          <button type="button" className={btn.secondary} disabled={!more.trim()} onClick={() => ask(true)}>
            <Sparkle /> Ask for changes
          </button>
        </section>
        <button type="button" className={btn.ghost} onClick={() => { setError(null); void job.clear(); }}>
          Discard and start over
        </button>
        <AiUsageNote usage={(result && result.ok ? result.usage : null) ?? usage} />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 pb-6">
      <PageHeader title={title} back="/plan" />
      {editing && existing ? (
        <>
          <p className="-mt-2 text-base font-medium text-muted">
            Tell Claude what to change in <span className="font-bold text-ink">{existing.plan.name}</span>. You&apos;ll see the changes before anything is saved.
          </p>
          <ul className="flex flex-col gap-1 rounded-3xl border border-line bg-card px-4 py-3">
            {existing.days.map((d) => (
              <li key={d.id} className="flex items-baseline justify-between gap-2 py-0.5">
                <span className="truncate text-base font-bold">{d.day_order}. {d.name}</span>
                <span className="shrink-0 text-sm font-semibold text-muted">{(existing.exercises.get(d.id) ?? []).length} exercises</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="-mt-2 text-base font-medium text-muted">
          Describe what you want and Claude builds a full plan from what {gym ? gym.name : "the exercise library"} has. You review it before it&apos;s saved.
        </p>
      )}

      <label className="flex flex-col gap-2">
        <span className={label}>{editing ? "WHAT SHOULD CHANGE?" : "WHAT DO YOU WANT?"}</span>
        <textarea
          className={`${field} h-32 resize-none py-3 leading-snug`}
          placeholder={editing ? "e.g. make Thursday shorter and swap squats for something knee-friendly" : "e.g. I want bigger arms and shoulders, my left knee is cranky, and I like supersets"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1500}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {(editing ? EDIT_IDEAS : BUILD_IDEAS).map((idea) => (
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

      {!editing && (
        <>
          <div className="flex flex-col gap-2">
            <span className={label}>GOAL</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
                <Chip key={g} active={chosen.goal === g} onClick={() => setGoal(g)}>{GOAL_LABELS[g]}</Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>DAYS A WEEK</span>
            <div className="flex gap-2">
              {DAYS.map((n) => <Chip key={n} active={chosen.days === n} onClick={() => setDays(n)} className="flex-1">{n}</Chip>)}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>SESSION LENGTH (MINUTES)</span>
            <div className="flex gap-2">
              {MINUTES.map((n) => <Chip key={n} active={chosen.minutes === n} onClick={() => setMinutes(n)} className="flex-1">{n}</Chip>)}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>LENGTH</span>
            <div className="flex gap-2">
              {WEEKS.map((w) => <Chip key={w} active={weeks === w} onClick={() => setWeeks(w)} className="flex-1">{w} wk</Chip>)}
            </div>
          </div>
          <p className="text-sm font-medium text-muted">
            {gym ? `Uses only what ${gym.name} has. At another gym, anything it can't do swaps for the closest match.` : "No gym set up yet, so any equipment is fair game."}
          </p>
        </>
      )}

      {shownError && <AiProblem>{shownError}</AiProblem>}
      <button type="button" className={btn.primary} disabled={editing && !text.trim()} onClick={() => ask(false)}>
        <Sparkle onCobalt /> {editing ? "Propose changes" : "Build my plan"}
      </button>
      <AiUsageNote usage={(result && result.ok ? result.usage : null) ?? usage} />
    </main>
  );
}
