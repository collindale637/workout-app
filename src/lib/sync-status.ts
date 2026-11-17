/*
  What to tell the person about syncing, as plain text. Everything works offline (the phone keeps its own
  copy), so the message is about when their changes reach the cloud, not about whether the app works.
*/

export type SyncState = "idle" | "syncing" | "offline" | "error";

/** "3 changes", "1 change". */
export const changes = (n: number) => `${n} change${n === 1 ? "" : "s"}`;

/** The short status shown on the More tab's Sync row. */
export function syncLine(o: { status: SyncState; pending: number; total: number; lastSynced: Date | null }): string {
  const { status, pending, total, lastSynced } = o;
  if (status === "syncing") return pending > 0 && total > 0 ? `Syncing ${Math.max(0, total - pending)} of ${total}…` : "Syncing…";
  if (status === "offline") return pending > 0 ? `Offline · ${changes(pending)} waiting` : "Offline · nothing waiting";
  if (status === "error") return pending > 0 ? `Last sync failed · ${changes(pending)} waiting` : "Last sync failed";
  const when = lastSynced ? ` · ${lastSynced.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "";
  return pending > 0 ? `${changes(pending)} waiting${when}` : `Up to date${when}`;
}

/** 0–1 while syncing a known number of changes, otherwise null (no bar). */
export function syncFraction(o: { status: SyncState; pending: number; total: number }): number | null {
  if (o.status !== "syncing" || o.total <= 0) return null;
  return Math.min(1, Math.max(0, (o.total - o.pending) / o.total));
}
