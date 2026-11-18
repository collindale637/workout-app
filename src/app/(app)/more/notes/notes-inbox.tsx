"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/kit";
import { deviceLabel, useDevInbox, useIsAppAdmin } from "@/lib/dev-notes";

function when(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Notes from the family (admin only; the server refuses everyone else). */
export function NotesInbox() {
  const admin = useIsAppAdmin();
  const { notes, error, reload, setDone } = useDevInbox();
  const [tab, setTab] = useState<"new" | "done">("new");

  if (admin === false) {
    return (
      <main className="flex flex-col gap-4">
        <PageHeader title="Notes" back="/more" />
        <p className="text-base font-medium text-muted">This inbox is only for the app&apos;s developer.</p>
      </main>
    );
  }

  const open = notes?.filter((n) => !n.done_at) ?? [];
  const done = notes?.filter((n) => n.done_at) ?? [];
  const shown = tab === "new" ? open : done;

  return (
    <main className="flex flex-col gap-4">
      <PageHeader
        title="Notes from the family"
        back="/more"
        right={<button type="button" onClick={() => void reload()} className="display flex h-11 items-center px-2 text-sm font-extrabold tracking-[0.06em] text-accent">REFRESH</button>}
      />
      <div className="flex rounded-2xl bg-card-2 p-1" role="tablist">
        {(["new", "done"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`display h-11 flex-1 rounded-xl text-base font-extrabold tracking-[0.06em] ${tab === t ? "bg-primary text-white" : "text-muted"}`}
          >
            {t === "new" ? `NEW${notes ? ` · ${open.length}` : ""}` : `DONE${notes ? ` · ${done.length}` : ""}`}
          </button>
        ))}
      </div>

      {error && <p className="rounded-2xl bg-card px-4 py-3 text-sm font-semibold text-warn">{error}</p>}
      {notes === null && !error && <p className="text-sm font-medium text-muted">Loading…</p>}
      {notes && shown.length === 0 && (
        <p className="rounded-3xl border border-dashed border-line px-5 py-8 text-center text-base font-medium text-muted">
          {tab === "new" ? "Nothing new. You're all caught up." : "Nothing marked done yet."}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {shown.map((n) => (
          <li key={n.id} className="flex flex-col gap-2 rounded-3xl border border-line bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-bold">{n.sender}</span>
              <span className="shrink-0 text-xs font-semibold text-muted">{when(n.created_at)}</span>
            </div>
            <p className="text-[15px] leading-snug font-medium whitespace-pre-wrap">{n.body}</p>
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-xs font-semibold text-muted">
                {[deviceLabel(n.device), n.app_version ? `v ${n.app_version}` : ""].filter(Boolean).join(" · ")}
              </span>
              <button
                type="button"
                onClick={() => void setDone(n.id, !n.done_at)}
                className={`display min-h-11 shrink-0 rounded-full px-4 text-sm font-extrabold tracking-[0.06em] ${n.done_at ? "text-muted" : "bg-primary/15 text-accent-soft"}`}
              >
                {n.done_at ? "↶ REOPEN" : "✓ DONE"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
