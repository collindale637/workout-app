"use client";

import Link from "next/link";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData, useProfile } from "@/lib/db/provider";
import { useCatalog } from "@/lib/hooks";
import { useActivePlan, usePlan, usePlans } from "@/lib/smart";
import { headline, headlineText } from "@/lib/plan-preview";
import { isCardioExercise } from "@/lib/cardio";
import { doseLabel } from "@/components/planned";
import { usePlanActions } from "@/lib/plans";
import { useUpNextChoice } from "@/lib/up-next";
import { GOAL_LABELS } from "@/lib/profile";
import { GymSwitcher } from "@/components/gym-switcher";
import { Card, Sheet, btn, field } from "@/components/ui/kit";
import { Sparkle } from "@/components/ai";
import { useAiJob } from "@/lib/ai/client";
import type { Plan } from "@/lib/db/types";

const Chevron = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="shrink-0 text-muted" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
);

export function PlanScreen() {
  const active = useActivePlan();
  const plans = usePlans();
  const catalog = useCatalog();
  const aiJob = useAiJob("new").job;
  const aiLine = aiJob?.status === "running" ? "Building your plan… tap to check" : aiJob?.status === "done" && aiJob.result?.ok ? "Your AI plan is ready. Tap to review" : null;
  if (active === undefined || !plans || !catalog) return null;
  const past = plans.filter((p) => !p.is_active);

  return (
    <main className="mt-4 flex flex-col gap-5">
      <header className="flex h-11 items-center justify-between gap-3">
        <h1 className="display text-4xl font-extrabold">Plan</h1>
        <GymSwitcher />
      </header>

      {active ? <ActivePlanCard /> : <NoPlan />}

      <section className="flex flex-col gap-2">
        <h2 className="display text-xl font-extrabold">With AI</h2>
        <Card className="divide-y divide-line overflow-hidden">
          <Link href="/plan/ai" className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-card-2">
            <Sparkle size={22} className="shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-base font-bold">Build with AI</span>
              <span className={`text-sm font-medium ${aiLine ? "text-accent" : "text-muted"}`}>{aiLine ?? "Describe what you want, get a full plan for your gym"}</span>
            </span>
            <Chevron />
          </Link>
          <Link href="/plan/import" className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-card-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-teal" aria-hidden="true">
              <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </svg>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-base font-bold">Import a plan</span>
              <span className="text-sm font-medium text-muted">From pasted text, screenshots or photos</span>
            </span>
            <Chevron />
          </Link>
        </Card>
      </section>

      <SplitLibrary hasActive={Boolean(active)} />


      {past.length > 0 && <PastPlans plans={past} />}
    </main>
  );
}

function NoPlan() {
  const { profile } = useProfile();
  return (
    <section className="flex flex-col gap-2 rounded-[28px] bg-primary p-5 text-white">
      <span className="text-xs font-bold tracking-[0.12em] text-[#DCE4FF]">NO PLAN YET</span>
      <h2 className="display text-[44px] leading-[0.9] font-extrabold">Pick a split</h2>
      <p className="text-[15px] font-medium text-[#DCE4FF]">
        Choose how you want to split your week below. The app fills every day with exercises for your gym, sized for{" "}
        {profile?.session_minutes ?? 60}-minute sessions. You can change anything after.
      </p>
    </section>
  );
}

