"use client";

import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData } from "@/lib/db/provider";
import { adjustmentFor, type FatigueAdjustments } from "@/lib/recovery";

const KEY = "fatigue_adjust";

/**
 * How you say a muscle feels (Recovery → tap a muscle → slider). Kept on this phone only: it's a quick
 * personal override that fades on its own within a few days, so it doesn't need to sync.
 * `adjustments` is undefined while loading.
 */
export function useFatigueAdjustments() {
  const { db } = useData();
  const adjustments = useLiveQuery(async () => (await db.getMeta<FatigueAdjustments>(KEY)) ?? {}, [db]);

  /** Make a muscle read `score` right now. `autoFatigue` is what the app computed without any adjustment. */
  const set = useCallback(
    async (muscleId: string, score: number, autoFatigue: number) => {
      const all = (await db.getMeta<FatigueAdjustments>(KEY)) ?? {};
      await db.setMeta(KEY, { ...all, [muscleId]: adjustmentFor(score, autoFatigue, Date.now()) });
    },
    [db],
  );

  /** Back to the automatic number. */
  const clear = useCallback(
    async (muscleId: string) => {
      const all = { ...((await db.getMeta<FatigueAdjustments>(KEY)) ?? {}) };
      delete all[muscleId];
      await db.setMeta(KEY, all);
    },
    [db],
  );

  return { adjustments, set, clear };
}
