"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData, useProfile } from "@/lib/db/provider";
import { useActiveGym, useCatalog, useOpenWorkout } from "@/lib/hooks";
import { useHistory } from "@/lib/history";
import { useNow } from "@/lib/use-now";
import { useCardioTimer } from "@/lib/cardio-timer";
import { cardioElapsedSec, cardioLabel, cardioSummary } from "@/lib/cardio";
import { formatDuration, formatWeight } from "@/lib/units";
import { dateKey } from "@/lib/progress";
import { GymSwitcher } from "@/components/gym-switcher";
import { WeighInCard } from "@/components/weigh-in-card";
import { QuickCardio } from "./quick-cardio";
import { SyncBadge } from "@/components/sync-badge";
import { UpNextCard } from "./up-next-card";

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

  const lastWorkout = history?.find((h) => h.kind === "workout");

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
            {week.doneCount} OF {profile?.days_per_week ?? 4} DONE
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {week.days.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className={`text-xs font-bold ${d.isToday ? "text-accent" : "text-muted"}`}>{d.letter}</span>
              <span
                className={`display flex h-10 w-10 items-center justify-center rounded-full text-base ${
                  d.done ? "bg-primary font-extrabold text-white" : d.isToday ? "border-[3px] border-accent-strong font-extrabold text-accent-soft" : "bg-card-2 font-bold text-muted"
                } ${d.done && d.isToday ? "ring-[3px] ring-accent-strong ring-offset-2 ring-offset-bg" : ""}`}
                aria-label={d.done ? "Trained" : undefined}
              >
                {d.done ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                ) : (
                  d.date
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <WeighInCard today={todayKey ? dateKey(new Date(todayKey)) : null} />

      <CardioTimerBanner />

      {open ? <InProgressCard workoutId={open.id} name={open.name} startedAt={open.started_at} /> : <UpNextCard hasGym={gyms.length > 0} />}

      <QuickCardio />

      {lastWorkout?.kind === "workout" && !open && <LastWorkout item={lastWorkout} />}

      {gyms.length === 0 && (
        <Link href="/more/gyms/edit?new=1" className="rounded-3xl border-2 border-dashed border-accent-strong/60 p-4 text-base font-bold text-accent">
          + Set up your gym so exercise lists match your equipment
        </Link>
      )}
    </main>
  );
}

/** Shows while a cardio timer is going, so it can't get lost when you leave the screen. */
function CardioTimerBanner() {
  const { timer } = useCardioTimer();
  const now = useNow(1000);
  if (!timer) return null;
  return (
    <Link href={timer.workoutId ? "/workout" : "/cardio"} className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border-2 border-accent-strong bg-primary/15 px-4 py-2">
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

function LastWorkout({ item }: { item: Extract<NonNullable<ReturnType<typeof useHistory>>[number], { kind: "workout" }> }) {
  const { db } = useData();
  const { profile } = useProfile();
  const catalog = useCatalog();
  const units = profile?.units ?? "lb";
  const rows = useLiveQuery(async () => {
    const wexs = await db.workout_exercises.where("workout_id").equals(item.workout.id).sortBy("sort_order");
    const sets = await db.sets.where("workout_exercise_id").anyOf(wexs.map((w) => w.id)).toArray();
    const cardio = await db.cardio_sessions.where("workout_id").equals(item.workout.id).toArray();
    return wexs.map((w) => {
      const session = cardio.find((c) => c.workout_exercise_id === w.id);
      if (session) return { id: w.id, exerciseId: w.exercise_id, cardio: cardioSummary(session, units), sets: 0, reps: "", top: null as number | null };
      const ws = sets.filter((s) => s.workout_exercise_id === w.id && s.type !== "warmup");
      const top = ws.reduce<number | null>((m, s) => (s.weight !== null && (m === null || s.weight > m) ? s.weight : m), null);
      const reps = ws.map((s) => s.reps ?? 0);
      return { id: w.id, exerciseId: w.exercise_id, cardio: null as string | null, sets: ws.length, reps: reps.length ? `${Math.min(...reps)}${Math.min(...reps) !== Math.max(...reps) ? `–${Math.max(...reps)}` : ""}` : "—", top };
    });
  }, [db, item.workout.id, units]);
  if (!rows || !catalog) return null;
  return (
    <section className="flex flex-col">
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="display text-xl font-extrabold">Last time · {item.workout.name ?? new Date(item.at).toLocaleDateString([], { weekday: "short" })}</h2>
        <Link href={`/workout?repeat=${item.workout.id}`} className="display text-sm font-extrabold tracking-[0.06em] text-accent">Repeat →</Link>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="flex min-h-13 items-center justify-between gap-3">
            <span className="truncate text-base font-bold">{catalog.byId.get(r.exerciseId)?.name ?? r.exerciseId}</span>
            <span className="display num shrink-0 text-base font-bold text-muted">
              {r.cardio ? (
                <span className="text-ink">{r.cardio}</span>
              ) : (
                <>
                  {r.sets}×{r.reps} · <span className="text-ink">{formatWeight(r.top, units)}</span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