function ActivePlanCard() {
  const plan = useActivePlan();
  const catalog = useCatalog();
  const { db } = useData();
  const { setChoice } = useUpNextChoice();
  const actions = usePlanActions();
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState<string | null>(null);
  const splitName = useLiveQuery(async () => (plan?.plan.split_id ? (await db.splits.get(plan.plan.split_id))?.name : null), [db, plan?.plan.split_id]);
  if (!plan || !catalog) return null;
  const { plan: p, days, exercises, nextDay, week } = plan;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-[28px] bg-primary p-5 text-white">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold tracking-[0.12em] text-[#DCE4FF]">ACTIVE PLAN</span>
          <button type="button" onClick={() => setMenu(true)} aria-label="Plan options" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01" /></svg>
          </button>
        </div>
        <h2 className="display text-[44px] leading-[0.9] font-extrabold">{p.name}</h2>
        <p className="text-[15px] font-semibold text-[#DCE4FF]">
          Week {p.weeks ? `${Math.min(week, p.weeks)} of ${p.weeks}` : week}
          {splitName && splitName !== p.name ? ` · ${splitName}` : ""}
          {p.goal ? ` · ${GOAL_LABELS[p.goal]}` : ""}
        </p>
        {p.weeks && week > p.weeks && (
          <p className="rounded-2xl bg-white/15 px-3 py-2 text-sm font-semibold">This plan has run its {p.weeks} weeks. Keep going, or build a fresh one below.</p>
        )}
      </div>

      {p.notes && (
        <details className="rounded-3xl border border-line bg-card px-4 py-1">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-base font-bold">
            About this plan
            <span className="text-xs font-bold tracking-[0.08em] text-muted">{p.source === "imported" ? "IMPORTED" : p.source === "ai" ? "BUILT WITH AI" : ""}</span>
          </summary>
          <p className="pb-3 text-[15px] font-medium leading-snug whitespace-pre-line text-muted">{p.notes}</p>
        </details>
      )}

      <ul className="flex flex-col gap-2">
        {days.map((d) => {
          const list = exercises.get(d.id) ?? [];
          const isNext = nextDay?.id === d.id;
          return (
            <li key={d.id}>
              <Link
                href={`/plan/day?id=${d.id}`}
                className={`flex min-h-20 items-center gap-3 rounded-3xl border-2 px-4 py-3 ${isNext ? "border-accent-strong bg-primary/10" : "border-line bg-card"}`}
              >
                <span className={`display num flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-extrabold ${isNext ? "bg-primary text-white" : "bg-card-2 text-muted"}`}>
                  {d.day_order}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="display truncate text-xl font-extrabold">{d.name}</span>
                    {isNext && <span className="display shrink-0 text-xs font-extrabold tracking-[0.1em] text-accent">UP NEXT</span>}
                  </div>
                  <span className="truncate text-sm font-medium text-muted">
                    {headlineText(headline(list, { isCardio: (id) => isCardioExercise(catalog.byId.get(id)), nameOf: (id) => catalog.byId.get(id)?.name ?? id })) || "No exercises yet"}
                  </span>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="shrink-0 text-muted" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </Link>
            </li>
          );
        })}
      </ul>

      <Link href={`/plan/ai?edit=${p.id}`} className={btn.secondary}>
        <Sparkle /> Change this plan with AI
      </Link>

      <Sheet open={menu} onClose={() => setMenu(false)} title={p.name}>
        <div className="flex flex-col gap-2">
          <Link href={`/plan/ai?edit=${p.id}`} className={btn.secondary} onClick={() => setMenu(false)}>
            <Sparkle /> Change with AI
          </Link>
          <button type="button" className={btn.secondary} onClick={() => { setRename(p.name); setMenu(false); }}>Rename</button>
          {days.length > 1 && (
            <div className="flex flex-col gap-2 rounded-2xl bg-card-2 p-3">
              <span className="text-sm font-bold text-muted">Train a different day next</span>
              <div className="flex flex-wrap gap-2">
                {days.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="min-h-11 rounded-2xl border-2 border-line bg-card px-3 text-sm font-bold"
                    onClick={async () => {
                      await setChoice({ mode: "plan", dayId: d.id, seed: 0 });
                      setMenu(false);
                    }}
                  >
                    {d.day_order}. {d.name}
                  </button>
                ))}
              </div>
              <span className="text-xs font-medium text-muted">Changes today&apos;s Up next on the Today tab.</span>
            </div>
          )}
          <button type="button" className={btn.secondary} onClick={async () => { await actions.setActive(p.id, false); setMenu(false); }}>
            End plan (keep it in past plans)
          </button>
          <button
            type="button"
            className={btn.danger}
            onClick={async () => {
              if (!confirm(`Delete "${p.name}"? Workouts you've logged from it stay in your history.`)) return;
              await actions.remove(p.id);
              setMenu(false);
            }}
          >
            Delete plan
          </button>
        </div>
      </Sheet>

      <Sheet open={rename !== null} onClose={() => setRename(null)} title="Rename plan">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (rename?.trim()) await actions.updatePlan(p.id, { name: rename.trim() });
            setRename(null);
          }}
        >
          <input className={field} value={rename ?? ""} onChange={(e) => setRename(e.target.value)} autoFocus />
          <button type="submit" className={btn.primary}>Save</button>
        </form>
      </Sheet>
    </section>
  );
}

