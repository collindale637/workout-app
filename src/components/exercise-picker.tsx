"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useCatalog, type Catalog } from "@/lib/hooks";
import { isAvailable } from "@/lib/availability";
import { MUSCLE_GROUPS } from "@/lib/defaults";
import { Chip, btn, field } from "@/components/ui/kit";
import type { Exercise } from "@/lib/db/types";

type Filter = { kind: "all" } | { kind: "group"; muscles: string[]; label: string } | { kind: "cardio" } | { kind: "stretch" };

const STRENGTH = new Set(["strength", "powerlifting", "olympic_weightlifting", "strongman", "plyometrics"]);

export function primaryLabel(c: Catalog, id: string) {
  return (c.musclesOf.get(id) ?? [])
    .filter((m) => m.role === "primary")
    .map((m) => c.muscleName.get(m.muscle_id) ?? m.muscle_id)
    .join(", ");
}

/**
 * Search and filter the exercise library. Defaults to what the active gym can support.
 * mode "multi": pick several (in order); "single": pick one (e.g. swap); "browse": tap opens details.
 */
export function ExercisePicker({
  mode,
  gymEquipment,
  gymName,
  onPick,
  initialMuscles,
  excludeIds = [],
}: {
  mode: "multi" | "single" | "browse";
  gymEquipment: Set<string> | null;
  gymName?: string;
  onPick?: (ids: string[]) => void;
  initialMuscles?: string[];
  excludeIds?: string[];
}) {
  const catalog = useCatalog();
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());
  const [filter, setFilter] = useState<Filter>(
    initialMuscles?.length ? { kind: "group", muscles: initialMuscles, label: "Similar" } : { kind: "all" },
  );
  const [gymOnlyChoice, setAtGymOnly] = useState<boolean | null>(null);
  // Default to the gym filter once the gym has loaded, unless you changed it.
  const atGymOnly = gymOnlyChoice ?? Boolean(gymEquipment);
  const [picked, setPicked] = useState<string[]>([]);
  const [limit, setLimit] = useState(60);

  const results = useMemo(() => {
    if (!catalog) return [];
    const exclude = new Set(excludeIds);
    const words = q.split(/\s+/).filter(Boolean);
    const list = catalog.exercises.filter((e) => {
      if (!e.is_active || exclude.has(e.id)) return false;
      if (filter.kind === "cardio" && e.category !== "cardio") return false;
      if (filter.kind === "stretch" && e.category !== "stretching") return false;
      if ((filter.kind === "all" || filter.kind === "group") && !STRENGTH.has(e.category) && !q) return false;
      if (filter.kind === "group") {
        const prim = (catalog.musclesOf.get(e.id) ?? []).filter((m) => m.role === "primary").map((m) => m.muscle_id);
        if (!prim.some((m) => filter.muscles.includes(m))) return false;
      }
      if (words.length) {
        const hay = `${e.name} ${e.aliases.join(" ")}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      if (atGymOnly && gymEquipment && !isAvailable(catalog.needs.get(e.id) ?? [], gymEquipment)) return false;
      return true;
    });
    const score = (e: Exercise) => (e.owner_id ? 0 : e.is_common ? 1 : 2) * 10 + (q && e.name.toLowerCase().startsWith(q) ? 0 : 1);
    return list.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
  }, [catalog, q, filter, atGymOnly, gymEquipment, excludeIds]);

  if (!catalog) return <div className="h-64 animate-pulse rounded-3xl bg-card" />;

  const toggle = (id: string) => {
    if (mode === "single") return onPick?.([id]);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <input
          className={`${field} h-13 pl-11 text-lg`}
          placeholder="Search exercises"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(60);
          }}
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <svg className="absolute top-1/2 left-4 -translate-y-1/2 text-muted" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      </div>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        <Chip active={filter.kind === "all"} onClick={() => setFilter({ kind: "all" })}>All</Chip>
        {initialMuscles?.length ? (
          <Chip active={filter.kind === "group" && filter.label === "Similar"} onClick={() => setFilter({ kind: "group", muscles: initialMuscles, label: "Similar" })}>Same muscles</Chip>
        ) : null}
        {MUSCLE_GROUPS.map((g) => (
          <Chip key={g.label} active={filter.kind === "group" && filter.label === g.label} onClick={() => setFilter({ kind: "group", muscles: g.muscles, label: g.label })}>{g.label}</Chip>
        ))}
        <Chip active={filter.kind === "cardio"} onClick={() => setFilter({ kind: "cardio" })}>Cardio</Chip>
        <Chip active={filter.kind === "stretch"} onClick={() => setFilter({ kind: "stretch" })}>Stretch</Chip>
      </div>
      {gymEquipment && (
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-muted">
          <input type="checkbox" checked={atGymOnly} onChange={(e) => setAtGymOnly(e.target.checked)} className="h-5 w-5 accent-[var(--primary)]" />
          Only what {gymName ?? "this gym"} has
        </label>
      )}

      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
        {results.slice(0, limit).map((e) => {
          const available = gymEquipment ? isAvailable(catalog.needs.get(e.id) ?? [], gymEquipment) : true;
          const order = picked.indexOf(e.id);
          const body = (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-bold">{e.name}</div>
                <div className="truncate text-sm font-medium text-muted">
                  {primaryLabel(catalog, e.id) || e.category}
                  {!available && <span className="text-warn"> · not at this gym</span>}
                  {e.owner_id && <span className="text-accent"> · yours</span>}
                </div>
              </div>
              {mode === "multi" && (
                <span className={`display flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-extrabold ${order >= 0 ? "bg-primary text-white" : "border-2 border-line"}`}>
                  {order >= 0 ? order + 1 : ""}
                </span>
              )}
            </>
          );
          return (
            <li key={e.id}>
              {mode === "browse" ? (
                <Link href={`/more/library/exercise?id=${encodeURIComponent(e.id)}`} className="flex min-h-15 items-center gap-3 px-4 py-2.5 active:bg-card-2">{body}</Link>
              ) : (
                <button type="button" onClick={() => toggle(e.id)} className="flex min-h-15 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-card-2">{body}</button>
              )}
            </li>
          );
        })}
        {results.length === 0 && <li className="px-4 py-8 text-center text-base font-medium text-muted">No matches{atGymOnly ? " at this gym. Try unticking the gym filter." : "."}</li>}
      </ul>
      {results.length > limit && (
        <button type="button" className={btn.ghost} onClick={() => setLimit((l) => l + 60)}>Show more ({results.length - limit})</button>
      )}
      <Link href="/more/library/new" className={`${btn.ghost} justify-start`}>+ Create a custom exercise</Link>

      {mode === "multi" && picked.length > 0 && (
        <div className="safe-bottom sticky bottom-0 -mx-5 border-t border-line bg-bg/95 px-5 pt-3 backdrop-blur">
          <button type="button" className={`${btn.primary} w-full`} onClick={() => onPick?.(picked)}>
            Add {picked.length} exercise{picked.length === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </div>
  );
}
