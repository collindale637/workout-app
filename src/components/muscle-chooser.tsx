"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useData } from "@/lib/db/provider";
import { MUSCLE_GROUPS } from "@/lib/defaults";
import { Chip, btn, label } from "@/components/ui/kit";

/** Pick muscles, grouped the way people think about them. */
export function MuscleChooser({ initial, onSave, saveLabel = "Save" }: { initial: string[]; onSave: (ids: string[]) => void; saveLabel?: string }) {
  const { db } = useData();
  const muscles = useLiveQuery(() => db.muscles.toArray(), [db]);
  const [picked, setPicked] = useState(new Set(initial));
  if (!muscles) return null;
  const name = new Map(muscles.map((m) => [m.id, m.name]));
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  return (
    <div className="flex flex-col gap-4">
      {MUSCLE_GROUPS.map((g) => (
        <div key={g.label} className="flex flex-col gap-2">
          <span className={label}>{g.label.toUpperCase()}</span>
          <div className="flex flex-wrap gap-2">
            {g.muscles.map((m) => (
              <Chip key={m} active={picked.has(m)} onClick={() => toggle(m)}>{name.get(m) ?? m}</Chip>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className={btn.primary} disabled={picked.size === 0} onClick={() => onSave(muscles.filter((m) => picked.has(m.id)).sort((a, b) => a.sort_order - b.sort_order).map((m) => m.id))}>
        {saveLabel}
      </button>
    </div>
  );
}
