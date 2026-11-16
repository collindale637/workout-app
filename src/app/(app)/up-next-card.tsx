"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/db/provider";
import { useActiveGym, useCatalog } from "@/lib/hooks";
import { useWorkoutActions } from "@/lib/workout";
import { suggestionFor, useLastSets, useStartingProfile } from "@/lib/smart";
import { useUpNext, useUpNextChoice } from "@/lib/up-next";
import { doseLabel, MusclePills, suggestionLabel, supersetLetter } from "@/components/planned";
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

  if (up === undefined || !catalog || !profile) {
    return <section className="h-[300px] animate-pulse rounded-[28px] bg-primary/40" aria-label="Loading today's workout" />;
  }
  if (up === null) return <StartCard hasGym={hasGym} />;

  const units = profile.units;
  const seed = choice?.seed ?? 0;
  const regenerate = () => setChoice({ mode: up.mode, dayId: up.day?.id ?? null, muscles: choice?.muscles, seed: seed + 1 });

  async function go() {
    if (!up || !up.items.length) return;
    setStarting(true);
    await start({ items: up.items, name: up.title, gymId: gym?.id ?? null, planDayId: up.day?.id ?? null, source: up.source });
    router.push("/workout");
  }

  const swapped = up.swaps.filter((s) => s.to);
  const dropped = up.swaps.filter((s) => !s.to);
  const name = (id: string) => catalog.byId.get(id)?.name ?? id;

  return (
    <>
      <section className="flex flex-col gap-3 rounded-[28px] bg-primary p-5 text-white">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold tracking-[0.12em] text-[#DCE4FF]">
            UP NEXT{up.mode === "fresh" ? " · FRESH MUSCLES" : up.mode === "muscles" ? " · YOUR PICK" : up.mode === "ai" ? " · AI" : ""}
          </span>
          <button type="button" onClick={() => setOptions(true)} className="display -mr-1 min-h-11 rounded-full px-3 text-sm font-extrabold tracking-[0.08em] text-[#DCE4FF]">
            Change
          </button>
        </div>
        <h1 className="display text-[56px] leading-[0.85] font-extrabold tracking-[-0.02em] break-words">{up.title}</h1>
        <p className="-mt-1 text-[15px] font-semibold text-[#DCE4FF]">{up.subtitle}</p>
        <MusclePills catalog={catalog} ids={up.targets} light max={7} />
        {(swapped.length > 0 || dropped.length > 0) && (
          <p className="rounded-2xl bg-white/15 px-3 py-2 text-sm font-semibold">
            For {gym?.name ?? "this gym"}:{" "}
            {swapped.map((s) => `${name(s.from)} → ${name(s.to!)}`).join("; ")}
            {dropped.length ? `${swapped.length ? "; " : ""}skipped ${dropped.map((s) => name(s.from)).join(", ")} (no match here)` : ""}
          </p>
        )}
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={go}
            disabled={starting || !up.items.length}
            className="display flex h-[52px] flex-1 items-center justify-center gap-2.5 rounded-full bg-white text-xl font-extrabold tracking-[0.08em] text-primary disabled:opacity-60"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>
            {starting ? "Starting…" : "Start"}
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
            {up.items.length} exercise{up.items.length === 1 ? "" : "s"} · ~{profile.session_minutes} min
          </h2>
          {up.mode === "plan" ? (
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
                    <span className="text-sm font-medium text-muted">{doseLabel(catalog, it)}</span>
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
