"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData, useProfile } from "@/lib/db/provider";
import { useActiveGym, useOpenWorkout } from "@/lib/hooks";
import { useHistory } from "@/lib/history";
import { useWeeklyTarget } from "@/lib/smart";
import { useNow } from "@/lib/use-now";
import { useCardioTimer } from "@/lib/cardio-timer";
import { cardioElapsedSec, cardioLabel } from "@/lib/cardio";
import { formatDuration } from "@/lib/units";
import { dateKey } from "@/lib/progress";
import { GymSwitcher } from "@/components/gym-switcher";
import { WeighInCard } from "@/components/weigh-in-card";
import { doneDisc } from "@/components/ui/kit";
import { QuickCardio } from "./quick-cardio";
import { TodayCardio } from "./today-cardio";
import { SyncBadge } from "@/components/sync-badge";
import { UpNextCard } from "./up-next-card";
import { DoneTodayCard, useDoneToday, useTrainAgain } from "./done-today-card";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const noop = () => () => {};

/** Today's date as a stable string; null while prerendering so the shell stays static. */
function useTodayKey() {
  return useSyncExternalStore(noop, () => new Date().toDateString(), () => null);
}

export function TodayScreen() {
  const { profile } = useProfile();
  const todayKey = useTodayKey();
  const open = useOpenWorkout();
  const history = useHistory(60);
  const { gyms } = useActiveGym();
  const firstName = profile?.display_name?.split(" ")[0];

  const week = useMemo(() => {
    if (!todayKey) return { days: DAY_LETTERS.map((letter) => ({ letter, date: "", isToday: false, done: false })), label: "", doneCount: 0 };
    const today = new Date(todayKey);
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    const doneDays = new Set((history ?? []).map((h) => new Date(h.at).toDateString()));
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { date: String(d.getDate()), isToday: d.toDateString() === todayKey, letter: DAY_LETTERS[i], done: doneDays.has(d.toDateString()) };
    });
    const label = today.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).replace(",", " ·").toUpperCase();
    return { days, label, doneCount: days.filter((d) => d.done).length };
  }, [todayKey, history]);

  const doneToday = useDoneToday();
  const trainAgain = useTrainAgain();
  const weeklyTarget = useWeeklyTarget(profile?.days_per_week);

  // Below the workout card: quick cardio and the gym nudge.
  const rest = (
    <>
      <QuickCardio />
      {gyms.length === 0 && (
        <Link href="/more/gyms/edit?new=1" className="rounded-3xl border-2 border-dashed border-accent-strong/60 p-4 text-base font-bold text-accent">
          + Set up your gym so exercise lists match your equipment
        </Link>
      )}
    </>
  );

  return (
    <main className="mt-4 flex flex-col gap-4">
      <header className="flex h-11 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-xs font-bold tracking-[0.1em] text-muted">{week.label}</span>
          <span className="display truncate text-2xl leading-none font-extrabold">{firstName ? `Hey, ${firstName}` : "Hey there"}</span>
        </div>
        <GymSwitcher />
      </header>

      <SyncBadge />

      <section aria-label="This week" className="flex flex-col gap-2">
        <div className="flex justify-between text-xs font-bold tracking-[0.1em] text-muted">
          <span>THIS WEEK</span>
          <span>
            {week.doneCount} OF {weeklyTarget} DONE
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {week.days.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className={`text-xs font-bold ${d.isToday ? "text-accent" : "text-muted"}`}>{d.letter}</span>
              <span
                className={`display flex h-10 w-10 items-center justify-center rounded-full text-base ${
                  d.done ? doneDisc : d.isToday ? "border-[3px] border-accent-strong font-extrabold text-accent-soft" : "bg-card-2 font-bold text-muted"
                } ${d.done && d.isToday ? "ring-[3px] ring-accent-strong ring-offset-2 ring-offset-bg" : ""}`}
                aria-label={d.done ? "Trained" : undefined}
              >
                {d.done ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                ) : (
                  d.date
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <WeighInCard today={todayKey ? dateKey(new Date(todayKey)) : null} />

      <TodayCardio />
      <CardioTimerBanner />

      {open ? (
        <>
          <InProgressCard workoutId={open.id} name={open.name} startedAt={open.started_at} />
          {rest}
        </>
      ) : doneToday === undefined ? (
        rest
      ) : doneToday && !trainAgain.on ? (
        <>
          <DoneTodayCard workoutId={doneToday.id} trainAgain={trainAgain.on} onTrainAgain={() => void trainAgain.set()} />
          {rest}
        </>
      ) : (
        <>
          {doneToday && <DoneTodayCard workoutId={doneToday.id} trainAgain={trainAgain.on} onTrainAgain={() => void trainAgain.set()} />}
          {/* The exercise list and everything below it live in the card's sheet. */}
          <UpNextCard hasGym={gyms.length > 0}>{rest}</UpNextCard>
        </>
      )}
    </main>
  );
}

/** Shows while a cardio timer is going, so it can't get lost when you leave the screen. */
function CardioTimerBanner() {
  const { timer } = useCardioTimer();
  const now = useNow(1000);
  // Quick cardio has its own card (TodayCardio); this banner is for a timer running inside a workout.
  if (!timer?.workoutId) return null;
  return (
    <Link href="/workout" className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border-2 border-accent-strong bg-primary/15 px-4 py-2">
      <span className="flex min-w-0 flex-col">
        <span className="text-xs font-bold tracking-[0.1em] text-accent-soft">{timer.stoppedAt ? "CARDIO · ENTER RESULTS" : "CARDIO RUNNING"}</span>
        <span className="display truncate text-xl font-extrabold">{cardioLabel(timer.type)}</span>
      </span>
      <span className="display num text-3xl font-extrabold">{formatDuration(cardioElapsedSec(timer, now))}</span>
    </Link>
  );
}

function InProgressCard({ workoutId, name, startedAt }: { workoutId: string; name: string | null; startedAt: string }) {
  const { db } = useData();
  const now = useNow(1000);
  const count = useLiveQuery(async () => {
    const wexs = await db.workout_exercises.where("workout_id").equals(workoutId).toArray();
    const sets = await db.sets.where("workout_exercise_id").anyOf(wexs.map((w) => w.id)).count();
    return { exercises: wexs.length, sets };
  }, [db, workoutId]);
  return (
    <section className="flex flex-col gap-3 rounded-[28px] bg-primary p-5 text-white">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold tracking-[0.12em] text-[#DCE4FF]">IN PROGRESS</span>
        <span className="display num text-lg font-extrabold">{formatDuration((now - new Date(startedAt).getTime()) / 1000)}</span>
      </div>
      <h1 className="display text-[56px] leading-[0.85] font-extrabold tracking-[-0.02em]">{name ?? "Workout"}</h1>
      <p className="text-[15px] font-semibold text-[#DCE4FF]">{count ? `${count.exercises} exercises · ${count.sets} sets logged` : " "}</p>
      <Link href="/workout" className="display flex h-[52px] items-center justify-center gap-2.5 rounded-full bg-white text-xl font-extrabold tracking-[0.08em] text-primary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>
        Resume
      </Link>
    </section>
  );
}
