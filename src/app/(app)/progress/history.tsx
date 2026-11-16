"use client";

import Link from "next/link";
import { useProfile } from "@/lib/db/provider";
import { useCatalog } from "@/lib/hooks";
import { useHistory } from "@/lib/history";
import { cardioLabel } from "@/lib/cardio";
import { distanceUnit, formatDuration, toDisplayDistance, weightUnit } from "@/lib/units";
import { Empty, btn } from "@/components/ui/kit";
import { GymSwitcher } from "@/components/gym-switcher";

export function History() {
  const items = useHistory();
  const catalog = useCatalog();
  const { profile } = useProfile();
  const units = profile?.units ?? "lb";

  const byMonth = new Map<string, NonNullable<typeof items>>();
  for (const it of items ?? []) {
    const key = new Date(it.at).toLocaleDateString([], { month: "long", year: "numeric" });
    byMonth.set(key, [...(byMonth.get(key) ?? []), it]);
  }

  return (
    <main className="mt-2 flex flex-col gap-4">
      <header className="flex h-11 items-center justify-between">
        <h1 className="display text-4xl font-extrabold">Progress</h1>
        <GymSwitcher />
      </header>
      <p className="-mt-2 text-sm font-medium text-muted">Charts and PRs arrive in Phase 4. For now, here&apos;s everything you&apos;ve logged.</p>
      <div className="grid grid-cols-2 gap-2">
        <Link href="/workout" className={btn.secondary}>+ Workout</Link>
        <Link href="/cardio" className={btn.secondary}>+ Cardio</Link>
      </div>
      {items && items.length === 0 && <Empty>Nothing logged yet. Your workouts and cardio will show up here.</Empty>}
      {[...byMonth.entries()].map(([month, list]) => (
        <section key={month} className="flex flex-col gap-2">
          <h2 className="text-xs font-bold tracking-[0.1em] text-muted">{month.toUpperCase()}</h2>
          <ul className="flex flex-col gap-2">
            {list.map((it) => {
              const date = new Date(it.at);
              const day = (
                <div className="flex w-12 shrink-0 flex-col items-center">
                  <span className="text-xs font-bold text-muted">{date.toLocaleDateString([], { weekday: "short" }).toUpperCase()}</span>
                  <span className="display num text-3xl leading-none font-extrabold">{date.getDate()}</span>
                </div>
              );
              if (it.kind === "cardio") {
                const c = it.cardio;
                return (
                  <li key={`c-${c.id}`}>
                    <Link href={`/progress/session?cardio=${c.id}`} className="flex min-h-18 items-center gap-3 rounded-2xl border border-line bg-card px-3 py-3">
                      {day}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-bold">{cardioLabel(c.type)}</div>
                        <div className="truncate text-sm font-medium text-muted">
                          {formatDuration(c.duration_sec)}{c.distance ? ` · ${toDisplayDistance(c.distance, units)} ${distanceUnit(units)}` : ""}{c.rpe ? ` · RPE ${c.rpe}` : ""}
                        </div>
                      </div>
                      <span className="display rounded-full bg-good/15 px-2 py-0.5 text-xs font-extrabold tracking-[0.08em] text-good">CARDIO</span>
                    </Link>
                  </li>
                );
              }
              const names = it.exerciseIds.slice(0, 3).map((id) => catalog?.byId.get(id)?.name ?? "").filter(Boolean);
              return (
                <li key={it.workout.id}>
                  <Link href={`/progress/session?id=${it.workout.id}`} className="flex min-h-18 items-center gap-3 rounded-2xl border border-line bg-card px-3 py-3">
                    {day}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-bold">{it.workout.name ?? names[0] ?? "Workout"}</div>
                      <div className="truncate text-sm font-medium text-muted">
                        {formatDuration(it.durationSec)} · {it.sets} sets · {Math.round(units === "kg" ? it.volume / 2.2046 : it.volume).toLocaleString()} {weightUnit(units)}
                        {it.cardio.length ? ` · + ${it.cardio.map((c) => cardioLabel(c.type)).join(", ")}` : ""}
                      </div>
                      {names.length > 0 && <div className="truncate text-xs font-medium text-muted/80">{names.join(" · ")}{it.exerciseIds.length > 3 ? ` +${it.exerciseIds.length - 3}` : ""}</div>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
