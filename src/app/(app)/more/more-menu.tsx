"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useData, useProfile, useSave } from "@/lib/db/provider";
import { newId, nowIso } from "@/lib/db/dexie";
import { SyncBar, useSyncProgress } from "@/components/sync-badge";
import { syncLine } from "@/lib/sync-status";
import { Sheet, btn, field, label } from "@/components/ui/kit";
import { GOAL_LABELS } from "@/lib/profile";
import { useAiUsage } from "@/lib/ai/client";
import { useIsAppAdmin } from "@/lib/dev-notes";
import { DumbbellIcon, GymIcon, InboxIcon, MailIcon, PowerIcon, ProfileIcon, SparkleIcon, SyncIcon } from "@/components/icons";

/** A coloured square icon at the start of a row (settings-app style). */
function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-base ${tone}`} aria-hidden="true">
      {children}
    </span>
  );
}

const rowCls = "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-card-2";
const Chevron = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#4a5275]" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

function RowText({ title, detail }: { title: string; detail?: React.ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="text-base font-bold">{title}</span>
      {detail && <span className="truncate text-sm font-medium text-muted">{detail}</span>}
    </span>
  );
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-1.5">
    <h2 className={`${label} px-1`}>{title}</h2>
    <div className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">{children}</div>
  </section>
);

/** More tab (layout B from the Batch 13 mockups): grouped rows; "Note to developer" opens a sheet. */
export function MoreMenu() {
  const { db, requestSync } = useData();
  const { profile } = useProfile();
  const sync = useSyncProgress();
  const { status, pending } = sync;
  const gymCount = useLiveQuery(() => db.gyms.count(), [db]);
  const notesSent = useLiveQuery(() => db.dev_notes.count(), [db]);
  const lastSynced = useLiveQuery(() => db.getMeta<string>("lastSyncedAt"), [db]);
  const { usage } = useAiUsage();
  const [noteOpen, setNoteOpen] = useState(false);
  // Only the admin account (Collin) gets the inbox row; the server enforces it too.
  const admin = useIsAppAdmin();

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

      <Group title="YOU">
        <Link href="/more/profile" className={rowCls}>
          <Badge tone="bg-[#2a1d45] text-[#c9a6ff]"><ProfileIcon /></Badge>
          <RowText title="Profile & settings" detail={`${profile?.display_name ?? "You"} · ${profile ? GOAL_LABELS[profile.goal] : ""} · RPE ${profile?.default_rpe ?? 8}`} />
          <Chevron />
        </Link>
        <Link href="/more/gyms" className={rowCls}>
          <Badge tone="bg-[#142c2a] text-[#5fe0c4]"><GymIcon /></Badge>
          <RowText title="Gyms" detail={`${gymCount ?? 0} gym${gymCount === 1 ? "" : "s"} · equipment checklists`} />
          <Chevron />
        </Link>
        <Link href="/more/library" className={rowCls}>
          <Badge tone="bg-[#1d2645] text-accent"><DumbbellIcon /></Badge>
          <RowText title="Exercise library" detail="Browse, search, add your own" />
          <Chevron />
        </Link>
      </Group>

      <Group title="HELP MAKE IT BETTER">
        <button type="button" className={rowCls} onClick={() => setNoteOpen(true)}>
          <Badge tone="bg-[#3a2414] text-[#ffb27a]"><MailIcon /></Badge>
          <RowText title="Note to developer" detail={notesSent ? `Report a bug or suggest an idea · ${notesSent} sent` : "Report a bug or suggest an idea"} />
          <Chevron />
        </button>
        {admin && (
          <Link href="/more/notes" className={rowCls}>
            <Badge tone="bg-[#16204a] text-accent-soft"><InboxIcon /></Badge>
            <RowText title="Notes from the family" detail="Bugs and ideas everyone has sent" />
            <Chevron />
          </Link>
        )}
      </Group>

      <Group title="APP">
        <div className="flex min-h-14 items-center gap-3 px-4 py-2">
          <Badge tone="bg-[#13301f] text-good"><SyncIcon /></Badge>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-base font-bold">Sync</span>
            <span className="text-sm font-medium text-muted" role="status">
              {syncLine({ status, pending, total: sync.total, lastSynced: lastSynced ? new Date(lastSynced) : null })}
            </span>
            {sync.fraction !== null && <span className="mt-1.5 block"><SyncBar fraction={sync.fraction} /></span>}
          </span>
          <button
            type="button"
            className="display min-h-11 shrink-0 px-2 text-sm font-extrabold tracking-[0.08em] text-accent disabled:opacity-50"
            disabled={status === "syncing"}
            onClick={() => requestSync(0)}
          >
            {status === "syncing" ? "SYNCING…" : "SYNC"}
          </button>
        </div>
        {usage && (
          <div className="flex min-h-14 flex-col justify-center gap-1.5 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <Badge tone="bg-[#1d2645] text-accent"><SparkleIcon /></Badge>
              <span className="flex-1 text-base font-bold">AI this month</span>
              <span className="display num text-lg font-extrabold">
                ${usage.household_usd.toFixed(2)} <span className="text-sm font-bold text-muted">/ ${usage.cap_usd.toFixed(0)}</span>
              </span>
            </div>
            <div className="ml-11 h-1.5 overflow-hidden rounded-full bg-card-2" aria-hidden="true">
              <div
                className={`h-full rounded-full ${usage.household_usd >= usage.cap_usd * 0.8 ? "bg-warn" : "bg-primary"}`}
                style={{ width: `${Math.min(100, (usage.household_usd / Math.max(0.01, usage.cap_usd)) * 100)}%` }}
              />
            </div>
            <p className="ml-11 text-xs font-medium text-muted">
              {usage.configured
                ? `You: ${usage.my_requests} request${usage.my_requests === 1 ? "" : "s"}, $${usage.mine_usd.toFixed(2)}. Shared by the family, resets on the 1st.`
                : "AI isn't set up yet: it needs a Claude API key in Vercel."}
            </p>
          </div>
        )}
        <button type="button" className={`${rowCls} text-danger`} onClick={signOut}>
          <Badge tone="bg-[#3a1418] text-danger"><PowerIcon /></Badge>
          <span className="flex-1 text-base font-bold">Sign out</span>
        </button>
      </Group>

      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title="Note to developer">
        <NoteForm onDone={() => setNoteOpen(false)} />
      </Sheet>
    </main>
  );
}

/** Write a bug or idea. Saved on the phone and uploaded on the next sync, so it works offline too. */
function NoteForm({ onDone }: { onDone: () => void }) {
  const save = useSave();
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [sent, onDone]);

  if (sent) {
    return <p role="status" className="rounded-2xl bg-good/15 px-4 py-4 text-base font-bold text-good">✓ Sent. Thanks!</p>;
  }

  const body = text.trim();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body) return;
        await save("dev_notes", {
          id: newId(),
          body: body.slice(0, 2000),
          app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
          device: navigator.userAgent.slice(0, 300),
          created_at: nowIso(),
        });
        setSent(true);
      }}
    >
      <textarea
        className={`${field} h-36 py-3`}
        value={text}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
        placeholder="What happened, or what would make it better?"
        autoFocus
        aria-label="Your note"
      />
      <p className="-mt-1 text-xs font-medium text-muted">The app version and your phone model are attached, so bugs are easier to track down.</p>
      <button type="submit" className={btn.primary} disabled={!body}>Send note</button>
    </form>
  );
}
