"use client";

import { useData, usePendingCount } from "@/lib/db/provider";

/** Small status line: shows when changes are waiting for a signal or a sync failed. */
export function SyncBadge() {
  const { status, lastError, requestSync } = useData();
  const pending = usePendingCount();
  if (status === "error") {
    return (
      <button type="button" onClick={() => requestSync(0)} className="w-full rounded-2xl bg-warn/15 px-4 py-2 text-left text-sm font-semibold text-warn">
        Couldn&apos;t sync: {lastError}. Your data is safe on this phone. Tap to retry.
      </button>
    );
  }
  if (status === "offline" && pending > 0) {
    return (
      <p className="rounded-2xl bg-card-2 px-4 py-2 text-sm font-semibold text-muted">
        No signal. {pending} change{pending === 1 ? "" : "s"} saved on this phone; they&apos;ll sync when you&apos;re back online.
      </p>
    );
  }
  return null;
}
