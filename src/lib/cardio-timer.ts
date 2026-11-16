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

  /**
   * Starts a timer. Does nothing (returns false) if one is already going.
   * fromSec + sessionId continue a saved session from where it ended.
   */
  const start = useCallback(
    async (type: CardioType, ctx: { workoutId: string | null; wexId: string | null; sessionId?: string | null; fromSec?: number }) => {
      if (await db.getMeta<CardioTimer | null>(KEY)) return false;
      const { fromSec = 0, ...rest } = ctx;
      await db.setMeta(KEY, { type, startedAt: Date.now() - fromSec * 1000, stoppedAt: null, sessionId: null, ...rest } satisfies CardioTimer);
      return true;
    },
    [db],
  );

  /** Ended by mistake: keeps counting from where it stopped, as if Done was never tapped. */
  const resume = useCallback(async () => {
    const t = await db.getMeta<CardioTimer | null>(KEY);
    if (t?.stoppedAt) await db.setMeta(KEY, { ...t, startedAt: t.startedAt + (Date.now() - t.stoppedAt), stoppedAt: null });
  }, [db]);

  /** Done: freezes the clock; the timer stays until the results are saved or thrown away. */
  const stop = useCallback(async () => {
    const t = await db.getMeta<CardioTimer | null>(KEY);
    if (t && !t.stoppedAt) await db.setMeta(KEY, { ...t, stoppedAt: Date.now() });
  }, [db]);

  const clear = useCallback(() => clearCardioTimer(db), [db]);

  return { timer, start, stop, resume, clear };
}
