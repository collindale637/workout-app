"use client";

import { useCallback, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData } from "@/lib/db/provider";
import { adaptToGym, dayStyle, generateWorkout, type GenItem, type Swap } from "@/lib/generator";
import { pickFreshTargets } from "@/lib/recovery";
import { recoveryScores, useActivePlan, useGeneratorInputs, type ActivePlan } from "@/lib/smart";
import { todayIso } from "@/lib/plans";
import type { PlanDay } from "@/lib/db/types";

/*
  What Today's "Up next" card shows. The choice lives on the phone (meta "upNext") and resets each day:
    plan    → the next plan day (or one you picked); Regenerate swaps in a fresh set for the same muscles
    fresh   → "target fresh muscles"
    muscles → muscles you picked
*/

export type UpNextMode = "plan" | "fresh" | "muscles";
export type UpNextChoice = { date: string; mode: UpNextMode; dayId?: string | null; muscles?: string[]; seed: number };

export type UpNext = {
  mode: UpNextMode;
  title: string;
  subtitle: string;
  targets: string[];
  items: GenItem[];
  swaps: Swap[];
  day: PlanDay | null;
  plan: ActivePlan | null;
  seed: number;
  source: "plan" | "generated";
};

export function useUpNextChoice() {
  const { db } = useData();
  // null (not undefined) when nothing is saved, so "still loading" and "nothing saved" differ.
  const stored = useLiveQuery(async () => (await db.getMeta<UpNextChoice>("upNext")) ?? null, [db]);
  const today = todayIso();
  const choice = stored && stored.date === today ? stored : null;
  const setChoice = useCallback(
    async (c: Omit<UpNextChoice, "date">) => {
      await db.setMeta("upNext", { ...c, date: todayIso() });
    },
    [db],
  );
  return { choice, setChoice, loaded: stored !== undefined };
}

export function useUpNext(): UpNext | null | undefined {
  const inputs = useGeneratorInputs();
  const plan = useActivePlan();
  const { choice, loaded } = useUpNextChoice();

  return useMemo(() => {
    if (!inputs.ready || plan === undefined || !loaded) return undefined;
    const { catalog, profile, gymEquipment, prefs, recovery, lastDone } = inputs;
    if (!catalog || !profile || !recovery) return undefined;
    const mode: UpNextMode = choice?.mode ?? (plan ? "plan" : "fresh");
    const seed = choice?.seed ?? 0;
    const scores = recoveryScores(recovery.map);
    const base = {
      gymEquipment, goal: profile.goal, experience: profile.experience, sessionMinutes: profile.session_minutes,
      prefs, recovery: scores, lastDone, seed,
    };
    const gen = { gymEquipment, experience: profile.experience, prefs };

    if (mode === "plan" && plan) {
      const day = plan.days.find((d) => d.id === choice?.dayId) ?? plan.nextDay;
      if (!day) return null;
      const planned = (plan.exercises.get(day.id) ?? []).map((e) => ({
        exercise_id: e.exercise_id, sets: e.sets, rep_min: e.rep_min, rep_max: e.rep_max, rest_sec: e.rest_sec, superset_group: e.superset_group, notes: e.notes,
      }));
      const style = dayStyle(day.name);
      const items =
        seed === 0 && planned.length
          ? planned
          : generateWorkout(catalog, { ...base, goal: plan.plan.goal ?? profile.goal, targets: day.target_muscle_ids, cardio: style.cardio ?? undefined, focus: style.focus }).items;
      const adapted = adaptToGym(catalog, items, gen);
      return {
        mode, title: day.name, subtitle: `${plan.plan.name} · Day ${day.day_order} of ${plan.days.length}${seed ? " · regenerated" : ""}`,
        targets: day.target_muscle_ids, items: adapted.items, swaps: adapted.swaps, day, plan, seed, source: "plan",
      };
    }

    if (mode === "muscles" && choice?.muscles?.length) {
      const { items } = generateWorkout(catalog, { ...base, targets: choice.muscles });
      const names = choice.muscles.map((m) => catalog.muscleName.get(m) ?? m);
      return {
        mode, title: names.length <= 2 ? names.join(" & ") : "Your pick", subtitle: names.length > 2 ? names.join(", ") : "Muscles you picked",
        targets: choice.muscles, items, swaps: [], day: null, plan, seed, source: "generated",
      };
    }

    const fresh = pickFreshTargets(recovery.map, catalog.muscles);
    const { items } = generateWorkout(catalog, { ...base, targets: fresh.targets });
    return {
      mode: "fresh", title: fresh.template.name, subtitle: "Built from your freshest muscles",
      targets: fresh.targets, items, swaps: [], day: null, plan, seed, source: "generated",
    };
  }, [inputs, plan, choice, loaded]);
}
