"use client";

import { advancePlan, dayWeek, planCopy, weekProgress } from "@/lib/plan-weeks";
import { useCallback } from "react";
import { useData } from "@/lib/db/provider";
import { markDeleted, markDirty } from "@/lib/db/sync";
import { newId, nowIso } from "@/lib/db/dexie";
import type { GenItem } from "@/lib/generator";
import { repairSupersets } from "@/lib/workout";
import type { Goal, Plan, PlanDay, PlanExercise, PlanSource } from "@/lib/db/types";

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const toRow = (dayId: string, item: GenItem, i: number): PlanExercise => ({
  id: newId(), plan_day_id: dayId, exercise_id: item.exercise_id, sort_order: i, sets: item.sets,
  rep_min: item.rep_min, rep_max: item.rep_max, rest_sec: item.rest_sec, superset_group: item.superset_group, notes: item.notes,
});

/** Creating, editing and switching plans. Saved on the phone first, then synced. */
export function usePlanActions() {
  const { db, requestSync } = useData();

  const create = useCallback(
    async (opts: {
      name: string; goal: Goal; splitId: string | null; weeks: number; source?: PlanSource; notes?: string | null;
      /** In order. `week` (default 1) puts a day in a later week; days are numbered within their week. */
      days: { name: string; target_muscle_ids: string[]; items: GenItem[]; week?: number }[];
    }) => {
      const plan: Plan = {
        id: newId(), name: opts.name, goal: opts.goal, split_id: opts.splitId, start_date: todayIso(), weeks: opts.weeks,
        source: opts.source ?? "generated", is_active: true, created_at: nowIso(), ...(opts.notes ? { notes: opts.notes } : {}),
        current_week: 1, week_started_at: nowIso(), skipped_day_ids: [], completed_at: null, completion_dismissed_at: null,
      };
      const perWeek = new Map<number, number>();
      const days: PlanDay[] = opts.days.map((d) => {
        const week = d.week ?? 1;
        const order = (perWeek.get(week) ?? 0) + 1;
        perWeek.set(week, order);
        return { id: newId(), plan_id: plan.id, day_order: order, name: d.name, gym_id: null, target_muscle_ids: d.target_muscle_ids, week };
      });
      const rows = opts.days.flatMap((d, i) => d.items.map((item, k) => toRow(days[i].id, item, k)));
      await db.transaction("rw", [db.plans, db.plan_days, db.plan_exercises, db.outbox], async () => {
        // Only one active plan.
        for (const p of await db.plans.toArray()) {
          if (p.is_active) {
            await db.plans.update(p.id, { is_active: false });
            await markDirty(db, "plans", p.id);
          }
        }
        await db.plans.put(plan);
        await markDirty(db, "plans", plan.id);
        await db.plan_days.bulkPut(days);
        for (const d of days) await markDirty(db, "plan_days", d.id);
        await db.plan_exercises.bulkPut(rows);
        for (const r of rows) await markDirty(db, "plan_exercises", r.id);
      });
      requestSync();
      return plan;
    },
    [db, requestSync],
  );

  const setActive = useCallback(
    async (planId: string, active: boolean) => {
      await db.transaction("rw", [db.plans, db.outbox], async () => {
        for (const p of await db.plans.toArray()) {
          const want = p.id === planId ? active : active ? false : p.is_active;
          if (p.is_active !== want) {
            await db.plans.update(p.id, { is_active: want });
            await markDirty(db, "plans", p.id);
          }
        }
      });
      requestSync();
    },
    [db, requestSync],
  );

  const updatePlan = useCallback(
    async (planId: string, changes: Partial<Plan>) => {
      await db.plans.update(planId, changes);
      await markDirty(db, "plans", planId);
      requestSync();
    },
    [db, requestSync],
  );

  const remove = useCallback(
    async (planId: string) => {
      const days = await db.plan_days.where("plan_id").equals(planId).toArray();
      const exs = await db.plan_exercises.where("plan_day_id").anyOf(days.map((d) => d.id)).toArray();
      await db.transaction("rw", [db.plans, db.plan_days, db.plan_exercises, db.outbox, db.tombstones], async () => {
        for (const e of exs) {
          await db.plan_exercises.delete(e.id);
          await markDeleted(db, "plan_exercises", e.id);
        }
        for (const d of days) {
          await db.plan_days.delete(d.id);
          await markDeleted(db, "plan_days", d.id);
        }
        await db.plans.delete(planId);
        await markDeleted(db, "plans", planId);
      });
      requestSync();
    },
    [db, requestSync],
  );

  const updateDay = useCallback(
    async (dayId: string, changes: Partial<PlanDay>) => {
      await db.plan_days.update(dayId, changes);
      await markDirty(db, "plan_days", dayId);
      requestSync();
    },
    [db, requestSync],
  );

  /** Replaces a day's exercises (regenerate, or a reordered list). */
  const replaceExercises = useCallback(
    async (dayId: string, items: GenItem[]) => {
      const old = await db.plan_exercises.where("plan_day_id").equals(dayId).toArray();
      const rows = items.map((item, i) => toRow(dayId, item, i));
      await db.transaction("rw", [db.plan_exercises, db.outbox, db.tombstones], async () => {
        for (const e of old) {
          await db.plan_exercises.delete(e.id);
          await markDeleted(db, "plan_exercises", e.id);
        }
        await db.plan_exercises.bulkPut(rows);
        for (const r of rows) await markDirty(db, "plan_exercises", r.id);
      });
      requestSync();
    },
    [db, requestSync],
  );

  const updateExercise = useCallback(
    async (id: string, changes: Partial<PlanExercise>) => {
      await db.plan_exercises.update(id, changes);
      await markDirty(db, "plan_exercises", id);
      requestSync();
    },
    [db, requestSync],
  );

  const removeExercise = useCallback(
    async (id: string) => {
      const row = await db.plan_exercises.get(id);
      await db.plan_exercises.delete(id);
      await markDeleted(db, "plan_exercises", id);
      if (row?.superset_group !== null && row) {
        // A superset of one isn't a superset.
        const left = (await db.plan_exercises.where("plan_day_id").equals(row.plan_day_id).toArray()).filter((e) => e.superset_group === row.superset_group);
        if (left.length === 1) {
          await db.plan_exercises.update(left[0].id, { superset_group: null });
          await markDirty(db, "plan_exercises", left[0].id);
        }
      }
      requestSync();
    },
    [db, requestSync],
  );

  const addExercises = useCallback(
    async (dayId: string, items: GenItem[]) => {
      const existing = await db.plan_exercises.where("plan_day_id").equals(dayId).count();
      const rows = items.map((item, i) => toRow(dayId, item, existing + i));
      await db.plan_exercises.bulkPut(rows);
      for (const r of rows) await markDirty(db, "plan_exercises", r.id);
      requestSync();
    },
    [db, requestSync],
  );

  /** Puts a day's exercises in this order (hold-and-drag); supersets split apart by the move are unlinked. */
  const reorderExercises = useCallback(
    async (dayId: string, ids: string[]) => {
      const list = await db.plan_exercises.where("plan_day_id").equals(dayId).toArray();
      const byId = new Map(list.map((e) => [e.id, e]));
      const ordered = [...ids.map((id) => byId.get(id)).filter((e): e is PlanExercise => Boolean(e)), ...list.filter((e) => !ids.includes(e.id))];
      const groups = repairSupersets(ordered.map((e) => e.superset_group));
      for (let k = 0; k < ordered.length; k++) {
        const e = ordered[k];
        if (e.sort_order !== k || e.superset_group !== groups[k]) {
          await db.plan_exercises.update(e.id, { sort_order: k, superset_group: groups[k] });
          await markDirty(db, "plan_exercises", e.id);
        }
      }
      requestSync(4000);
    },
    [db, requestSync],
  );

  const moveExercise = useCallback(
    async (dayId: string, id: string, dir: -1 | 1) => {
      const list = (await db.plan_exercises.where("plan_day_id").equals(dayId).toArray()).sort((a, b) => a.sort_order - b.sort_order);
      const i = list.findIndex((e) => e.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      for (let k = 0; k < list.length; k++) {
        if (list[k].sort_order !== k) {
          await db.plan_exercises.update(list[k].id, { sort_order: k });
          await markDirty(db, "plan_exercises", list[k].id);
        }
      }
      requestSync();
    },
    [db, requestSync],
  );

  /**
   * Applies a plain-English edit: days that came back with their id keep it (so "next day" and history
   * stay linked), new days are added, and days left out are removed.
   */
  const applyEdit = useCallback(
    async (
      planId: string,
      next: { name: string; goal: Goal; weeks: number; notes: string | null; days: { ref_day_id: string | null; name: string; target_muscle_ids: string[]; items: GenItem[] }[] },
      /** The week whose days are being replaced; other weeks are left alone. */
      week = 1,
    ) => {
      const oldDays = (await db.plan_days.where("plan_id").equals(planId).toArray()).filter((d) => dayWeek(d) === week);
      const oldRows = await db.plan_exercises.where("plan_day_id").anyOf(oldDays.map((d) => d.id)).toArray();
      const kept = new Set(next.days.map((d) => d.ref_day_id).filter(Boolean));
      await db.transaction("rw", [db.plans, db.plan_days, db.plan_exercises, db.outbox, db.tombstones], async () => {
        await db.plans.update(planId, { name: next.name, goal: next.goal, weeks: next.weeks, notes: next.notes });
        await markDirty(db, "plans", planId);
        // Exercises are replaced wholesale; children go before parents for deletes.
        for (const r of oldRows) {
          await db.plan_exercises.delete(r.id);
          await markDeleted(db, "plan_exercises", r.id);
        }
        for (const d of oldDays) {
          if (kept.has(d.id)) continue;
          await db.plan_days.delete(d.id);
          await markDeleted(db, "plan_days", d.id);
        }
        for (const [i, d] of next.days.entries()) {
          const id = d.ref_day_id && oldDays.some((o) => o.id === d.ref_day_id) ? d.ref_day_id : newId();
          const old = oldDays.find((o) => o.id === id);
          await db.plan_days.put({ id, plan_id: planId, day_order: i + 1, name: d.name, gym_id: old?.gym_id ?? null, target_muscle_ids: d.target_muscle_ids, week });
          await markDirty(db, "plan_days", id);
          const rows = d.items.map((item, k) => toRow(id, item, k));
          await db.plan_exercises.bulkPut(rows);
          for (const r of rows) await markDirty(db, "plan_exercises", r.id);
        }
      });
      requestSync();
    },
    [db, requestSync],
  );

  /** Moves the plan to its next week (or marks it complete) once every day this week is done or skipped. Safe to call any time. */
  const advanceWeek = useCallback(
    async (planId: string) => {
      let changed = false;
      await db.transaction("rw", [db.plans, db.plan_days, db.workouts, db.outbox], async () => {
        const plan = await db.plans.get(planId);
        if (!plan) return;
        const days = await db.plan_days.where("plan_id").equals(planId).toArray();
        const ids = new Set(days.map((d) => d.id));
        const done = await db.workouts.filter((w) => Boolean(w.ended_at && w.plan_day_id && ids.has(w.plan_day_id))).toArray();
        const patch = advancePlan(plan, weekProgress(plan, days, done), nowIso());
        if (!patch) return;
        await db.plans.update(planId, patch);
        await markDirty(db, "plans", planId);
        changed = true;
      });
      if (changed) requestSync();
      return changed;
    },
    [db, requestSync],
  );

  /** Skips a day for the current week; it counts toward finishing the week. */
  const skipDay = useCallback(
    async (planId: string, dayId: string) => {
      await db.transaction("rw", [db.plans, db.outbox], async () => {
        const plan = await db.plans.get(planId);
        if (!plan) return;
        const skipped = new Set(plan.skipped_day_ids ?? []);
        skipped.add(dayId);
        await db.plans.update(planId, { skipped_day_ids: [...skipped] });
        await markDirty(db, "plans", planId);
      });
      await advanceWeek(planId);
      requestSync();
    },
    [db, requestSync, advanceWeek],
  );

  /**
   * Copies a week's workouts into another week (Make it different: copy the week it repeats; Copy forward: copy this
   * week into the next). The target's own workouts are replaced. New ids, so only that week changes from here on.
   */
  const copyWeek = useCallback(
    async (planId: string, from: number, to: number) => {
      const days = await db.plan_days.where("plan_id").equals(planId).toArray();
      const rows = await db.plan_exercises.where("plan_day_id").anyOf(days.map((d) => d.id)).toArray();
      const plan = planCopy(days, rows, from, to, newId);
      if (!plan || to > 12) return false;
      await db.transaction("rw", [db.plan_days, db.plan_exercises, db.outbox, db.tombstones], async () => {
        for (const r of plan.removeRows) {
          await db.plan_exercises.delete(r.id);
          await markDeleted(db, "plan_exercises", r.id);
        }
        for (const d of plan.removeDays) {
          await db.plan_days.delete(d.id);
          await markDeleted(db, "plan_days", d.id);
        }
        await db.plan_days.bulkPut(plan.addDays);
        for (const d of plan.addDays) await markDirty(db, "plan_days", d.id);
        await db.plan_exercises.bulkPut(plan.addRows);
        for (const r of plan.addRows) await markDirty(db, "plan_exercises", r.id);
      });
      requestSync();
      return true;
    },
    [db, requestSync],
  );

  /** Plan complete → Restart: back to week 1 as a new run. Workout history and PRs are untouched. */
  const restart = useCallback(
    async (planId: string) => {
      await db.plans.update(planId, { current_week: 1, week_started_at: nowIso(), skipped_day_ids: [], completed_at: null, completion_dismissed_at: null, start_date: todayIso(), is_active: true });
      await markDirty(db, "plans", planId);
      requestSync();
    },
    [db, requestSync],
  );

  /** Plan complete → "Skip for now" (true) or bring the screen back from Today's "Plan finished" row (false). */
  const dismissComplete = useCallback(
    async (planId: string, dismissed: boolean) => {
      await db.plans.update(planId, { completion_dismissed_at: dismissed ? nowIso() : null });
      await markDirty(db, "plans", planId);
      requestSync();
    },
    [db, requestSync],
  );

  return { copyWeek, restart, dismissComplete, create, setActive, updatePlan, remove, updateDay, replaceExercises, updateExercise, removeExercise, addExercises, moveExercise, reorderExercises, applyEdit, advanceWeek, skipDay };
}
