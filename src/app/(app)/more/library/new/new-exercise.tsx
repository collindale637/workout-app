"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCatalog } from "@/lib/hooks";
import { useData } from "@/lib/db/provider";
import { markDirty } from "@/lib/db/sync";
import { newId } from "@/lib/db/dexie";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/defaults";
import { Chip, PageHeader, btn, field, label } from "@/components/ui/kit";

/** Add your own exercise. Only you see it. */
export function NewExercise() {
  const router = useRouter();
  const catalog = useCatalog();
  const { db, userId, requestSync } = useData();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"strength" | "cardio">("strength");
  const [mechanic, setMechanic] = useState<"compound" | "isolation">("compound");
  const [primary, setPrimary] = useState<string[]>([]);
  const [secondary, setSecondary] = useState<string[]>([]);
  const [needs, setNeeds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (!catalog) return null;
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || (kind === "strength" && primary.length === 0)) return;
    setBusy(true);
    const id = `custom_${newId().replace(/-/g, "")}`;
    await db.transaction("rw", [db.exercises, db.exercise_muscles, db.exercise_equipment, db.outbox], async () => {
      await db.exercises.put({
        id, name: name.trim(), aliases: [], category: kind, movement_pattern: kind === "cardio" ? "cardio" : mechanic === "isolation" ? "isolation" : "other",
        mechanic: kind === "cardio" ? null : mechanic, force: null, level: "beginner", instructions: [], images: [],
        is_common: false, is_active: true, owner_id: userId, source: "custom",
      });
      await db.exercise_muscles.bulkPut([
        ...primary.map((m) => ({ exercise_id: id, muscle_id: m, role: "primary" as const })),
        ...secondary.filter((m) => !primary.includes(m)).map((m) => ({ exercise_id: id, muscle_id: m, role: "secondary" as const })),
      ]);
      await db.exercise_equipment.bulkPut(needs.map((eq, i) => ({ exercise_id: id, option_group: i + 1, equipment_id: eq })));
      await markDirty(db, "exercises", id);
      await markDirty(db, "exercise_tags", id);
    });
    requestSync();
    router.replace(`/more/library/exercise?id=${id}`);
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <PageHeader title="New exercise" back="/more/library" />
      <label className="flex flex-col gap-2">
        <span className={label}>NAME</span>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Landmine Row" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Chip active={kind === "strength"} onClick={() => setKind("strength")}>Strength</Chip>
        <Chip active={kind === "cardio"} onClick={() => setKind("cardio")}>Cardio</Chip>
      </div>
      {kind === "strength" && (
        <div className="grid grid-cols-2 gap-2">
          <Chip active={mechanic === "compound"} onClick={() => setMechanic("compound")}>Compound (multi-joint)</Chip>
          <Chip active={mechanic === "isolation"} onClick={() => setMechanic("isolation")}>Isolation (one joint)</Chip>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <span className={label}>MAIN MUSCLES{kind === "strength" ? " (PICK AT LEAST ONE)" : ""}</span>
        <div className="flex flex-wrap gap-2">
          {catalog.muscles.map((m) => <Chip key={m.id} active={primary.includes(m.id)} onClick={() => toggle(primary, setPrimary, m.id)}>{m.name}</Chip>)}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className={label}>ALSO WORKS</span>
        <div className="flex flex-wrap gap-2">
          {catalog.muscles.filter((m) => !primary.includes(m.id)).map((m) => <Chip key={m.id} active={secondary.includes(m.id)} onClick={() => toggle(secondary, setSecondary, m.id)}>{m.name}</Chip>)}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className={label}>EQUIPMENT NEEDED (ALL OF THESE)</span>
        {CATEGORY_ORDER.map((c) => {
          const items = catalog.equipment.filter((e) => e.category === c);
          return (
            <details key={c} className="rounded-2xl border border-line bg-card">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-base font-bold">
                {CATEGORY_LABELS[c]}
                <span className="text-sm font-semibold text-muted">{items.filter((e) => needs.includes(e.id)).length || ""}</span>
              </summary>
              <div className="flex flex-wrap gap-2 px-4 pb-3">
                {items.map((e) => <Chip key={e.id} active={needs.includes(e.id)} onClick={() => toggle(needs, setNeeds, e.id)}>{e.name}</Chip>)}
              </div>
            </details>
          );
        })}
        <p className="text-sm font-medium text-muted">Leave empty if it needs no equipment.</p>
      </div>
      <button type="submit" disabled={busy || !name.trim() || (kind === "strength" && !primary.length)} className={btn.primary}>Save exercise</button>
    </form>
  );
}
