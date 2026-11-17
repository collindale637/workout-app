"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useActivePlan, useGeneratorInputs } from "@/lib/smart";
import { formatWait, groupReadiness, planGroups } from "@/lib/readiness";

/**
 * "NEXT UP · Push · Push 72% · ready in ~10 h": the plan's next day and whether its muscles are ready.
 * Used on the just-saved workout screen and Today's "Done for today" card. Renders nothing without an active plan.
 */
export function NextUpRow({ href, onClick }: { href?: string; onClick?: () => void }) {
  const active = useActivePlan();
  const { catalog, recovery } = useGeneratorInputs();
  const info = useMemo(() => {
    const day = active?.nextDay;
    if (!day || !catalog || !recovery) return null;
    if (!day.target_muscle_ids.length) return { name: day.name, line: null as null | { text: string; ready: boolean } };
    const known = new Set(catalog.muscles.map((m) => m.id));
    const tau = new Map(catalog.muscles.map((m) => [m.id, m.recovery_tau_hours]));
    const key = [...new Set(day.target_muscle_ids)].filter((m) => known.has(m)).sort().join(",");
    // Name the readiness after the plan's group for these muscles ("Push"), as on the Recovery tab.
    const group = planGroups(active!.days, known)?.find((g) => [...g.muscles].sort().join(",") === key || day.target_muscle_ids.every((m) => g.muscles.includes(m)));
    const r = groupReadiness({ name: group?.name ?? day.name, muscles: day.target_muscle_ids }, recovery.map, tau);
    return { name: day.name, line: { text: r.ready ? "Ready now" : `${r.name} ${r.score}% · ready in ${formatWait(r.hoursToReady)}`, ready: r.ready } };
  }, [active, catalog, recovery]);
  if (!info) return null;

  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold tracking-[0.12em] text-muted">NEXT UP</span>
        <span className="display mt-1 block truncate text-[24px] leading-none font-extrabold">{info.name}</span>
        {info.line && <span className={`mt-1 block truncate text-sm font-semibold ${info.line.ready ? "text-good" : "text-warn"}`}>{info.line.text}</span>}
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="shrink-0 text-muted" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
    </>
  );
  const cls = "flex min-h-[72px] w-full items-center gap-3 rounded-3xl border border-line bg-card px-4 py-3 text-left active:bg-card-2";
  return href ? (
    <Link href={href} className={cls}>{body}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{body}</button>
  );
}
