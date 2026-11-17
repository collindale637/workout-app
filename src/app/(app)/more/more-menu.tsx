"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useData, useProfile } from "@/lib/db/provider";
import { SyncBar, useSyncProgress } from "@/components/sync-badge";
import { syncLine } from "@/lib/sync-status";
import { Card, RowLink, btn } from "@/components/ui/kit";
import { GOAL_LABELS } from "@/lib/profile";
import { useAiUsage } from "@/lib/ai/client";

export function MoreMenu() {
  const { db, requestSync } = useData();
  const { profile } = useProfile();
  const sync = useSyncProgress();
  const { status, pending } = sync;
  const gymCount = useLiveQuery(() => db.gyms.count(), [db]);
  const lastSynced = useLiveQuery(() => db.getMeta<string>("lastSyncedAt"), [db]);
  const { usage } = useAiUsage();

  async function signOut() {
    if (pending > 0 && !confirm(`${pending} change(s) haven't synced yet and will be lost if you sign out now. Sign out anyway?`)) return;
    await getSupabaseBrowser().auth.signOut();
    // Hard navigation (not router.replace) so the login page loads fresh, with an empty form.
    window.location.replace("/login");
  }

  return (
    <main className="mt-2 flex flex-col gap-4">
      <header className="flex h-11 items-center">
        <h1 className="display text-4xl font-extrabold">More</h1>
      </header>
      <Card className="divide-y divide-line overflow-hidden">
        <RowLink href="/more/profile" title="Profile & settings" detail={`${profile?.display_name ?? "You"} · ${profile ? GOAL_LABELS[profile.goal] : ""} · RPE ${profile?.default_rpe ?? 8} default`} />
        <RowLink href="/more/gyms" title="Gyms" detail={`${gymCount ?? 0} gym${gymCount === 1 ? "" : "s"} · equipment checklists`} />
        <RowLink href="/more/library" title="Exercise library" detail="Browse, search, add your own" />
      </Card>
      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-base font-bold">Sync</div>
          <div className="text-sm font-medium text-muted" role="status">{syncLine({ status, pending, total: sync.total, lastSynced: lastSynced ? new Date(lastSynced) : null })}</div>
          {sync.fraction !== null && <div className="mt-2"><SyncBar fraction={sync.fraction} /></div>}
        </div>
        <button type="button" className={btn.ghost} disabled={status === "syncing"} onClick={() => requestSync(0)}>{status === "syncing" ? "Syncing…" : "Sync now"}</button>
      </Card>
      {usage && (
        <Card className="flex flex-col gap-2 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-base font-bold">AI this month</span>
            <span className="display num text-lg font-extrabold">
              ${usage.household_usd.toFixed(2)} <span className="text-sm font-bold text-muted">of ${usage.cap_usd.toFixed(0)}</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-card-2" aria-hidden="true">
            <div
              className={`h-full rounded-full ${usage.household_usd >= usage.cap_usd * 0.8 ? "bg-warn" : "bg-primary"}`}
              style={{ width: `${Math.min(100, (usage.household_usd / Math.max(0.01, usage.cap_usd)) * 100)}%` }}
            />
          </div>
          <div className="text-sm font-medium text-muted">
            {usage.configured
              ? `You: ${usage.my_requests} request${usage.my_requests === 1 ? "" : "s"}, $${usage.mine_usd.toFixed(2)}. The limit is shared by the family and resets on the 1st.`
              : "AI isn't set up yet: it needs a Claude API key in Vercel."}
          </div>
        </Card>
      )}
      <button type="button" onClick={signOut} className={btn.secondary}>Sign out</button>
    </main>
  );
}
