"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { EXPERIENCE_LABELS, GOAL_LABELS, useProfile, type Experience, type Goal, type Profile, type Units } from "@/lib/profile";

const RPE_CHOICES = [6, 7, 7.5, 8, 8.5, 9, 10];

export function ProfileForm() {
  const router = useRouter();
  const { state, save } = useProfile();
  const [draft, setDraft] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copy loaded profile into the editable draft
    if (state.status === "ready") setDraft(state.profile);
  }, [state]);

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (state.status === "loading" || (state.status === "ready" && !draft)) {
    return <div className="h-64 animate-pulse rounded-3xl bg-card" />;
  }
  if (state.status === "error" || !draft) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-warn">Couldn&apos;t load your profile{state.status === "error" ? `: ${state.message}` : ""}.</p>
        <SignOut onClick={signOut} />
      </div>
    );
  }

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setDraft({ ...draft, [key]: value });

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    const { error } = await save({
      display_name: draft.display_name?.trim() || null,
      units: draft.units,
      goal: draft.goal,
      experience: draft.experience,
      days_per_week: draft.days_per_week,
      session_minutes: draft.session_minutes,
      default_rpe: draft.default_rpe,
    });
    setSaving(false);
    setMessage(error ? `Couldn't save: ${error}` : "Saved");
  }

  const label = "text-xs font-bold tracking-[0.1em] text-muted";
  const field = "h-12 w-full rounded-2xl border-2 border-line bg-card-2 px-4 text-base font-semibold text-ink outline-none focus:border-accent-strong";

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-3xl border border-line bg-card p-4">
        <h2 className="display text-xl font-extrabold">Profile</h2>
        {state.email && <p className="-mt-3 text-sm font-medium text-muted">{state.email}</p>}

        <label className="flex flex-col gap-2">
          <span className={label}>NAME</span>
          <input className={field} value={draft.display_name ?? ""} onChange={(e) => set("display_name", e.target.value)} placeholder="First name" autoComplete="given-name" />
        </label>

        <div className="flex flex-col gap-2">
          <span className={label}>GOAL</span>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
              <Chip key={g} active={draft.goal === g} onClick={() => set("goal", g)}>{GOAL_LABELS[g]}</Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className={label}>EXPERIENCE</span>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(EXPERIENCE_LABELS) as Experience[]).map((x) => (
              <Chip key={x} active={draft.experience === x} onClick={() => set("experience", x)}>{EXPERIENCE_LABELS[x]}</Chip>
            ))}
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
            {(["lb", "kg"] as Units[]).map((u) => (
              <Chip key={u} active={draft.units === u} onClick={() => set("units", u)}>{u === "lb" ? "Pounds · miles" : "Kilograms · km"}</Chip>
            ))}
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
                className={`display num h-11 rounded-xl text-lg font-extrabold ${
                  draft.default_rpe === r ? "bg-primary text-white shadow-[inset_0_-3px_0_var(--primary-press)]" : "bg-card-2 text-muted"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" disabled={saving} className="display h-14 rounded-2xl bg-primary text-xl font-extrabold text-white shadow-[inset_0_-5px_0_var(--primary-press)] disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
        {message && <p role="status" className={`text-sm font-semibold ${message === "Saved" ? "text-good" : "text-warn"}`}>{message}</p>}
      </section>

      <SignOut onClick={signOut} />
    </form>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 rounded-2xl border-2 px-3 text-sm font-bold ${
        active ? "border-accent-strong bg-primary/15 text-accent-soft" : "border-line bg-card-2 text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function SignOut({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="display h-12 rounded-2xl border-2 border-line text-lg font-extrabold tracking-[0.06em] text-muted">
      Sign out
    </button>
  );
}
