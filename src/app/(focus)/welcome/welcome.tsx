"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useData, useProfile } from "@/lib/db/provider";
import { useGymActions } from "@/lib/gyms";
import { useGeneratorInputs } from "@/lib/smart";
import { usePlanActions } from "@/lib/plans";
import { useUpNextChoice } from "@/lib/up-next";
import { buildPlanDays } from "@/lib/generator";
import { EXPERIENCE_LABELS, GOAL_LABELS } from "@/lib/profile";
import { CARDIO_PREF_LABELS, GOAL_BLURBS, recommendSplit, splitChoices } from "@/lib/onboarding";
import { TEMPLATE_LABELS } from "@/lib/defaults";
import { MusclePills } from "@/components/planned";
import { Chip, btn, field, label } from "@/components/ui/kit";
import type { CardioPref, Experience, Goal, GymTemplate, Units } from "@/lib/db/types";

/*
  Onboarding (plan doc → "Onboarding"): about you, goal + experience, schedule, cardio, your gym, and a
  starter plan from the split that fits. Each step saves as you go, so closing the app midway loses nothing.
*/

const STEPS = ["You", "Goal", "Schedule", "Cardio", "Gym", "Plan"] as const;

export function Welcome() {
  const router = useRouter();
  const { profile, save } = useProfile();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [units, setUnits] = useState<Units>("lb");
  const [goal, setGoal] = useState<Goal>("hypertrophy");
  const [experience, setExperience] = useState<Experience>("intermediate");
  const [days, setDays] = useState(4);
  const [minutes, setMinutes] = useState(60);
  const [cardio, setCardio] = useState<CardioPref>("auto");

  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start from what's already saved
    setName((n) => n || profile.display_name || "");
    setGoal(profile.goal);
    setExperience(profile.experience);
    setDays(profile.days_per_week);
    setMinutes(profile.session_minutes);
    setUnits(profile.units);
    setCardio(profile.cardio_pref ?? "auto");
    // Only on first load: later saves shouldn't reset what's being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const go = async (to: number) => {
    // Save what's been answered so far.
    await save({ display_name: name.trim() || null, units, goal, experience, days_per_week: days, session_minutes: minutes, cardio_pref: cardio });
    setStep(to);
    window.scrollTo(0, 0);
  };
  const finish = async () => {
    await save({ onboarded_at: new Date().toISOString() });
    router.replace("/");
  };

  return (
    <main className="safe-top safe-bottom flex min-h-dvh flex-col gap-5 px-5 pb-10">
      <div className="mt-4 flex items-center gap-2">
        {step > 0 ? (
          <button type="button" onClick={() => setStep(step - 1)} aria-label="Back" className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        ) : (
          <span className="h-11 w-2" />
        )}
        <div className="flex flex-1 items-center gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-line"}`} />
          ))}
        </div>
        <span className="w-11 shrink-0 text-right text-xs font-bold text-muted">{step + 1}/{STEPS.length}</span>
      </div>

      {step === 0 && (
        <form onSubmit={(e) => { e.preventDefault(); void go(1); }} className="flex flex-col gap-5">
          <Title a="Let's set" b="you up." />
          <p className="-mt-2 text-base font-medium text-muted">A few quick questions, then you&apos;ll have a plan built for your goal and your gym. You can change any of it later.</p>
          <label className="flex flex-col gap-2">
            <span className={label}>FIRST NAME</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required />
          </label>
          <div className="flex flex-col gap-2">
            <span className={label}>UNITS</span>
            <div className="grid grid-cols-2 gap-2">
              <Chip active={units === "lb"} onClick={() => setUnits("lb")}>Pounds · miles</Chip>
              <Chip active={units === "kg"} onClick={() => setUnits("kg")}>Kilograms · km</Chip>
            </div>
          </div>
          <Next />
        </form>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-5">
          <Title a="What's the" b="main goal?" />
          <div className="flex flex-col gap-2">
            {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
              <Option key={g} active={goal === g} onClick={() => setGoal(g)} name={GOAL_LABELS[g]} blurb={GOAL_BLURBS[g]} />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>EXPERIENCE</span>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(EXPERIENCE_LABELS) as Experience[]).map((x) => (
                <Chip key={x} active={experience === x} onClick={() => setExperience(x)}>{EXPERIENCE_LABELS[x]}</Chip>
              ))}
            </div>
            <p className="text-sm font-medium text-muted">
              {experience === "beginner" ? "Under a year of regular lifting. You'll get simpler exercises and fewer sets." : experience === "intermediate" ? "Lifting regularly for a year or more." : "Several years of serious training; every exercise is on the table."}
            </p>
          </div>
          <Next onClick={() => go(2)} />
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-5">
          <Title a="How much" b="time?" />
          <div className="flex flex-col gap-2">
            <span className={label}>DAYS PER WEEK</span>
            <div className="grid grid-cols-6 gap-1.5">
              {[2, 3, 4, 5, 6, 7].map((d) => (
                <Chip key={d} active={days === d} onClick={() => setDays(d)}>{d}</Chip>
              ))}
            </div>
            <p className="text-sm font-medium text-muted">Pick what you can keep up most weeks; it&apos;s your weekly goal on Progress.</p>
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>MINUTES PER SESSION</span>
            <div className="grid grid-cols-5 gap-1.5">
              {[30, 45, 60, 75, 90].map((m) => (
                <Chip key={m} active={minutes === m} onClick={() => setMinutes(m)}>{m}</Chip>
              ))}
            </div>
            <p className="text-sm font-medium text-muted">About {Math.max(3, Math.round((minutes - 5) / (goal === "strength" ? 11 : 8)))} exercises a session at this length.</p>
          </div>
          <Next onClick={() => go(3)} />
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-5">
          <Title a="And" b="cardio?" />
          <div className="flex flex-col gap-2">
            {(Object.keys(CARDIO_PREF_LABELS) as CardioPref[]).map((c) => (
              <Option key={c} active={cardio === c} onClick={() => setCardio(c)} name={CARDIO_PREF_LABELS[c].name} blurb={CARDIO_PREF_LABELS[c].blurb} />
            ))}
          </div>
          <Next onClick={() => go(4)} />
        </div>
      )}

      {step === 4 && <GymStep onDone={() => go(5)} />}

      {step === 5 && <PlanStep days={days} goal={goal} experience={experience} cardio={cardio} onDone={finish} />}
    </main>
  );
}

function Title({ a, b }: { a: string; b: string }) {
  return (
    <h1 className="display text-5xl leading-none font-extrabold">
      {a}
      <br />
      <span className="text-accent">{b}</span>
    </h1>
  );
}

function Next({ onClick, children = "Next", disabled }: { onClick?: () => void; children?: React.ReactNode; disabled?: boolean }) {
  return (
    <button type={onClick ? "button" : "submit"} onClick={onClick} disabled={disabled} className={`${btn.primary} mt-1`}>
      {children}
    </button>
  );
}

function Option({ active, onClick, name, blurb, badge, joined }: { active: boolean; onClick: () => void; name: string; blurb: string; badge?: string; joined?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-16 flex-col items-start justify-center gap-0.5 border-2 px-4 py-2.5 text-left ${joined ? "rounded-t-2xl border-b-0" : "rounded-2xl"} ${active ? "border-accent-strong bg-primary/15" : "border-line bg-card"}`}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className={`text-base font-bold ${active ? "text-accent-soft" : ""}`}>{name}</span>
        {badge && <span className="display shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-extrabold tracking-[0.08em] text-white">{badge}</span>}
      </span>
      <span className="text-sm font-medium text-muted">{blurb}</span>
    </button>
  );
}

