"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/db/provider";
import { useGymActions } from "@/lib/gyms";
import { EXPERIENCE_LABELS, GOAL_LABELS } from "@/lib/profile";
import { TEMPLATE_LABELS } from "@/lib/defaults";
import { Chip, btn, field, label } from "@/components/ui/kit";
import type { Experience, Goal, GymTemplate, Units } from "@/lib/db/types";

/** Minimal onboarding: a few questions, then your first gym. */
export function Welcome() {
  const router = useRouter();
  const { profile, save } = useProfile();
  const { createGym } = useGymActions();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState<Goal>("hypertrophy");
  const [experience, setExperience] = useState<Experience>("intermediate");
  const [days, setDays] = useState(4);
  const [minutes, setMinutes] = useState(60);
  const [units, setUnits] = useState<Units>("lb");
  const [gymName, setGymName] = useState("");
  const [template, setTemplate] = useState<GymTemplate>("commercial");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start from what's already saved
    setName((n) => n || profile.display_name || "");
    setGoal(profile.goal);
    setExperience(profile.experience);
    setDays(profile.days_per_week);
    setMinutes(profile.session_minutes);
    setUnits(profile.units);
  }, [profile]);

  async function next(e: React.FormEvent) {
    e.preventDefault();
    await save({ display_name: name.trim() || null, goal, experience, days_per_week: days, session_minutes: minutes, units });
    setStep(2);
  }

  async function finish(withGym: boolean) {
    setBusy(true);
    if (withGym) await createGym(gymName || TEMPLATE_LABELS[template].name, template);
    await save({ onboarded_at: new Date().toISOString() });
    router.replace(withGym ? "/" : "/");
  }

  return (
    <main className="safe-top safe-bottom flex flex-col gap-5 px-5 pb-10">
      <div className="mt-6 flex items-center gap-2">
        {[1, 2].map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-line"}`} />
        ))}
      </div>

      {step === 1 ? (
        <form onSubmit={next} className="flex flex-col gap-5">
          <h1 className="display text-5xl font-extrabold leading-none">
            Let&apos;s set
            <br />
            <span className="text-accent">you up.</span>
          </h1>
          <label className="flex flex-col gap-2">
            <span className={label}>FIRST NAME</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required />
          </label>
          <div className="flex flex-col gap-2">
            <span className={label}>MAIN GOAL</span>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
                <Chip key={g} active={goal === g} onClick={() => setGoal(g)}>{GOAL_LABELS[g]}</Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>EXPERIENCE</span>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(EXPERIENCE_LABELS) as Experience[]).map((x) => (
                <Chip key={x} active={experience === x} onClick={() => setExperience(x)}>{EXPERIENCE_LABELS[x]}</Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>DAYS PER WEEK</span>
            <div className="grid grid-cols-6 gap-1.5">
              {[2, 3, 4, 5, 6, 7].map((d) => (
                <Chip key={d} active={days === d} onClick={() => setDays(d)}>{d}</Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>SESSION LENGTH</span>
            <div className="grid grid-cols-5 gap-1.5">
              {[30, 45, 60, 75, 90].map((m) => (
                <Chip key={m} active={minutes === m} onClick={() => setMinutes(m)}>{m}</Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>UNITS</span>
            <div className="grid grid-cols-2 gap-2">
              <Chip active={units === "lb"} onClick={() => setUnits("lb")}>Pounds · miles</Chip>
              <Chip active={units === "kg"} onClick={() => setUnits("kg")}>Kilograms · km</Chip>
            </div>
          </div>
          <button type="submit" className={btn.primary}>Next</button>
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <h1 className="display text-5xl font-extrabold leading-none">
            Where do
            <br />
            <span className="text-accent">you train?</span>
          </h1>
          <p className="-mt-2 text-base font-medium text-muted">Pick the closest match. You can tick and untick equipment next, and add more gyms any time.</p>
          <label className="flex flex-col gap-2">
            <span className={label}>GYM NAME</span>
            <input className={field} value={gymName} onChange={(e) => setGymName(e.target.value)} placeholder="Main gym, Home, Work…" />
          </label>
          <div className="flex flex-col gap-2">
            {(Object.keys(TEMPLATE_LABELS) as GymTemplate[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTemplate(t)}
                aria-pressed={template === t}
                className={`flex min-h-16 flex-col items-start justify-center rounded-2xl border-2 px-4 py-2 text-left ${
                  template === t ? "border-accent-strong bg-primary/15" : "border-line bg-card"
                }`}
              >
                <span className={`text-base font-bold ${template === t ? "text-accent-soft" : ""}`}>{TEMPLATE_LABELS[t].name}</span>
                <span className="text-sm font-medium text-muted">{TEMPLATE_LABELS[t].blurb}</span>
              </button>
            ))}
          </div>
          <button type="button" disabled={busy} onClick={() => finish(true)} className={btn.primary}>
            {busy ? "Setting up…" : "Create gym"}
          </button>
          <button type="button" disabled={busy} onClick={() => finish(false)} className={btn.ghost}>
            Skip for now
          </button>
        </div>
      )}
    </main>
  );
}
