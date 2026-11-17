"use client";

import { useEffect, useState } from "react";
import { useData, usePendingCount } from "@/lib/db/provider";
import { changes, syncFraction } from "@/lib/sync-status";

/** How many changes were waiting when the current sync began, so "3 of 12" can count up. */
export function useSyncProgress() {
  const { status } = useData();
  const pending = usePendingCount();
  const [total, setTotal] = useState(0);
  useEffect(() => {
    // Grows to the largest backlog seen during this sync; resets when it ends.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTotal((t) => (status === "syncing" ? Math.max(t, pending) : 0));
  }, [status, pending]);
  return { status, pending, total, fraction: syncFraction({ status, pending, total }) };
}

export function SyncBar({ fraction }: { fraction: number | null }) {
  if (fraction === null) return null;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)} aria-label="Sync progress">
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(6, fraction * 100)}%` }} />
    </div>
  );
}

/** Small status on Today: offline (with how many changes are waiting), a failed sync, or a sync in progress. */
export function SyncBadge() {
  const { lastError, requestSync } = useData();
  const { status, pending, fraction } = useSyncProgress();
  if (status === "error") {
    return (
      <button type="button" onClick={() => requestSync(0)} className="w-full rounded-2xl bg-warn/15 px-4 py-2 text-left text-sm font-semibold text-warn">
        Couldn&apos;t sync: {lastError}. Your data is safe on this phone. Tap to retry.
      </button>
    );
  }
  if (status === "offline") {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-card-2 px-4 py-2 text-sm font-semibold text-muted">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warn" />
        {pending > 0 ? `Offline. ${changes(pending)} saved on this phone; they'll sync when you're back online.` : "Offline. Everything still works; it syncs when you're back online."}
      </p>
    );
  }
  if (status === "syncing" && pending > 0) {
    return (
      <div className="flex flex-col gap-1.5 rounded-2xl bg-card-2 px-4 py-2 text-sm font-semibold text-muted" role="status">
        Syncing {changes(pending)}…
        <SyncBar fraction={fraction} />
      </div>
    );
  }
  return null;
}
