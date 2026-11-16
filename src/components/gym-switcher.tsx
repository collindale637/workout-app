"use client";

import Link from "next/link";
import { useState } from "react";
import { useProfile } from "@/lib/db/provider";
import { useActiveGym } from "@/lib/hooks";
import { Sheet, btn } from "@/components/ui/kit";

/** The active-gym pill from the design. Tap to switch gyms. */
export function GymSwitcher() {
  const { gyms, gym } = useActiveGym();
  const { save } = useProfile();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="display flex h-10 max-w-[45vw] items-center gap-1.5 rounded-full border-2 border-accent-strong/70 bg-card px-3.5 text-[15px] font-bold tracking-[0.06em] text-accent-soft"
        aria-label={gym ? `Active gym: ${gym.name}. Change gym` : "Set up a gym"}
      >
        <span className="truncate">{gym ? gym.name : "No gym yet"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Where are you training?">
        <ul className="flex flex-col gap-2">
          {gyms.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={async () => {
                  await save({ active_gym_id: g.id });
                  setOpen(false);
                }}
                className={`flex min-h-14 w-full items-center justify-between rounded-2xl border-2 px-4 text-left text-lg font-bold ${
                  g.id === gym?.id ? "border-accent-strong bg-primary/15 text-accent-soft" : "border-line bg-card-2"
                }`}
              >
                {g.name}
                {g.id === gym?.id && <span className="display text-sm font-extrabold tracking-[0.08em]">Here now</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href="/more/gyms/edit?new=1" className={btn.secondary} onClick={() => setOpen(false)}>+ Add gym</Link>
          <Link href="/more/gyms" className={btn.secondary} onClick={() => setOpen(false)}>Edit gyms</Link>
        </div>
      </Sheet>
    </>
  );
}