function GymStep({ onDone }: { onDone: () => void }) {
  const { db } = useData();
  const { createGym } = useGymActions();
  const gyms = useLiveQuery(() => db.gyms.toArray(), [db]);
  const [gymName, setGymName] = useState("");
  const [template, setTemplate] = useState<GymTemplate>("commercial");
  const [busy, setBusy] = useState(false);
  const has = (gyms?.length ?? 0) > 0;
  return (
    <div className="flex flex-col gap-5">
      <Title a="Where do" b="you train?" />
      {has ? (
        <p className="-mt-2 text-base font-medium text-muted">
          You&apos;ve set up {gyms!.map((g) => g.name).join(", ")}. Add more gyms (home, work, hotel) any time under More → Gyms; the switcher at the top swaps exercises to fit.
        </p>
      ) : (
        <>
          <p className="-mt-2 text-base font-medium text-muted">Pick the closest match; workouts only use what&apos;s there. You can tick equipment on and off later and add more gyms any time.</p>
          <label className="flex flex-col gap-2">
            <span className={label}>GYM NAME</span>
            <input className={field} value={gymName} onChange={(e) => setGymName(e.target.value)} placeholder="Main gym, Home, Work…" />
          </label>
          <div className="flex flex-col gap-2">
            {(Object.keys(TEMPLATE_LABELS) as GymTemplate[]).map((t) => (
              <Option key={t} active={template === t} onClick={() => setTemplate(t)} name={TEMPLATE_LABELS[t].name} blurb={TEMPLATE_LABELS[t].blurb} />
            ))}
          </div>
        </>
      )}
      <Next
        disabled={busy || gyms === undefined}
        onClick={async () => {
          if (!has) {
            setBusy(true);
            await createGym(gymName || TEMPLATE_LABELS[template].name, template);
            setBusy(false);
          }
          onDone();
        }}
      >
        {busy ? "Setting up…" : has ? "Next" : "Create gym"}
      </Next>
    </div>
  );
}

