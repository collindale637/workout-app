"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useData } from "@/lib/db/provider";
import { useActivePlan, useGeneratorInputs } from "@/lib/smart";
import { usePlanActions } from "@/lib/plans";
import { useUpNextChoice } from "@/lib/up-next";
import { buildPlanDays } from "@/lib/generator";
import { GOAL_LABELS } from "@/lib/profile";
import { doseLabel, MusclePills } from "@/components/planned";
import { Chip, PageHeader, btn, field, label } from "@/components/ui/kit";
import type { Goal } from "@/lib/db/types";

const WEEKS = [4, 6, 8, 12];

export function PlanBuilder() {
  const splitId = useSearchParams().get("split") ?? "";
  const router = useRouter();
  const { db } = useData();
  const inputs = useGeneratorInputs();
  const active = useActivePlan();
  const actions = usePlanActions();
  const { setChoice } = useUpNextChoice();
  const split = useLiveQuery(async () => {
    const s = await db.splits.get(splitId);
    if (!s) return null;
    const days = (await db.split_days.where("split_id").equals(splitId).toArray()).sort((a, b) => a.day_order - b.day_order);
    return { ...s, days };
  }, [db, splitId]);

  const [name, setName] = useState<string | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [weeks, setWeeks] = useState(8);
  const [seed, setSeed] = useState(0);
  const [saving, setSaving] = useState(false);

  const { catalog, profile, gym, gymEquipment, prefs } = inputs;
  const chosenGoal = goal ?? profile?.goal ?? "hypertrophy";
  const days = useMemo(() => {
    if (!split || !catalog || !profile) return null;
    return buildPlanDays(catalog, split.days, {
      gymEquipment, goal: chosenGoal, experience: profile.experience, sessionMinutes: profile.session_minutes, prefs, seed, cardioPref: profile.cardio_pref,
    });
  }, [split, catalog, profile, gymEquipment, chosenGoal, prefs, seed]);

  if (split === undefined || !inputs.ready || !catalog || !profile) return null;
  if (!split) {
    return (
      <main className="flex flex-col gap-4">
        <PageHeader title="Split not found" back="/plan" />
      </main>
    );
  }
  const planName = name ?? split.name;
  const empty = days?.filter((d) => d.items.length === 0) ?? [];

  return (
    <main className="flex flex-col gap-4 pb-6">
      <PageHeader title={split.name} back="/plan" />
      <p className="-mt-2 text-base font-medium text-muted">{split.description}</p>

      <label className="flex flex-col gap-2">
        <span className={label}>PLAN NAME</span>
        <input className={field} value={planName} onChange={(e) => setName(e.target.value)} />
      </label>

      <div className="flex flex-col gap-2">
        <span className={label}>GOAL</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
            <Chip key={g} active={chosenGoal === g} onClick={() => setGoal(g)}>{GOAL_LABELS[g]}</Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={label}>LENGTH</span>
        <div className="flex gap-2">
          {WEEKS.map((w) => (
            <Chip key={w} active={weeks === w} onClick={() => setWeeks(w)} className="flex-1">{w} weeks</Chip>
          ))}
        </div>
      </div>

      <div className="flex items-baseline justify-between pt-2">
        <h2 className="display text-xl font-extrabold">Your {split.days_per_week} days</h2>
        <button type="button" className={btn.ghost} onClick={() => setSeed(seed + 1)}>⟳ Shuffle</button>
      </div>
      <p className="-mt-2 text-sm font-medium text-muted">
        {gym ? `Picked for ${gym.name}. At another gym, anything it can't do swaps for the closest match.` : "No gym set up yet, so exercises aren't filtered by equipment."}{" "}
        {profile.session_minutes}-minute sessions. You can edit every day after.
      </p>

      {days?.map((d, i) => (
        <section key={i} className="flex flex-col gap-2 rounded-3xl border border-line bg-card p-4">
          <div className="flex items-baseline gap-2">
            <span className="display num text-lg font-extrabold text-muted">{i + 1}</span>
            <h3 className="display text-xl font-extrabold">{d.name}</h3>
          </div>
          <MusclePills catalog={catalog} ids={d.target_muscle_ids} max={8} />
          {d.items.length === 0 ? (
            <p className="text-sm font-semibold text-warn">Nothing at {gym?.name ?? "this gym"} trains these muscles. Add equipment to the gym, or edit this day later.</p>
          ) : (
            <ul className="flex flex-col">
              {d.items.map((it) => (
                <li key={it.exercise_id} className="flex items-baseline justify-between gap-3 py-1">
                  <span className="truncate text-base font-semibold">{catalog.byId.get(it.exercise_id)?.name ?? it.exercise_id}</span>
                  <span className="display num shrink-0 text-base font-bold text-muted">{doseLabel(catalog, it)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {active && <p className="text-sm font-medium text-muted">This becomes your active plan. &ldquo;{active.plan.name}&rdquo; moves to past plans.</p>}
      <button
        type="button"
        className={btn.primary}
        disabled={!days || saving || empty.length === days.length}
        onClick={async () => {
          if (!days) return;
          setSaving(true);
          await actions.create({ name: planName.trim() || split.name, goal: chosenGoal, splitId: split.id, weeks, days });
          await setChoice({ mode: "plan", seed: 0 });
          router.replace("/plan");
        }}
      >
        {saving ? "Saving…" : "Create plan"}
      </button>
    </main>
  );
}
