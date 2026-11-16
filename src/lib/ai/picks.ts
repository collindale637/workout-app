"use client";

import { useEffect, useMemo, useState } from "react";
import { rankAdditions, rankSwaps, topDistinct, type SwapWhy } from "@/lib/generator";
import { recoveryScores, useGeneratorInputs } from "@/lib/smart";
import { isCardioExercise } from "@/lib/cardio";
import { aiProfile, askAI, gymContext, recoveryRecord, toAllowed } from "./client";
import type { AiPick, TodayItem } from "./types";

/*
  "Best swaps" and "Suggested for today" in the workout's exercise picker. The phone ranks the options
  itself first (instant, offline, free), then asks Claude to choose from the top of that list with a
  reason for each. Answers are remembered for the session, so reopening the sheet doesn't ask again.
*/

export type SmartPicks = {
  /** loading: local picks shown while the AI thinks; ai: AI picks; local: AI unavailable, local picks only. */
  state: "loading" | "ai" | "local";
  picks: AiPick[];
  /** Why the AI picks aren't shown (offline, monthly limit…), when state is "local". */
  note: string | null;
};

const CANDIDATES = 25;
const cache = new Map<string, AiPick[]>();

export function useSmartPicks(args: {
  kind: "swap" | "suggest";
  /** Only works while the sheet is open. */
  active: boolean;
  /** "swap": the exercise being replaced. */
  fromId?: string;
  why?: SwapWhy;
  today: { name: string; items: { exercise_id: string; sets_done: number; sets_planned: number }[] };
}): SmartPicks | null {
  const { catalog, profile, gym, gymEquipment, prefs, recovery } = useGeneratorInputs();
  const { kind, active, fromId, why = null, today } = args;
  const todayIds = today.items.map((i) => i.exercise_id);
  const todayKey = todayIds.join(",");

  // The rules-based ranking: what's shown first, and the candidates the AI chooses from.
  const ranked = useMemo(() => {
    if (!catalog || !profile || !active) return null;
    const ids = todayKey ? todayKey.split(",") : [];
    const opts = { gymEquipment, experience: profile.experience, prefs, recovery: recoveryScores(recovery?.map) };
    const list =
      kind === "swap" && fromId
        ? rankSwaps(catalog, fromId, { ...opts, why, inWorkout: ids, exclude: new Set(ids) })
        : rankAdditions(catalog, ids, opts);
    return topDistinct(catalog, list, CANDIDATES);
  }, [catalog, profile, gymEquipment, prefs, recovery, kind, fromId, why, todayKey, active]);

  const shown = kind === "swap" ? 3 : 4;
  const local = useMemo<AiPick[]>(() => (ranked ?? []).slice(0, shown).map((id) => ({ exercise_id: id, reason: "" })), [ranked, shown]);
  const key = `${kind}|${fromId ?? ""}|${why ?? ""}|${todayKey}|${gym?.id ?? ""}`;
  const [answer, setAnswer] = useState<{ key: string; picks: AiPick[] | null; note: string | null } | null>(null);

  useEffect(() => {
    if (!active || !ranked?.length || !catalog || !profile) return;
    if (cache.has(key)) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    let stale = false;
    const fromCatalog = (id: string) => catalog.byId.get(id);
    const items: TodayItem[] = today.items.map((t) => {
      const ex = fromCatalog(t.exercise_id);
      const a = ex ? toAllowed(catalog, ex, prefs) : null;
      const cardio = isCardioExercise(ex);
      return { id: t.exercise_id, name: ex?.name ?? t.exercise_id, muscles: a?.muscles ?? [], type: a?.type ?? "isolation", sets_done: cardio ? Math.min(1, t.sets_done) : t.sets_done, sets_planned: t.sets_planned };
    });
    void askAI({
      kind,
      prompt: "",
      profile: aiProfile(profile),
      gym: gymContext(catalog, gym, gymEquipment),
      exercises: ranked.flatMap((id) => {
        const ex = fromCatalog(id);
        return ex ? [toAllowed(catalog, ex, prefs)] : [];
      }),
      recovery: recoveryRecord(recovery?.map),
      today: { name: today.name, items },
      swap: kind === "swap" && fromId ? { exercise_id: fromId, why } : undefined,
    }).then((res) => {
      if (stale) return;
      if (res.ok && (res.kind === "swap" || res.kind === "suggest")) {
        cache.set(key, res.picks);
        setAnswer({ key, picks: res.picks, note: null });
      } else setAnswer({ key, picks: null, note: res.ok ? null : res.error });
    });
    return () => {
      stale = true;
    };
    // today is described by todayKey; the rest is read when the request goes out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active, ranked]);

  if (!active || !ranked) return null;
  const cached = cache.get(key);
  if (cached) return { state: "ai", picks: cached, note: null };
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  if (offline) return { state: "local", picks: local, note: "You're offline, so these are matched by muscles and equipment." };
  if (answer?.key === key) return { state: "local", picks: local, note: answer.note };
  return { state: "loading", picks: local, note: null };
}