function PlanStep({ days, goal, experience, cardio, onDone }: { days: number; goal: Goal; experience: Experience; cardio: CardioPref; onDone: () => Promise<void> }) {
  const { db } = useData();
  const inputs = useGeneratorInputs();
  const actions = usePlanActions();
  const { setChoice } = useUpNextChoice();
  const splits = useLiveQuery(() => db.splits.toArray(), [db]);
  const splitDays = useLiveQuery(() => db.split_days.toArray(), [db]);
  const recommended = recommendSplit(days, goal, experience, cardio);
  const choices = useMemo(() => splitChoices(splits ?? [], days, recommended), [splits, days, recommended]);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = choices.find((s) => s.id === (picked ?? recommended)) ?? choices[0];
  const daysOf = (id: string) => (splitDays ?? []).filter((d) => d.split_id === id).sort((a, b) => a.day_order - b.day_order);

  async function build() {
    const { catalog, profile, gymEquipment, prefs } = inputs;
    if (!chosen || !catalog || !profile) return;
    setBusy(true);
    const built = buildPlanDays(catalog, daysOf(chosen.id), {
      gymEquipment, goal, experience, sessionMinutes: profile.session_minutes, prefs, seed: 0, cardioPref: cardio,
    });
    await actions.create({ name: chosen.name, goal, splitId: chosen.id, weeks: 8, days: built });
    await setChoice({ mode: "plan", seed: 0 });
    await onDone();
  }

  return (
    <div className="flex flex-col gap-5">
      <Title a="Your" b="starter plan." />
      <p className="-mt-2 text-base font-medium text-muted">
        A split is how the week is divided up. For {days} {days === 1 ? "day" : "days"} a week, this is the one we&apos;d start with. Every day gets exercises picked for your gym; you can edit, regenerate or swap plans any time.
      </p>
      {choices.length === 0 || !inputs.catalog ? (
        <div className="h-48 animate-pulse rounded-3xl bg-card" />
      ) : (
        <div className="flex flex-col gap-2">
          {choices.map((s) => (
            <div key={s.id} className="flex flex-col">
              <Option
                active={chosen?.id === s.id}
                onClick={() => setPicked(s.id)}
                name={`${s.name} · ${s.days_per_week} days`}
                blurb={s.description}
                badge={s.id === recommended ? "Best fit" : undefined}
                joined={chosen?.id === s.id}
              />
              {chosen?.id === s.id && (
                <ol className="flex flex-col gap-2 rounded-b-2xl border-2 border-t-0 border-accent-strong bg-card px-4 pt-3 pb-3">
                  {daysOf(s.id).map((d) => (
                    <li key={d.id} className="flex flex-col gap-1">
                      <span className="text-sm font-bold"><span className="display num mr-2 text-muted">{d.day_order}</span>{d.name}</span>
                      <MusclePills catalog={inputs.catalog!} ids={d.target_muscle_ids} max={5} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
      <Next disabled={busy || !chosen || !inputs.ready} onClick={build}>{busy ? "Building your plan…" : "Build my plan"}</Next>
      <button type="button" disabled={busy} onClick={() => void onDone()} className={btn.ghost}>
        Skip: I&apos;ll pick workouts day by day
      </button>
    </div>
  );
}
