"use client";

import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useData, useProfile, usePendingCount } from "@/lib/db/provider";
import { Card, RowLink, btn } from "@/components/ui/kit";
import { GOAL_LABELS } from "@/lib/profile";

export function MoreMenu() {
  const router = useRouter();
  const { db, status, requestSync } = useData();
  const { profile } = useProfile();
  const pending = usePendingCount();
  const gymCount = useLiveQuery(() => db.gyms.count(), [db]);
  const lastSynced = useLiveQuery(() => db.getMeta<string>("lastSyncedAt"), [db]);

  async function signOut() {
    if (pending > 0 && !confirm(`${pending} change(s) haven't synced yet and will be lost if you sign out now. Sign out anyway?`)) return;
    await getSupabaseBrowser().auth.signOut();
    router.replace("/login");
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
        <RowLink href="/cardio" title="Log cardio" detail="Run, walk, bike, row, swim…" />
      </Card>
      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-base font-bold">Sync</div>
          <div className="text-sm font-medium text-muted">
            {status === "syncing" ? "Syncing…" : status === "offline" ? "Offline" : status === "error" ? "Last sync failed" : "Up to date"}
            {pending ? ` · ${pending} waiting` : ""}
            {lastSynced ? ` · ${new Date(lastSynced).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
          </div>
        </div>
        <button type="button" className={btn.ghost} onClick={() => requestSync(0)}>Sync now</button>
      </Card>
      <button type="button" onClick={signOut} className={btn.secondary}>Sign out</button>
    </main>
  );
}
