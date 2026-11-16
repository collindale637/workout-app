"use client";

import { useCallback, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData } from "@/lib/db/provider";
import { useCatalog } from "@/lib/hooks";
import { useActivePlan } from "@/lib/smart";
import { stateFor, type MuscleRecovery } from "@/lib/recovery";
import { formatWait, groupReadiness, groupsFor, planGroups, VIEW_LABELS, type ReadinessView } from "@/lib/readiness";
import { STATE_COLOR } from "@/components/body-map";

const KEY = "recovery_view";
const VIEWS = Object.keys(VIEW_LABELS) as ReadinessView[];

/** Which grouping the tiles use. Kept on this phone (like other display choices); defaults to your plan. */
function useReadinessView() {
  const { db } = useData();
  const view = useLiveQuery(async () => (await db.getMeta<ReadinessView>(KEY)) ?? "plan", [db]);
  const setView = useCallback((v: ReadinessView) => db.setMeta(KEY, v), [db]);
  return { view: view && VIEWS.includes(view) ? view : "plan", setView };
}

/**
 * "Is my Push day ready?" tiles above the body map, grouped by your plan's days (or PPL / Upper–Lower / body part).
 * Tapping a tile lights up its muscles on the body; tapping it again clears that.
 */
export function ReadinessTiles({
  recovery,
  lit,
  onLight,
}: {
  recovery: Map<string, MuscleRecovery>;
  lit: string | null;
  onLight: (group: { name: string; muscles: string[] } | null) => void;
}) {
  const catalog = useCatalog();
  const active = useActivePlan();
  const { view, setView } = useReadinessView();

  const tiles = useMemo(() => {
    if (!catalog || active === undefined) return null;
    const known = new Set(catalog.muscles.map((m) => m.id));
    const tau = new Map(catalog.muscles.map((m) => [m.id, m.recovery_tau_hours]));
    const fromPlan = active ? planGroups(active.days, known) : null;
    return groupsFor(view, fromPlan).map((g) => groupReadiness(g, recovery, tau));
  }, [catalog, active, view, recovery]);

  if (!tiles) return null;
  const cols = tiles.length === 2 || tiles.length === 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 rounded-2xl bg-card-2 p-1" role="radiogroup" aria-label="Group muscles by">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={view === v}
            onClick={() => { onLight(null); void setView(v); }}
            className={`display min-h-11 flex-1 rounded-xl px-1 text-sm leading-tight font-extrabold tracking-[0.04em] ${view === v ? "bg-primary text-white" : "text-muted"}`}
          >
            {VIEW_LABELS[v].toUpperCase()}
          </button>
        ))}
      </div>
      <div className={`grid gap-2 ${cols}`}>
        {tiles.map((t) => {
          const on = lit === t.name;
          const color = t.ready ? STATE_COLOR.fresh : STATE_COLOR[stateFor(t.lowest) === "fatigued" || t.score < 60 ? "fatigued" : "recovering"];
          return (
            <button
              key={t.name}
              type="button"
              aria-pressed={on}
              onClick={() => onLight(on ? null : t)}
              className={`flex min-h-[88px] min-w-0 flex-col items-center justify-center rounded-2xl border-2 bg-card-2 px-1 py-2 ${on ? "border-accent" : "border-transparent"}`}
            >
              <span className="display w-full truncate text-center text-sm font-extrabold tracking-[0.06em]">{t.name.toUpperCase()}</span>
              <span className="display num text-3xl leading-none font-extrabold" style={{ color }}>{t.score}%</span>
              <span className={`mt-1 text-xs font-semibold ${t.ready ? "text-good" : "text-muted"}`}>
                {t.ready ? "✓ Ready" : `Ready in ${formatWait(t.hoursToReady)}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
