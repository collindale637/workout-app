"use client";

import { useCallback, useEffect, useState } from "react";
import { isAvailable } from "@/lib/availability";
import { isCardioExercise, cardioLabel } from "@/lib/cardio";
import { formatWeight, weightUnit, toDisplayDistance, distanceUnit } from "@/lib/units";
import type { LocalDB } from "@/lib/db/dexie";
import type { Catalog } from "@/lib/hooks";
import type { MuscleRecovery } from "@/lib/recovery";
import type { ExercisePref, Exercise, Profile } from "@/lib/db/types";
import type { AiImage, AiProfile, AiRequest, AiResponse, AiUsage, AllowedExercise } from "./types";

/*
  The phone's side of AI: it gathers the context (what this gym can do, your profile, recovery and recent
  workouts) from its own database and sends it to /api/ai. AI needs a connection; everything else doesn't.
*/

const LIFTS = new Set(["strength", "powerlifting", "olympic_weightlifting"]);

function typeOf(ex: Exercise): AllowedExercise["type"] {
  if (isCardioExercise(ex)) return "cardio";
  if (ex.movement_pattern === "core") return "core";
  return ex.mechanic === "compound" ? "compound" : "isolation";
}

function toAllowed(catalog: Catalog, ex: Exercise, prefs: Map<string, ExercisePref>): AllowedExercise {
  const muscles = (catalog.musclesOf.get(ex.id) ?? []).filter((m) => m.role === "primary").map((m) => m.muscle_id);
  return { id: ex.id, name: ex.name, muscles, type: typeOf(ex), ...(prefs.get(ex.id)?.favorite ? { favorite: true } : {}) };
}

/**
 * Exercises Claude may use at this gym: the ones the gym's equipment supports, minus "never suggest".
 * Sticks to the cleaned-up common list (plus your custom exercises and favorites) unless the gym has
 * very little, so the prompt stays short and the picks stay sensible.
 */
export function allowedAtGym(
  catalog: Catalog,
  gymEquipment: Set<string> | null,
  prefs: Map<string, ExercisePref>,
  include: Iterable<string> = [],
): AllowedExercise[] {
  const extra = new Set(include);
  const usable = catalog.exercises.filter(
    (e) =>
      e.is_active &&
      (LIFTS.has(e.category) || isCardioExercise(e)) &&
      !prefs.get(e.id)?.excluded &&
      (!gymEquipment || isAvailable(catalog.needs.get(e.id) ?? [], gymEquipment)),
  );
  const preferred = usable.filter((e) => e.is_common || e.owner_id || prefs.get(e.id)?.favorite || extra.has(e.id));
  const list = preferred.filter((e) => !isCardioExercise(e)).length >= 40 ? preferred : usable;
  const ids = new Set(list.map((e) => e.id));
  // Exercises already in the plan being edited stay usable even if the gym or filters changed.
  for (const id of extra) {
    const ex = catalog.byId.get(id);
    if (ex && !ids.has(id)) list.push(ex);
  }
  return list.filter((e) => (catalog.musclesOf.get(e.id) ?? []).length || isCardioExercise(e)).map((e) => toAllowed(catalog, e, prefs));
}

/** For imports: the whole common library (not just this gym), plus custom exercises and favorites. */
export function libraryForImport(catalog: Catalog, prefs: Map<string, ExercisePref>): AllowedExercise[] {
  return catalog.exercises
    .filter((e) => e.is_active && (e.is_common || e.owner_id || prefs.get(e.id)?.favorite) && (LIFTS.has(e.category) || isCardioExercise(e) || e.category === "plyometrics"))
    .map((e) => toAllowed(catalog, e, prefs));
}

export const aiProfile = (p: Profile): AiProfile => ({
  goal: p.goal, experience: p.experience, days_per_week: p.days_per_week, session_minutes: p.session_minutes, units: p.units, default_rpe: p.default_rpe, cardio_pref: p.cardio_pref ?? "auto",
});

/** Muscles that aren't fully fresh, rounded. */
export function recoveryRecord(map: Map<string, MuscleRecovery> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of map?.values() ?? []) if (r.score < 95) out[r.muscleId] = Math.round(r.score);
  return out;
}

