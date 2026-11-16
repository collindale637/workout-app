"use client";

import { useMemo, useState } from "react";
import { useProfile } from "@/lib/db/provider";
import { useCatalog } from "@/lib/hooks";
import { useRecovery } from "@/lib/smart";
import { useFatigueAdjustments } from "@/lib/fatigue-adjust";
import { FRESH_AT, RECOVERING_AT, type MuscleRecovery } from "@/lib/recovery";
import { formatWeight } from "@/lib/units";
import { BodyMap, STATE_COLOR, STATE_LABEL } from "@/components/body-map";
import { Sheet } from "@/components/ui/kit";

export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return "Not in the last 7 days";
  const h = (now - new Date(iso).getTime()) / 3_600_000;
  if (h < 1) return "Just now";
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

export function RecoveryScreen() {
  const catalog = useCatalog();
  const recovery = useRecovery();
  const { profile } = useProfile();
  const { set: setAdjustment, clear: clearAdjustment } = useFatigueAdjustments();
  const [selected, setSelected] = useState<string | null>(null);

  const list = useMemo(() => {
    if (!recovery || !catalog) return [];
    return catalog.muscles.map((m) => recovery.map.get(m.id)!).filter(Boolean).sort((a, b) => a.score - b.score);
  }, [recovery, catalog]);

  if (!recovery || !catalog) return null;
  const counts = { fresh: 0, recovering: 0, fatigued: 0 };
  for (const r of list) counts[r.state]++;
  const name = (id: string) => catalog.muscleName.get(id) ?? id;
  const sel = selected ? recovery.map.get(selected) : null;

  return (
    <main className="mt-4 flex flex-col gap-4">
      <header className="flex h-11 items-center justify-between">
        <h1 className="display text-4xl font-extrabold">Recovery</h1>
        <span className="text-xs font-bold tracking-[0.1em] text-muted">LAST 7 DAYS</span>
      </header>

      <section className="rounded-3xl border border-line bg-card p-4">
        <BodyMap recovery={recovery.map} selected={selected} onSelect={setSelected} />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["fresh", "recovering", "fatigued"] as const).map((s) => (
            <div key={s} className="flex flex-col items-center rounded-2xl bg-card-2 py-2">
              <span className="display num text-2xl font-extrabold" style={{ color: STATE_COLOR[s] }}>{counts[s]}</span>
              <span className="text-xs font-bold tracking-[0.08em] text-muted">{STATE_LABEL[s].toUpperCase()}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-sm font-medium text-muted">Tap a muscle for details. Fresh is {FRESH_AT}%+, fatigued is under {RECOVERING_AT}%.</p>
      </section>

      <section className="flex flex-col">
        <h2 className="display pb-2 text-xl font-extrabold">Every muscle</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
          {list.map((r) => (
            <li key={r.muscleId}>
              <button type="button" onClick={() => setSelected(r.muscleId)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-card-2">
                <span className="w-28 shrink-0 text-base font-bold">{name(r.muscleId)}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-card-2">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(4, r.score)}%`, background: STATE_COLOR[r.state] }} />
                </span>
                <span className="display num w-12 text-right text-lg font-extrabold">{r.score}%</span>
                {r.adjusted && <span className="-ml-1 text-xs text-accent-soft" role="img" aria-label="Adjusted by you" title="Adjusted by you">✎</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Sheet open={sel !== null && sel !== undefined} onClose={() => setSelected(null)} title={sel ? name(sel.muscleId) : undefined}>
        {sel && (
          <MuscleDetail
            r={sel}
            onAdjust={(score) => setAdjustment(sel.muscleId, score, sel.autoFatigue)}
            onReset={() => clearAdjustment(sel.muscleId)}
            units={profile?.units ?? "lb"} sets={recovery.sets} defaultRpe={profile?.default_rpe ?? 8} exerciseName={(id) => catalog.byId.get(id)?.name ?? id}
          />
        )}
      </Sheet>
    </main>
  );
}

/** Quick answers for "how does it feel?", as the recovery % they set. */
export const FEEL_PRESETS = [
  { label: "Wrecked", score: 15 },
  { label: "Sore", score: 45 },
  { label: "Fine", score: 75 },
  { label: "Fresh", score: 100 },
] as const;

/** Tell the app how this muscle really feels; it fades back to the automatic estimate on its own. */
function FeelSlider({ r, onAdjust, onReset }: { r: MuscleRecovery; onAdjust: (score: number) => void; onReset: () => void }) {
  // While dragging the thumb shows the finger's position; once the real number changes (saved, a set gets
  // logged, time passes, a reset) it goes back to following it.
  const [drag, setDrag] = useState<number | null>(null);
  const [seen, setSeen] = useState(r.score);
  if (seen !== r.score) {
    setSeen(r.score);
    setDrag(null);
  }
  const value = drag ?? r.score;
  const commit = () => {
    if (drag !== null && drag !== r.score) onAdjust(drag);
  };
  return (
    <section className="flex flex-col gap-1 rounded-2xl bg-card-2 p-4" aria-label="How does it feel">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="display text-base font-extrabold tracking-[0.08em] text-accent-soft uppercase">How does it feel?</h3>
        <span className="text-xs font-bold text-muted">{r.adjusted ? `You set it · auto was ${r.autoScore}%` : `Auto: ${r.autoScore}%`}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        aria-label={`${value}% recovered`}
        aria-valuetext={`${value}% recovered`}
        className="feel-slider h-11 w-full"
      />
      <div className="-mt-1 flex justify-between px-0.5 text-xs font-bold text-muted" aria-hidden="true">
        <span>Wrecked</span>
        <span>Sore</span>
        <span>Fine</span>
        <span>Fresh</span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {FEEL_PRESETS.map((p) => {
          const on = r.adjusted && r.score === p.score;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onAdjust(p.score)}
              aria-pressed={on}
              className={`min-h-11 rounded-2xl border-2 text-sm font-bold ${on ? "border-accent-strong bg-primary/15 text-accent-soft" : "border-line bg-card text-muted"}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {r.adjusted && (
        <button type="button" onClick={onReset} className="mt-1 min-h-11 self-start text-sm font-bold text-accent">
          ↺ Back to automatic
        </button>
      )}
      <p className="text-sm font-medium text-muted">Overrides the estimate for this muscle. It fades back the way recovery does, and sets you log after this still count.</p>
    </section>
  );
}

function MuscleDetail({
  r,
  onAdjust,
  onReset,
  sets,
  units,
  defaultRpe,
  exerciseName,
}: {
  r: MuscleRecovery;
  onAdjust: (score: number) => void;
  onReset: () => void;
  sets: NonNullable<ReturnType<typeof useRecovery>>["sets"];
  units: "lb" | "kg";
  defaultRpe: number;
  exerciseName: (id: string) => string;
}) {
  const hits = sets
    .filter((s) => s.type !== "warmup" && s.muscles.some((m) => m.muscle_id === r.muscleId))
    .sort((a, b) => b.at.localeCompare(a.at));
  // One row per exercise per workout.
  const groups = new Map<string, typeof hits>();
  for (const s of hits) groups.set(`${s.workoutId}:${s.exerciseId}`, [...(groups.get(`${s.workoutId}:${s.exerciseId}`) ?? []), s]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <span className="display num text-6xl leading-none font-extrabold" style={{ color: STATE_COLOR[r.state] }}>{r.score}%</span>
        <div className="flex flex-col">
          <span className="display text-xl font-extrabold">{STATE_LABEL[r.state]}</span>
          <span className="text-sm font-medium text-muted">Last trained: {ago(r.lastTrained)}</span>
          <span className="text-sm font-medium text-muted">
            {r.primarySets} main sets{r.secondarySets ? ` · ${r.secondarySets} as a helper` : ""} this week
          </span>
        </div>
      </div>
      <FeelSlider r={r} onAdjust={onAdjust} onReset={onReset} />
      {groups.size === 0 ? (
        <p className="text-base font-medium text-muted">No sets hit this muscle in the last 7 days.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...groups.values()].map((g) => {
            const role = g[0].muscles.find((m) => m.muscle_id === r.muscleId)?.role;
            return (
              <li key={`${g[0].workoutId}:${g[0].exerciseId}`} className="rounded-2xl bg-card-2 px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-base font-bold">{exerciseName(g[0].exerciseId)}</span>
                  <span className="shrink-0 text-xs font-bold tracking-[0.08em] text-muted">{ago(g[0].at).toUpperCase()}</span>
                </div>
                <p className="text-sm font-medium text-muted">
                  {role === "secondary" ? "Helper · " : ""}
                  {g
                    .slice()
                    .reverse()
                    .map((s) => `${formatWeight(s.weight, units)}×${s.reps ?? 0}${(s.rpe ?? defaultRpe) !== defaultRpe ? ` @${s.rpe}` : ""}`)
                    .join(", ")}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
