"use client";

import { useMemo, useState } from "react";
import { useCatalog } from "@/lib/hooks";
import { usePrefs } from "@/lib/smart";
import { matchesSearch, searchTerms } from "@/lib/ai/match";
import { AREA_LABELS, AVOID_AREAS, INJURY_DISCLAIMER, INJURY_NOTE_MAX, injuryExcluded, type AvoidArea } from "@/lib/injuries";
import { Chip, field, label } from "@/components/ui/kit";

/*
  "Anything to avoid?": body areas to go easy on, a short note the AI reads, and exercises you never want suggested
  (the same "Never suggest" list as the library). Areas and the note are saved by the screen that hosts this;
  the exercise list saves as you tap.
*/
export function AvoidEditor({
  areas,
  note,
  onAreas,
  onNote,
}: {
  areas: AvoidArea[];
  note: string;
  onAreas: (a: AvoidArea[]) => void;
  onNote: (n: string) => void;
}) {
  const catalog = useCatalog();
  const { prefs, setPref } = usePrefs();
  const [q, setQ] = useState("");

  const skipped = useMemo(
    () => (catalog ? injuryExcluded(catalog.exercises.filter((e) => e.is_active), (id) => (catalog.musclesOf.get(id) ?? []).filter((m) => m.role === "primary").map((m) => m.muscle_id), areas).size : 0),
    [catalog, areas],
  );
  const never = useMemo(() => (catalog ? catalog.exercises.filter((e) => prefs.get(e.id)?.excluded) : []), [catalog, prefs]);
  const results = useMemo(() => {
    const t = q.trim();
    if (!catalog || t.length < 2) return [];
    const terms = searchTerms(t);
    return catalog.exercises
      .filter((e) => e.is_active && (e.is_common || e.owner_id) && !prefs.get(e.id)?.excluded && matchesSearch(`${e.name} ${e.aliases.join(" ")}`, terms))
      .slice(0, 6);
  }, [catalog, prefs, q]);

  const toggle = (a: AvoidArea) => onAreas(areas.includes(a) ? areas.filter((x) => x !== a) : [...areas, a]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {AVOID_AREAS.map((a) => (
            <Chip key={a} active={areas.includes(a)} onClick={() => toggle(a)}>
              {AREA_LABELS[a]}
              {areas.includes(a) ? " ✓" : ""}
            </Chip>
          ))}
        </div>
        {areas.length > 0 && <p className="text-sm font-medium text-muted">Skips {skipped} exercises.</p>}
      </div>

      <label className="flex flex-col gap-2">
        <span className={label}>NOTE FOR AI PLANS (OPTIONAL)</span>
        <textarea
          className={`${field} h-20 resize-none py-3 leading-snug`}
          placeholder="e.g. left shoulder pinches overhead"
          value={note}
          maxLength={INJURY_NOTE_MAX}
          onChange={(e) => onNote(e.target.value)}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className={label}>NEVER SUGGEST THESE EXERCISES</span>
        <input className={field} type="search" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
        {results.map((e) => (
          <button key={e.id} type="button" className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 text-left" onClick={() => { void setPref(e.id, { excluded: true }); setQ(""); }}>
            <span className="text-[15px] font-bold">{e.name}</span>
            <span className="text-sm font-bold text-accent">Avoid</span>
          </button>
        ))}
        {never.map((e) => (
          <div key={e.id} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line bg-card pl-3">
            <span className="text-[15px] font-bold">{e.name}</span>
            <button type="button" aria-label={`Allow ${e.name} again`} className="flex h-11 w-11 items-center justify-center text-xl text-warn" onClick={() => void setPref(e.id, { excluded: false })}>
              ×
            </button>
          </div>
        ))}
      </div>

      <p className="text-center text-sm font-medium text-muted">{INJURY_DISCLAIMER}</p>
    </div>
  );
}
