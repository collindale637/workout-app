"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/db/provider";
import { useActiveGym, useCatalog } from "@/lib/hooks";
import { useWorkoutActions } from "@/lib/workout";
import { suggestionFor, useGeneratorInputs, useLastSets, useStartingProfile } from "@/lib/smart";
import { formatWait, groupReadiness, READY_AVG } from "@/lib/readiness";
import { pickAlternative } from "@/lib/today-alt";
import { useUpNext, useUpNextChoice } from "@/lib/up-next";
import { doseLabel, suggestionLabel, supersetLetter } from "@/components/planned";
import { MuscleChooser } from "@/components/muscle-chooser";
import { Sheet, btn } from "@/components/ui/kit";
import { ExerciseInfo } from "@/components/exercise-info";
import { AiWorkoutSheet, Sparkle } from "@/components/ai";

/** Today's suggested workout: the next plan day, your freshest muscles, or muscles you picked. */
export function UpNextCard({ hasGym }: { hasGym: boolean }) {
  const router = useRouter();
  const up = useUpNext();
  const catalog = useCatalog();
  const { profile } = useProfile();
  const { gym, equipment, equipmentRows } = useActiveGym();
  const { choice, setChoice } = useUpNextChoice();
  const { start } = useWorkoutActions();
  const lastSets = useLastSets((up?.items ?? []).map((i) => i.exercise_id));
  const who = useStartingProfile();
  const [options, setOptions] = useState(false);
  const [pickMuscles, setPickMuscles] = useState(false);
  const [starting, setStarting] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [showSwaps, setShowSwaps] = useState(false);
  const { recovery } = useGeneratorInputs();

  if (up === undefined || !catalog || !profile) {
    return <section className="h-[300px] animate-pulse rounded-[28px] bg-primary/40" aria-label="Loading today's workout" />;
  }
  if (up === null) return <StartCard hasGym={hasGym} />;

  const units = profile.units;
  const seed = choice?.seed ?? 0;
  const regenerate = () => setChoice({ mode: up.mode, dayId: up.day?.id ?? null, muscles: choice?.muscles, seed: seed + 1, via: choice?.via, light: choice?.light });

  // Readiness of today's muscles (Part 2.1), with the same rule as the Recovery tab.
  const tau = new Map(catalog.muscles.map((m) => [m.id, m.recovery_tau_hours]));
  const readinessOf = (n: string, muscles: string[]) => (recovery ? groupReadiness({ name: n, muscles }, recovery.map, tau) : null);
  const rd = up.targets.length ? readinessOf(up.title, up.targets) : null;
  const lowest =
    rd && !rd.ready && recovery
      ? up.targets.flatMap((m) => (recovery.map.get(m) ? [recovery.map.get(m)!] : [])).sort((a, b) => a.score - b.score).slice(0, 2)
      : [];

  // One Switch when the plan day isn't ready (Part 2.2): a later ready day, or a lighter version of this one.
  const switched = choice?.via === "switch" && up.mode === "plan";
  const switchedDay = switched && !choice?.light;
  const planned = up.plan ? (switchedDay ? up.plan.nextDay : up.day) : null;
  const undo = () => setChoice({ mode: "plan", seed: 0 });
  const switchRow: null | { text: React.ReactNode; label: "Switch" | "Undo"; onPress: () => void } = (() => {
    if (up.mode !== "plan" || !up.plan || !planned || !recovery) return null;
    if (switchedDay) return { text: <>{planned.name} stays next in your plan.</>, label: "Undo", onPress: undo };
    if (switched) return { text: <>Lighter {planned.name}: 2 sets per lift, about {up.light?.minutes ?? profile.session_minutes} min.</>, label: "Undo", onPress: undo };
    if (!rd || rd.ready) return null;
    const alt = pickAlternative(up.plan.days, planned.id, (d) => readinessOf(d.name, d.target_muscle_ids) ?? { ready: false });
    if (alt.kind === "day") {
      const score = readinessOf(alt.day.name, alt.day.target_muscle_ids)?.score ?? 0;
      return {
        text: (
          <>
            <b className="font-extrabold">{alt.day.name} is ready ({score}%).</b> Train it today, {planned.name} next.
          </>
        ),
        label: "Switch",
        onPress: () => setChoice({ mode: "plan", dayId: alt.day.id, seed: 0, via: "switch" }),
      };
    }
    return {
      text: (
        <>
          <b className="font-extrabold">Nothing in your plan is ready.</b> Go lighter: 2 sets per lift.
        </>
      ),
      label: "Switch",
      onPress: () => setChoice({ mode: "plan", dayId: planned.id, seed: 0, light: true, via: "switch" }),
    };
  })();
  const startAnyway = rd !== null && !rd.ready && !switched;

  async function go() {
    if (!up || !up.items.length) return;
    setStarting(true);
    // A switched-in day starts outside the plan's order, so the planned day stays next.
    await start({ items: up.items, name: up.title, gymId: gym?.id ?? null, planDayId: switchedDay ? null : (up.day?.id ?? null), source: up.source });
    router.push("/workout");
  }

  const swapped = up.swaps.filter((s) => s.to);
  const dropped = up.swaps.filter((s) => !s.to);
  const wasFrom = new Map(swapped.map((s) => [s.to!, s.from]));
  const name = (id: string) => catalog.byId.get(id)?.name ?? id;

  return (
    <>
      <section className="flex flex-col gap-3 rounded-[28px] bg-primary p-5 text-white">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold tracking-[0.12em] text-[#DCE4FF]">
            UP NEXT{up.light ? " · LIGHTER" : up.mode === "fresh" ? " · FRESH MUSCLES" : up.mode === "muscles" ? " · YOUR PICK" : up.mode === "ai" ? " · AI" : ""}
          </span>
          <button type="button" onClick={() => setOptions(true)} className="display -mr-1 min-h-11 rounded-full px-3 text-sm font-extrabold tracking-[0.08em] text-[#DCE4FF]">
            Change
          </button>
        </div>
        <h1 className="display text-[56px] leading-[0.85] font-extrabold tracking-[-0.02em] break-words">{up.title}</h1>
        <p className="-mt-1 text-[15px] font-semibold text-[#DCE4FF]">{up.subtitle}</p>
        {rd && (
          <div className="flex flex-col gap-1.5 rounded-2xl bg-black/20 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold tracking-[0.12em] text-[#DCE4FF]">READINESS</span>
              <span className={`display text-sm font-extrabold ${rd.ready ? "text-[#C9F7DA]" : "text-[#FFD2B3]"}`}>
                {rd.ready ? "Ready" : `Ready in ${formatWait(rd.hoursToReady)}`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative h-2 flex-1 rounded-full bg-white/20" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rd.score} aria-label="Readiness">
                <div className={`h-full rounded-full ${rd.ready ? "bg-good" : "bg-warn"}`} style={{ width: `${Math.min(100, rd.score)}%` }} />
                <span className="absolute -top-0.5 h-3 w-0.5 bg-white" style={{ left: `${READY_AVG}%` }} aria-hidden="true" />
              </div>
              <span className="display num w-11 text-right text-xl font-extrabold">{rd.score}%</span>
            </div>
            {lowest.length > 0 && (
              <p className="text-sm font-semibold text-[#DCE4FF]">
                Lowest: {lowest.map((r) => `${catalog.muscleName.get(r.muscleId) ?? r.muscleId} ${Math.round(r.score)}%`).join(" · ")}
              </p>
            )}
          </div>
        )}
        {switchRow && (
          <div className="flex min-h-14 items-center gap-3 rounded-2xl bg-white/15 py-1.5 pr-1.5 pl-3">
            <p className="min-w-0 flex-1 text-sm leading-tight font-semibold">{switchRow.text}</p>
            <button
              type="button"
              onClick={() => void switchRow.onPress()}
              className={`display h-11 shrink-0 rounded-xl px-4 text-base font-extrabold ${switchRow.label === "Switch" ? "bg-white text-primary" : "border-2 border-white/60 text-white"}`}
            >
              {switchRow.label}
            </button>
          </div>
        )}
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={go}
            disabled={starting || !up.items.length}
            className={`display flex h-[52px] flex-1 items-center justify-center gap-2.5 rounded-full text-xl font-extrabold tracking-[0.08em] disabled:opacity-60 ${
              startAnyway ? "border-2 border-white/70 text-white" : "bg-white text-primary"
            }`}
          >
            {!startAnyway && <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>}
            {starting ? "Starting…" : startAnyway ? "Start anyway" : "Start"}
          </button>
          {up.mode !== "ai" && (
            <button
              type="button"
              onClick={regenerate}
              aria-label="Regenerate"
              title="Regenerate"
              className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-white/70"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            aria-label="Customize with AI"
            title="Customize with AI"
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-white/70 text-white"
          >
            <Sparkle size={22} />
          </button>
        </div>
      </section>

      <section className="flex flex-col">
        <div className="flex items-baseline justify-between pb-1">
          <h2 className="display text-xl font-extrabold">
            {up.items.length} exercise{up.items.length === 1 ? "" : "s"} · ~{up.light?.minutes ?? profile.session_minutes} min
          </h2>
          {up.swaps.length > 0 ? (
            <button type="button" aria-pressed={showSwaps} className="display min-h-11 text-sm font-extrabold text-accent" onClick={() => setShowSwaps(!showSwaps)}>
              {showSwaps ? "⇄ Hide swaps" : `⇄ ${up.swaps.length} swapped`}
            </button>
          ) : up.mode === "plan" ? (
            <button type="button" className="display min-h-11 text-sm font-extrabold tracking-[0.06em] text-accent" onClick={() => setChoice({ mode: "fresh", seed: 0 })}>
              Fresh muscles only
            </button>
          ) : up.plan ? (
            <button type="button" className="display min-h-11 text-sm font-extrabold tracking-[0.06em] text-accent" onClick={() => setChoice({ mode: "plan", seed: 0 })}>
              Back to my plan
            </button>
          ) : (
            <Link href="/plan" className="display flex min-h-11 items-center text-sm font-extrabold tracking-[0.06em] text-accent">Set up a plan →</Link>
          )}
        </div>
        {up.items.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line px-5 py-6 text-center text-base font-medium text-muted">
            Nothing at {gym?.name ?? "this gym"} trains these muscles. Tap Change to pick others, or add equipment under More → Gyms.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {up.items.map((it, i) => {
              const s =
                catalog.byId.get(it.exercise_id)?.category === "cardio"
                  ? undefined
                  : suggestionFor(catalog, it.exercise_id, lastSets?.get(it.exercise_id), it.rep_min, it.rep_max, gym ? equipmentRows : null, who);
              const sLabel = suggestionLabel(s, units);
              return (
                <li key={`${it.exercise_id}-${i}`}>
                  <button
                    type="button"
                    onClick={() => setViewing(it.exercise_id)}
                    aria-label={`View ${name(it.exercise_id)}`}
                    className="flex min-h-14 w-full items-center justify-between gap-3 py-1.5 text-left active:opacity-70"
                  >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-base font-bold">
                      {it.superset_group !== null && <span className="mr-1.5 text-accent">{supersetLetter(it.superset_group)}</span>}
                      {name(it.exercise_id)}
                    </span>
                    <span className="text-sm font-medium text-muted">
                      {doseLabel(catalog, it)}
                      {showSwaps && wasFrom.has(it.exercise_id) && <span className="text-accent-soft"> · ⇄ was {name(wasFrom.get(it.exercise_id)!)}</span>}
                    </span>
                  </span>
                  {sLabel &&
                    (s?.change === "new" ? (
                      <span className="shrink-0 text-sm font-semibold text-muted" title="First time: find a comfortable working weight">{sLabel}</span>
                    ) : (
                      <span className={`display num shrink-0 text-base font-extrabold ${s?.change === "up" ? "text-good" : "text-ink"}`}>{sLabel}</span>
                    ))}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {showSwaps && dropped.length > 0 && (
          <p className="pt-2 text-sm font-medium text-muted">Not available at {gym?.name ?? "this gym"}: {dropped.map((s) => name(s.from)).join(", ")}</p>
        )}
      </section>

      <Sheet open={viewing !== null} onClose={() => setViewing(null)} title={viewing ? name(viewing) : undefined}>
        {viewing && <ExerciseInfo catalog={catalog} id={viewing} gymEquipment={gym ? equipment : null} gymName={gym?.name} />}
      </Sheet>

      <Sheet open={options} onClose={() => setOptions(false)} title="What to train today">
        <div className="flex flex-col gap-2">
          {up.plan && (
            <div className="flex flex-col gap-2 rounded-2xl bg-card-2 p-3">
              <span className="text-sm font-bold text-muted">{up.plan.plan.name}</span>
              <div className="flex flex-wrap gap-2">
                {up.plan.days.map((d) => {
                  const on = up.mode === "plan" && up.day?.id === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={async () => {
                        await setChoice({ mode: "plan", dayId: d.id, seed: 0 });
                        setOptions(false);
                      }}
                      className={`min-h-11 rounded-2xl border-2 px-3 text-sm font-bold ${on ? "border-accent-strong bg-primary/15 text-accent-soft" : "border-line bg-card"}`}
                    >
                      {d.day_order}. {d.name}
                      {up.plan?.nextDay?.id === d.id ? " · next" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <button type="button" className={btn.secondary} onClick={async () => { await setChoice({ mode: "fresh", seed: 0 }); setOptions(false); }}>
            Target fresh muscles
          </button>
          <button type="button" className={btn.secondary} onClick={() => { setOptions(false); setPickMuscles(true); }}>
            Pick muscles…
          </button>
          <button type="button" className={btn.secondary} onClick={() => { setOptions(false); setAiOpen(true); }}>
            <Sparkle /> Customize with AI…
          </button>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/workout" className={btn.secondary} onClick={() => setOptions(false)}>Build your own</Link>
            <Link href="/cardio" className={btn.secondary} onClick={() => setOptions(false)}>Log cardio</Link>
          </div>
          {!up.plan && (
            <Link href="/plan" className={btn.ghost} onClick={() => setOptions(false)}>Set up a plan →</Link>
          )}
        </div>
      </Sheet>

      {aiOpen && (
        <AiWorkoutSheet
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          kind="workout"
          title="Customize with AI"
          intro={`Tell Claude what you want today. It starts from "${up.title}" and only uses what ${gym?.name ?? "your gym"} has.`}
          current={{ name: up.title, items: up.items }}
          actions={[
            {
              label: "Use for today",
              primary: true,
              run: async (w) => {
                await setChoice({ mode: "ai", seed: 0, ai: { name: w.name, summary: w.summary, items: w.items, planDayId: up.day?.id ?? null } });
                setAiOpen(false);
              },
            },
            {
              label: "Start it now",
              run: async (w) => {
                await start({ items: w.items, name: w.name, gymId: gym?.id ?? null, planDayId: up.day?.id ?? null, source: "ai" });
                router.push("/workout");
              },
            },
          ]}
        />
      )}

      <Sheet open={pickMuscles} onClose={() => setPickMuscles(false)} title="Pick muscles">
        <MuscleChooser
          initial={up.mode === "muscles" ? up.targets : []}
          saveLabel="Build workout"
          onSave={async (ids) => {
            await setChoice({ mode: "muscles", muscles: ids, seed: 0 });
            setPickMuscles(false);
          }}
        />
      </Sheet>
    </>
  );
}

/** Fallback when there's nothing to suggest (e.g. a plan with no days). */
function StartCard({ hasGym }: { hasGym: boolean }) {
  return (
    <section className="flex flex-col gap-3 rounded-[28px] bg-primary p-5 text-white">
      <span className="text-xs font-bold tracking-[0.12em] text-[#DCE4FF]">UP NEXT</span>
      <h1 className="display text-[64px] leading-[0.85] font-extrabold tracking-[-0.02em]">Your call</h1>
      <p className="text-[15px] font-medium text-[#DCE4FF]">
        Build a workout from {hasGym ? "what your gym has" : "the exercise library"}, repeat a past one, or log cardio.
      </p>
      <div className="mt-1 flex gap-2">
        <Link href="/workout" className="display flex h-[52px] flex-1 items-center justify-center gap-2.5 rounded-full bg-white text-xl font-extrabold tracking-[0.08em] text-primary">
          Build
        </Link>
        <Link href="/cardio" className="display flex h-[52px] items-center justify-center rounded-full border-2 border-white px-5 text-lg font-extrabold tracking-[0.08em]">
          Cardio
        </Link>
      </div>
    </section>
  );
}