export const gymContext = (catalog: Catalog, gym: { name: string } | null, equipment: Set<string> | null) =>
  gym && equipment ? { name: gym.name, equipment: [...equipment].map((id) => catalog.equipmentName.get(id) ?? id) } : null;

/** A few lines about the last two weeks of training: "Nov 14 · Push: Bench Press 3 × 8 @ 185 lb, …". */
export async function historyLines(db: LocalDB, catalog: Catalog, units: Profile["units"], max = 8): Promise<string[]> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const workouts = (await db.workouts.where("started_at").above(since).toArray()).filter((w) => w.ended_at).sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, max);
  const wexs = await db.workout_exercises.where("workout_id").anyOf(workouts.map((w) => w.id)).toArray();
  const sets = await db.sets.where("workout_exercise_id").anyOf(wexs.map((w) => w.id)).toArray();
  const cardio = await db.cardio_sessions.where("started_at").above(since).toArray();
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const lines: { at: string; text: string }[] = [];
  for (const w of workouts) {
    const parts = wexs
      .filter((x) => x.workout_id === w.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .slice(0, 8)
      .map((x) => {
        const name = catalog.byId.get(x.exercise_id)?.name ?? x.exercise_id;
        const ss = sets.filter((s) => s.workout_exercise_id === x.id && s.type !== "warmup");
        if (!ss.length) return isCardioExercise(catalog.byId.get(x.exercise_id)) ? name : `${name} (skipped)`;
        const top = ss.reduce((a, b) => ((b.weight ?? 0) > (a.weight ?? 0) ? b : a));
        return `${name} ${ss.length} × ${top.reps ?? "?"}${top.weight ? ` @ ${formatWeight(top.weight, units)} ${weightUnit(units)}` : ""}`;
      });
    lines.push({ at: w.started_at, text: `${day(w.started_at)} · ${w.name ?? "Workout"}: ${parts.join(", ") || "no sets logged"}` });
  }
  for (const c of cardio.filter((c) => !c.workout_id)) {
    const dist = c.distance ? ` ${toDisplayDistance(c.distance, units)} ${distanceUnit(units)}` : "";
    lines.push({ at: c.started_at, text: `${day(c.started_at)} · ${cardioLabel(c.type)} ${Math.round(c.duration_sec / 60)} min${dist}` });
  }
  return lines.sort((a, b) => b.at.localeCompare(a.at)).slice(0, max).map((l) => l.text);
}

/** Sends a request to the AI route. Never throws: problems come back as { ok: false, error }. */
export async function askAI(req: AiRequest): Promise<AiResponse> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, error: "You're offline. AI needs a connection; everything else works without one." };
  try {
    const res = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
    const data = (await res.json().catch(() => null)) as AiResponse | null;
    if (!data) return { ok: false, error: res.status === 413 ? "The photos are too large. Try fewer." : `Something went wrong (${res.status}). Try again.` };
    return data;
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

/** This month's AI spend. `refresh` after a request (the response carries fresh numbers too). */
export function useAiUsage() {
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ai", { cache: "no-store" });
      if (res.ok) setUsage((await res.json()) as AiUsage);
    } catch {
      /* offline: leave it */
    }
  }, []);
  useEffect(() => {
    // Load once when the screen opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);
  return { usage, setUsage, refresh };
}

/** Phone photos can be huge (and HEIC): resize to at most 1568 px on the long side and send as JPEG. */
export async function prepareImage(file: File): Promise<AiImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Couldn't read that image."));
      i.src = url;
    });
    const scale = Math.min(1, 1568 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't read that image.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { media_type: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "$0.42 of $10 this month" */
export function usageLine(u: AiUsage | null) {
  if (!u) return null;
  if (!u.configured) return "AI isn't set up yet (needs an API key in Vercel).";
  const left = Math.max(0, u.cap_usd - u.household_usd);
  return `AI this month: $${u.household_usd.toFixed(2)} of the family's $${u.cap_usd.toFixed(0)} · $${left.toFixed(2)} left`;
}
