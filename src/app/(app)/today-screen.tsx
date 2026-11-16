"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { useProfile } from "@/lib/profile";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

const noop = () => () => {};
/** Today's date as a stable string; null while prerendering so the shell stays static. */
function useTodayKey() {
  return useSyncExternalStore(noop, () => new Date().toDateString(), () => null);
}

function useThisWeek() {
  const todayKey = useTodayKey();
  return useMemo(() => {
    if (!todayKey) {
      return { days: DAY_LETTERS.map((letter) => ({ letter, date: "", isToday: false })), label: "" };
    }
    const today = new Date(todayKey);
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { date: String(d.getDate()), isToday: d.toDateString() === todayKey, letter: DAY_LETTERS[i] };
    });
    const label = today
      .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
      .replace(",", " ·")
      .toUpperCase();
    return { days, label };
  }, [todayKey]);
}

export function TodayScreen() {
  const { state } = useProfile();
  const { days, label } = useThisWeek();
  const profile = state.status === "ready" ? state.profile : null;
  const firstName = profile?.display_name?.split(" ")[0];
  const hasProfile = Boolean(profile?.display_name);

  return (
    <main className="flex flex-col gap-4 pt-2">
      <header className="flex h-11 items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-bold tracking-[0.1em] text-muted">
            {label}
          </span>
          <span className="display text-2xl font-extrabold leading-none">
            {firstName ? `Hey, ${firstName}` : "Hey there"}
          </span>
        </div>
        <span className="display flex h-10 items-center gap-1.5 rounded-full border-2 border-accent-strong/70 bg-card px-3.5 text-[15px] font-bold tracking-[0.06em] text-accent-soft">
          No gym yet
        </span>
      </header>

      <section aria-label="This week" className="flex flex-col gap-2">
        <div className="flex justify-between text-xs font-bold tracking-[0.1em] text-muted">
          <span>THIS WEEK</span>
          <span>0 DONE</span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className={`text-xs font-bold ${d.isToday ? "text-accent" : "text-muted"}`}>{d.letter}</span>
              <span
               
                className={`display flex h-10 w-10 items-center justify-center rounded-full text-base ${
                  d.isToday ? "border-[3px] border-accent-strong font-extrabold text-accent-soft" : "bg-card-2 font-bold text-muted"
                }`}
              >
                {d.date}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-[28px] bg-primary p-5 text-white">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold tracking-[0.12em] text-[#DCE4FF]">UP NEXT</span>
          <span className="text-[13px] font-semibold text-[#DCE4FF]">Phase 0 · foundation</span>
        </div>
        <h1 className="display text-[64px] font-extrabold leading-[0.85] tracking-[-0.02em]">No plan yet</h1>
        <p className="text-[15px] font-medium text-[#DCE4FF]">
          Set up your gym and pick a split, and your first workout shows up here.
        </p>
        <div className="mt-1 flex gap-2">
          <button
            disabled
            className="display flex h-[52px] flex-1 items-center justify-center gap-2.5 rounded-full bg-white text-xl font-extrabold tracking-[0.08em] text-primary opacity-60"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>
            Start
          </button>
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-white/60" aria-label="Customize with AI (coming in Phase 3)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.25" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
          </span>
        </div>
      </section>

      <section className="flex flex-col">
        <div className="flex items-baseline justify-between pb-2">
          <h2 className="display text-xl font-extrabold">Getting set up</h2>
        </div>
        <ul className="flex flex-col divide-y divide-line rounded-3xl border border-line bg-card">
          <SetupRow done label="Signed in" detail="Invite-only family account" />
          <SetupRow done={hasProfile} label="Your profile" detail="Name, goal, units, default RPE" href="/more" />
          <SetupRow label="Your gyms" detail="Home, main gym, travel — with equipment" phase="Phase 1" />
          <SetupRow label="Your plan" detail="Pick a split and goal" phase="Phase 2" />
        </ul>
        {state.status === "error" && (
          <p className="mt-3 text-sm font-semibold text-warn">Couldn&apos;t load your profile: {state.message}</p>
        )}
      </section>
    </main>
  );
}

function SetupRow({ label, detail, done, href, phase }: { label: string; detail: string; done?: boolean; href?: string; phase?: string }) {
  const body = (
    <div className="flex min-h-16 items-center gap-3 px-4 py-3">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done ? "bg-primary" : "border-2 border-line"}`}
        aria-label={done ? "Done" : "Not done"}
      >
        {done && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-base font-bold">{label}</div>
        <div className="text-sm font-medium text-muted">{detail}</div>
      </div>
      {phase ? (
        <span className="display text-xs font-bold tracking-[0.08em] text-muted">{phase}</span>
      ) : href && !done ? (
        <span className="display text-sm font-extrabold tracking-[0.06em] text-accent">Set up →</span>
      ) : null}
    </div>
  );
  return <li>{href ? <Link href={href}>{body}</Link> : body}</li>;
}
