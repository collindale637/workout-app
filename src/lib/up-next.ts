"use client";

import { useCallback, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData } from "@/lib/db/provider";
import { adaptToGym, dayStyle, generateWorkout, type GenItem, type Swap } from "@/lib/generator";
import { pickFreshTargets } from "@/lib/recovery";
import { recoveryScores, useActivePlan, useGeneratorInputs, type ActivePlan } from "@/lib/smart";
import { todayIso } from "@/lib/plans";
import { lighterItems, lighterMinutes } from "@/lib/today-alt";
import type { PlanDay } from "@/lib/db/types";

/*
  What Today's "Up next" card shows. The choice lives on the phone (meta "upNext") and resets each day:
    plan    → the next plan day (or one you picked); Regenerate swaps in a fresh set for the same muscles
    fresh   → "target fresh muscles"
    muscles → muscles you picked
    ai      → a workout you asked Claude for ("Customize with AI"); kept as-is until you change it
*/

export type UpNextMode = "plan" | "fresh" | "muscles" | "ai";
/** A workout from "Customize with AI". planDayId is set when it replaces today's plan day, so the plan still moves on. */
export type AiPick = { name: string; summary: string; items: GenItem[]; planDayId: string | null };
/**
 * via "switch": picked with Today's Switch row (not ready → train another day or go lighter). light: every lift capped
 * at 2 sets. Both reset daily with the rest of the choice.
 */
export type UpNextChoice = {
  date: string; mode: UpNextMode; dayId?: string | null; muscles?: string[]; seed: number; ai?: AiPick; via?: "switch"; light?: boolean;
};

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
  source: "plan" | "generated" | "ai";
  /** "Go lighter" (plan mode): lifts capped at 2 sets; minutes is the estimate for the shorter session. */
  light?: { minutes: number };
};

export function useUpNextChoice() {
  const { db } = useData();
  // null (not undefined) when nothing is saved, so "still loading" and "nothing saved" differ.
  const stored = useLiveQuery(async () => (await db.getMeta<UpNextChoice>("upNext")) ?? null, [db]);
  const plan = useActivePlan();
  const today = todayIso();
  const todays = stored && stored.date === today ? stored : null;
  // A plan day picked for today (Change, Regenerate, Switch, or an AI swap for it) stops counting once that day is
  // finished, so "Up next" moves on to the plan's next day instead of showing the finished one again.
  const pinned = todays?.mode === "ai" ? todays.ai?.planDayId : todays?.mode === "plan" ? todays.dayId : null;
  const choice = todays && pinned && plan?.doneToday.has(pinned) ? null : todays;
  const setChoice = useCallback(
    async (c: Omit<UpNextChoice, "date">) => {
      await db.setMeta("upNext", { ...c, date: todayIso() });
    },
    [db],
  );
  return { choice, setChoice, loaded: stored !== undefined && plan !== undefined };
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
      prefs, recovery: scores, lastDone, seed, cardioPref: profile.cardio_pref,
    };
    const gen = { gymEquipment, experience: profile.experience, prefs };

    if (mode === "ai" && choice?.ai) {
      const ai = choice.ai;
      const adapted = adaptToGym(catalog, ai.items, gen);
      const day = plan?.days.find((d) => d.id === ai.planDayId) ?? null;
      const hit = new Set(ai.items.flatMap((i) => (catalog.musclesOf.get(i.exercise_id) ?? []).filter((m) => m.role === "primary").map((m) => m.muscle_id)));
      return {
        mode, title: ai.name, subtitle: day ? `Customized with AI · ${plan!.plan.name} · Day ${day.day_order}` : "Customized with AI",
        targets: catalog.muscles.map((m) => m.id).filter((id) => hit.has(id)), items: adapted.items, swaps: adapted.swaps, day, plan, seed, source: "ai",
      };
    }

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
      if (choice?.light) {
        const light = lighterItems(adapted.items, (id) => catalog.byId.get(id)?.category === "cardio");
        const minutes = lighterMinutes(profile.session_minutes, adapted.items, light);
        return {
          mode, title: day.name, subtitle: `Lighter today: 2 sets per lift · about ${minutes} min`,
          targets: day.target_muscle_ids, items: light, swaps: adapted.swaps, day, plan, seed, source: "plan", light: { minutes },
        };
      }
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
    if (fresh.tooFew) {
      // Fewer than two muscles are fresh: say so and offer core and cardio (or rest) instead of a lifting day.
      const core = ["abs", "obliques"];
      const { items } = generateWorkout(catalog, { ...base, targets: core, cardio: "block" });
      return {
        mode: "fresh", title: "Core & cardio", subtitle: "Most muscles are still recovering (under 85%). Core and cardio today, or take a rest day.",
        targets: core, items, swaps: [], day: null, plan, seed, source: "generated",
      };
    }
    const { items } = generateWorkout(catalog, { ...base, targets: fresh.targets });
    return {
      mode: "fresh", title: fresh.template.name, subtitle: "Only muscles that are 85%+ recovered",
      targets: fresh.targets, items, swaps: [], day: null, plan, seed, source: "generated",
    };
  }, [inputs, plan, choice, loaded]);
}