function SplitLibrary({ hasActive }: { hasActive: boolean }) {
  const { db } = useData();
  const { profile } = useProfile();
  const catalog = useCatalog();
  const splits = useLiveQuery(async () => {
    const [s, d] = await Promise.all([db.splits.orderBy("id").toArray(), db.split_days.toArray()]);
    return s.sort((a, b) => a.sort_order - b.sort_order).map((x) => ({ ...x, days: d.filter((y) => y.split_id === x.id).sort((a, b) => a.day_order - b.day_order) }));
  }, [db]);
  const [showAll, setShowAll] = useState(false);
  if (!splits || !catalog) return null;
  if (!splits.length) {
    return <p className="text-sm font-medium text-muted">The split library downloads with the exercise library. Connect once to get it.</p>;
  }
  const want = profile?.days_per_week ?? 4;
  const fits = (n: number) => Math.abs(n - want) <= 1;
  const shown = showAll ? splits : splits.filter((s) => fits(s.days_per_week));

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="display text-xl font-extrabold">{hasActive ? "Start a new plan" : "Split library"}</h2>
        <button type="button" className={btn.ghost} onClick={() => setShowAll(!showAll)}>
          {showAll ? `Around ${want} days` : "Show all"}
        </button>
      </div>
      {!showAll && <p className="-mt-1 text-sm font-medium text-muted">Splits that fit about {want} days a week.</p>}
      <ul className="flex flex-col gap-2">
        {shown.map((s) => (
          <li key={s.id}>
            <Link href={`/plan/new?split=${s.id}`} className="flex flex-col gap-2 rounded-3xl border border-line bg-card px-4 py-3 active:bg-card-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="display text-xl font-extrabold">{s.name}</span>
                <span className={`display shrink-0 text-sm font-extrabold tracking-[0.06em] ${s.days_per_week === want ? "text-accent" : "text-muted"}`}>
                  {s.days_per_week} DAYS
                </span>
              </div>
              <span className="text-sm font-medium text-muted">{s.description}</span>
              <span className="text-xs font-bold tracking-[0.04em] text-accent-soft">{[...new Set(s.days.map((d) => d.name))].join(" · ")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PastPlans({ plans }: { plans: Plan[] }) {
  const actions = usePlanActions();
  const [open, setOpen] = useState<Plan | null>(null);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="display text-xl font-extrabold">Past plans</h2>
      <Card className="divide-y divide-line overflow-hidden">
        {plans.map((p) => (
          <button key={p.id} type="button" onClick={() => setOpen(p)} className="flex min-h-16 w-full flex-col justify-center px-4 py-3 text-left active:bg-card-2">
            <span className="text-base font-bold">{p.name}</span>
            <span className="text-sm font-medium text-muted">
              Started {p.start_date ? new Date(`${p.start_date}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "—"}
              {p.goal ? ` · ${GOAL_LABELS[p.goal]}` : ""}
            </span>
          </button>
        ))}
      </Card>
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open?.name}>
        {open && (
          <div className="flex flex-col gap-2">
            <PastPlanView planId={open.id} />
            <button type="button" className={btn.primary} onClick={async () => { await actions.setActive(open.id, true); setOpen(null); }}>
              Make it my active plan
            </button>
            <button
              type="button"
              className={btn.danger}
              onClick={async () => {
                if (!confirm(`Delete "${open.name}"?`)) return;
                await actions.remove(open.id);
                setOpen(null);
              }}
            >
              Delete
            </button>
          </div>
        )}
      </Sheet>
    </section>
  );
}

/** Read-only look at a past plan: each day and its exercises with their doses. */
function PastPlanView({ planId }: { planId: string }) {
  const plan = usePlan(planId);
  const catalog = useCatalog();
  if (!plan || !catalog) return null;
  return (
    <div className="flex max-h-[45dvh] flex-col gap-3 overflow-y-auto pb-1">
      {plan.days.map((d) => (
        <div key={d.id} className="flex flex-col gap-1">
          <h3 className="display text-lg font-extrabold">{d.name}</h3>
          <ul className="flex flex-col">
            {(plan.exercises.get(d.id) ?? []).map((it) => (
              <li key={it.id} className="flex items-baseline justify-between gap-3 py-0.5">
                <span className="truncate text-[15px] font-semibold">{catalog.byId.get(it.exercise_id)?.name ?? it.exercise_id}</span>
                <span className="display num shrink-0 text-[15px] font-bold text-muted">{doseLabel(catalog, it)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
