"use client";

import { useEffect, useState } from "react";
import { useProfile } from "@/lib/db/provider";
import { EXPERIENCE_LABELS, GOAL_LABELS } from "@/lib/profile";
import { RPE_CHOICES } from "@/lib/defaults";
import { Card, Chip, btn, field, label } from "@/components/ui/kit";
import type { Experience, Goal, Profile, Units } from "@/lib/db/types";

export function ProfileForm() {
  const { profile, save } = useProfile();
  const [draft, setDraft] = useState<Profile | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copy the saved profile into an editable draft once
    if (profile && !draft) setDraft(profile);
  }, [profile, draft]);

  if (!draft) return <div className="h-64 animate-pulse rounded-3xl bg-card" />;
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setDraft({ ...draft, [key]: value });
    setMessage(null);
  };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await save({
          display_name: draft.display_name?.trim() || null,
          units: draft.units,
          goal: draft.goal,
          experience: draft.experience,
          days_per_week: draft.days_per_week,
          session_minutes: draft.session_minutes,
          default_rpe: draft.default_rpe,
        });
        setMessage("Saved");
      }}
    >
      <Card className="flex flex-col gap-4 p-4">
        <label className="flex flex-col gap-2">
          <span className={label}>NAME</span>
          <input className={field} value={draft.display_name ?? ""} onChange={(e) => set("display_name", e.target.value)} autoComplete="given-name" />
        </label>
        <div className="flex flex-col gap-2">
          <span className={label}>GOAL</span>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => <Chip key={g} active={draft.goal === g} onClick={() => set("goal", g)}>{GOAL_LABELS[g]}</Chip>)}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className={label}>EXPERIENCE</span>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(EXPERIENCE_LABELS) as Experience[]).map((x) => <Chip key={x} active={draft.experience === x} onClick={() => set("experience", x)}>{EXPERIENCE_LABELS[x]}</Chip>)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2">
            <span className={label}>DAYS / WEEK</span>
            <select className={field} value={draft.days_per_week} onChange={(e) => set("days_per_week", Number(e.target.value))}>
              {[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className={label}>SESSION</span>
            <select className={field} value={draft.session_minutes} onChange={(e) => set("session_minutes", Number(e.target.value))}>
              {[30, 45, 60, 75, 90].map((n) => <option key={n} value={n}>{n} min</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <span className={label}>UNITS</span>
          <div className="grid grid-cols-2 gap-2">
            {(["lb", "kg"] as Units[]).map((u) => <Chip key={u} active={draft.units === u} onClick={() => set("units", u)}>{u === "lb" ? "Pounds · miles" : "Kilograms · km"}</Chip>)}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className={label}>DEFAULT RPE (USED WHEN YOU SKIP IT)</span>
          <div className="grid grid-cols-7 gap-1.5">
            {RPE_CHOICES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => set("default_rpe", r)}
                aria-pressed={draft.default_rpe === r}
                className={`display num h-11 rounded-xl text-lg font-extrabold ${draft.default_rpe === r ? "bg-primary text-white shadow-[inset_0_-3px_0_var(--primary-press)]" : "bg-card-2 text-muted"}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <button type="submit" className={btn.primary}>Save</button>
        {message && <p role="status" className="text-sm font-semibold text-good">{message}</p>}
      </Card>
    </form>
  );
}
