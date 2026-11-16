"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useData, useProfile } from "@/lib/db/provider";
import { useGymActions } from "@/lib/gyms";
import { CATEGORY_LABELS, CATEGORY_ORDER, TEMPLATE_LABELS, defaultDetails, hasDetails } from "@/lib/defaults";
import { Card, Sheet, PageHeader, btn, field, label } from "@/components/ui/kit";
import { fromDisplayWeight, toDisplayWeight, weightUnit } from "@/lib/units";
import type { EquipmentDetails, GymTemplate, Units } from "@/lib/db/types";

export function GymEditor() {
  const params = useSearchParams();
  const id = params.get("id");
  return id ? <EditGym id={id} /> : <NewGym />;
}

function NewGym() {
  const router = useRouter();
  const { createGym } = useGymActions();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<GymTemplate>("commercial");
  const [busy, setBusy] = useState(false);

  return (
    <main className="flex flex-col gap-4">
      <PageHeader title="New gym" back="/more/gyms" />
      <label className="flex flex-col gap-2">
        <span className={label}>NAME</span>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Home, Work gym, Hotel…" autoFocus />
      </label>
      <span className={label}>START FROM</span>
      <div className="-mt-2 flex flex-col gap-2">
        {(Object.keys(TEMPLATE_LABELS) as GymTemplate[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTemplate(t)}
            aria-pressed={template === t}
            className={`flex min-h-16 flex-col items-start justify-center rounded-2xl border-2 px-4 py-2 text-left ${template === t ? "border-accent-strong bg-primary/15" : "border-line bg-card"}`}
          >
            <span className={`text-base font-bold ${template === t ? "text-accent-soft" : ""}`}>{TEMPLATE_LABELS[t].name}</span>
            <span className="text-sm font-medium text-muted">{TEMPLATE_LABELS[t].blurb}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        className={btn.primary}
        onClick={async () => {
          setBusy(true);
          const gym = await createGym(name || TEMPLATE_LABELS[template].name, template);
          router.replace(`/more/gyms/edit?id=${gym.id}`);
        }}
      >
        Create and pick equipment
      </button>
    </main>
  );
}

type Draft = { name: string; items: Map<string, EquipmentDetails> };

function EditGym({ id }: { id: string }) {
  const router = useRouter();
  const { db } = useData();
  const { profile } = useProfile();
  const { updateGym, saveEquipment, makeDefault, deleteGym } = useGymActions();
  const gym = useLiveQuery(() => db.gyms.get(id), [db, id]);
  const catalog = useLiveQuery(() => db.equipment.toArray(), [db]);
  const have = useLiveQuery(() => db.gym_equipment.where("gym_id").equals(id).toArray(), [db, id]);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  // Edits live here until Save; nothing touches the gym until then.
  const [draft, setDraft] = useState<Draft | null>(null);
  const units: Units = profile?.units ?? "lb";

  const saved = useMemo<Draft | null>(
    () => (gym && have ? { name: gym.name, items: new Map(have.map((r) => [r.equipment_id, r.details])) } : null),
    [gym, have],
  );
  const current = draft ?? saved;
  const dirty = Boolean(draft && saved && !sameDraft(draft, saved));

  const grouped = useMemo(() => {
    const m = new Map<string, NonNullable<typeof catalog>>();
    for (const e of [...(catalog ?? [])].sort((a, b) => a.sort_order - b.sort_order)) m.set(e.category, [...(m.get(e.category) ?? []), e]);
    return CATEGORY_ORDER.filter((c) => m.has(c)).map((c) => ({ category: c, items: m.get(c)! }));
  }, [catalog]);

  if (gym === undefined || !catalog || !current) return null;
  if (gym === null) {
    return (
      <main className="flex flex-col gap-4">
        <PageHeader title="Gym not found" back="/more/gyms" />
      </main>
    );
  }

  const edit = (fn: (d: Draft) => Draft) => setDraft((d) => fn(d ?? { name: current.name, items: new Map(current.items) }));
  const toggle = (ids: string[], on: boolean) =>
    edit((d) => {
      const items = new Map(d.items);
      for (const eid of ids) {
        if (on && !items.has(eid)) items.set(eid, saved?.items.get(eid) ?? defaultDetails(eid, gym.template));
        if (!on) items.delete(eid);
      }
      return { ...d, items };
    });

  async function save() {
    if (!draft || !gym) return;
    setSaving(true);
    const name = draft.name.trim() || gym.name;
    if (name !== gym.name) await updateGym({ ...gym, name });
    await saveEquipment(gym.id, [...draft.items].map(([equipment_id, details]) => ({ equipment_id, details })));
    setDraft(null);
    setSaving(false);
    setSavedAt(Date.now());
  }

  const detailDetails = detailFor ? current.items.get(detailFor) : undefined;

  return (
    <main className={`flex flex-col gap-4 ${dirty ? "pb-24" : ""}`}>
      <PageHeader
        title={gym.name}
        back={dirty ? undefined : "/more/gyms"}
        right={
          dirty ? (
            <button type="button" onClick={() => setConfirmLeave(true)} className="h-11 px-2 text-sm font-bold text-muted">
              Cancel
            </button>
          ) : undefined
        }
      />
      <Card className="flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-2">
          <span className={label}>NAME</span>
          <input className={field} value={current.name} onChange={(e) => edit((d) => ({ ...d, name: e.target.value }))} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={btn.primary} disabled={!dirty || saving} onClick={save}>
            {saving ? "Saving…" : dirty ? "Save" : savedAt ? "Saved" : "No changes"}
          </button>
          <button type="button" className={btn.secondary} disabled={gym.is_default} onClick={() => makeDefault(gym.id)}>
            {gym.is_default ? "Default gym" : "Make default"}
          </button>
        </div>
      </Card>

      <div className="flex items-baseline justify-between">
        <h2 className="display text-2xl font-extrabold">Equipment</h2>
        <span className="text-sm font-semibold text-muted">{current.items.size} ticked</span>
      </div>

      {grouped.map(({ category, items }) => {
        const on = items.filter((e) => current.items.has(e.id)).length;
        return (
          <details key={category} className="group rounded-3xl border border-line bg-card" open={category === "free_weights"}>
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4">
              <span className="text-lg font-bold">{CATEGORY_LABELS[category]}</span>
              <span className="flex items-center gap-2 text-sm font-semibold text-muted">
                {on}/{items.length}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="transition group-open:rotate-180" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </span>
            </summary>
            <div className="flex justify-end gap-2 px-4 pb-1">
              <button type="button" className="h-9 text-sm font-bold text-accent" onClick={() => toggle(items.map((e) => e.id), true)}>All</button>
              <button type="button" className="h-9 text-sm font-bold text-muted" onClick={() => toggle(items.map((e) => e.id), false)}>None</button>
            </div>
            <ul className="divide-y divide-line border-t border-line">
              {items.map((e) => {
                const checked = current.items.has(e.id);
                return (
                  <li key={e.id} className="flex min-h-13 items-center gap-3 px-4">
                    <label className="flex min-h-12 flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(ev) => toggle([e.id], ev.target.checked)}
                        className="h-6 w-6 shrink-0 accent-[var(--primary)]"
                      />
                      <span className={`text-base font-semibold ${checked ? "text-ink" : "text-muted"}`}>{e.name}</span>
                    </label>
                    {checked && hasDetails(e.id) && (
                      <button type="button" onClick={() => setDetailFor(e.id)} className="h-10 rounded-xl px-2 text-sm font-bold text-accent">
                        {summarize(e.id, current.items.get(e.id)!, units)}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}

      <button type="button" className={btn.danger} onClick={() => setConfirmDelete(true)}>Delete this gym</button>

      {dirty && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-30 mx-auto flex max-w-lg gap-2 px-4">
          <button type="button" className={`${btn.secondary} flex-1`} onClick={() => setDraft(null)}>Discard</button>
          <button type="button" className={`${btn.primary} flex-[2]`} disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      <Sheet open={Boolean(detailFor && detailDetails)} onClose={() => setDetailFor(null)} title={catalog.find((e) => e.id === detailFor)?.name}>
        {detailFor && detailDetails && (
          <DetailsForm
            equipmentId={detailFor}
            details={detailDetails}
            units={units}
            onSave={(d) => {
              edit((dr) => ({ ...dr, items: new Map(dr.items).set(detailFor, d) }));
              setDetailFor(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Leave without saving?">
        <p className="mb-4 text-base font-medium text-muted">Your equipment changes haven&apos;t been saved.</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={btn.secondary}
            onClick={() => {
              setDraft(null);
              router.push("/more/gyms");
            }}
          >
            Discard
          </button>
          <button
            type="button"
            className={btn.primary}
            onClick={async () => {
              await save();
              router.push("/more/gyms");
            }}
          >
            Save
          </button>
        </div>
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete ${gym.name}?`}>
        <p className="mb-4 text-base font-medium text-muted">Past workouts stay in your history; they just won&apos;t be linked to this gym.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={btn.secondary} onClick={() => setConfirmDelete(false)}>Keep it</button>
          <button
            type="button"
            className={btn.danger}
            onClick={async () => {
              await deleteGym(gym.id);
              router.replace("/more/gyms");
            }}
          >
            Delete
          </button>
        </div>
      </Sheet>
    </main>
  );
}

function sameDraft(a: Draft, b: Draft) {
  if (a.name.trim() !== b.name || a.items.size !== b.items.size) return false;
  for (const [k, v] of a.items) {
    const o = b.items.get(k);
    if (!o || JSON.stringify(v) !== JSON.stringify(o)) return false;
  }
  return true;
}

function summarize(id: string, d: EquipmentDetails, units: Units) {
  const u = weightUnit(units);
  const w = (lb?: number) => (lb === undefined ? "?" : toDisplayWeight(lb, units));
  if (id === "dumbbells") return `${w(d.dumbbell_min)}–${w(d.dumbbell_max)} ${u}`;
  if (id === "barbell") return `+${w(d.plate_increment)} ${u}`;
  return `max ${w(d.stack_max)} ${u}`;
}

function DetailsForm({ equipmentId, details, units, onSave }: { equipmentId: string; details: EquipmentDetails; units: Units; onSave: (d: EquipmentDetails) => void }) {
  const u = weightUnit(units);
  const toD = (lb?: number) => (lb === undefined ? "" : String(toDisplayWeight(lb, units)));
  const [a, setA] = useState(toD(equipmentId === "dumbbells" ? details.dumbbell_min : equipmentId === "barbell" ? details.plate_increment : details.stack_max));
  const [b, setB] = useState(toD(details.dumbbell_max));
  const [c, setC] = useState(toD(details.dumbbell_step));
  const num = (s: string) => (s.trim() === "" ? undefined : fromDisplayWeight(Number(s.replace(",", ".")), units));

  const input = (value: string, set: (v: string) => void, title: string) => (
    <label className="flex flex-col gap-2">
      <span className={label}>{title.toUpperCase()} ({u.toUpperCase()})</span>
      <input className={field} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} />
    </label>
  );

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (equipmentId === "dumbbells") onSave({ dumbbell_min: num(a), dumbbell_max: num(b), dumbbell_step: num(c) });
        else if (equipmentId === "barbell") onSave({ plate_increment: num(a) });
        else onSave({ stack_max: num(a) });
      }}
    >
      {equipmentId === "dumbbells" ? (
        <div className="grid grid-cols-3 gap-2">
          {input(a, setA, "Lightest")}
          {input(b, setB, "Heaviest")}
          {input(c, setC, "Jumps")}
        </div>
      ) : equipmentId === "barbell" ? (
        input(a, setA, "Smallest plate")
      ) : (
        input(a, setA, "Stack max")
      )}
      <p className="text-sm font-medium text-muted">Used later to suggest weights you can actually load.</p>
      <button type="submit" className={btn.primary}>Done</button>
    </form>
  );
}
