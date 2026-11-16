"use client";

import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData } from "@/lib/db/provider";
import type { LocalDB } from "@/lib/db/dexie";
import type { CardioTimer } from "@/lib/cardio";
import type { CardioType } from "@/lib/db/types";

const KEY = "cardio_timer";

/** Stops tracking a timer (used when its workout or exercise goes away). Only clears a matching timer. */
export async function clearCardioTimer(db: LocalDB, match?: { workoutId?: string; wexId?: string }) {
  const t = await db.getMeta<CardioTimer | null>(KEY);
  if (!t) return;
  if (match?.workoutId && t.workoutId !== match.workoutId) return;
  if (match?.wexId && t.wexId !== match.wexId) return;
  await db.setMeta(KEY, null);
}

/**
 * The one cardio timer in progress, kept on the phone so it keeps counting if you leave the screen.
 * `timer` is undefined while loading and null when nothing is running.
 */
export function useCardioTimer() {
  const { db } = useData();
  const timer = useLiveQuery(async () => (await db.getMeta<CardioTimer | null>(KEY)) ?? null, [db]);

  /** Starts a timer. Does nothing (returns false) if one is already going. */
  const start = useCallback(
    async (type: CardioType, ctx: { workoutId: string | null; wexId: string | null }) => {
      if (await db.getMeta<CardioTimer | null>(KEY)) return false;
      await db.setMeta(KEY, { type, startedAt: Date.now(), stoppedAt: null, ...ctx } satisfies CardioTimer);
      return true;
    },
    [db],
  );

  /** Done: freezes the clock; the timer stays until the results are saved or thrown away. */
  const stop = useCallback(async () => {
    const t = await db.getMeta<CardioTimer | null>(KEY);
    if (t && !t.stoppedAt) await db.setMeta(KEY, { ...t, stoppedAt: Date.now() });
  }, [db]);

  const clear = useCallback(() => clearCardioTimer(db), [db]);

  return { timer, start, stop, clear };
}
