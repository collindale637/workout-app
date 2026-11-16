"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useData, useProfile, useSave } from "@/lib/db/provider";
import { newId } from "@/lib/db/dexie";
import { RPE_CHOICES } from "@/lib/defaults";
import { distanceUnit, fromDisplayDistance, toDisplayDistance } from "@/lib/units";
import { Chip, PageHeader, btn, field, label } from "@/components/ui/kit";
import { CARDIO_TYPES } from "@/lib/cardio";
import type { CardioSession, CardioType } from "@/lib/db/types";

function localInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Log a cardio session, on its own or as part of the workout in progress (?workout=id). Edit with ?id=. */
export function CardioForm() {
  const router = useRouter();
  const params = useSearchParams();
  const workoutId = params.get("workout");
  const editId = params.get("id");
  const { db } = useData();
  const { profile } = useProfile();
  const save = useSave();
  const units = profile?.units ?? "lb";
  const existing = useLiveQuery(async () => (editId ? (await db.cardio_sessions.get(editId)) ?? null : null), [db, editId]);
  if (editId && existing === undefined) return null;
  return <Form key={existing?.id ?? "new"} existing={existing ?? null} workoutId={workoutId} units={units} onSave={async (row) => {
    await save("cardio_sessions", row);
    router.replace(workoutId ? "/workout" : `/progress/session?cardio=${row.id}`);
  }} onCancel={() => router.back()} />;
}

function Form({ existing, workoutId, units, onSave, onCancel }: {
  existing: CardioSession | null; workoutId: string | null; units: "lb" | "kg";
  onSave: (row: CardioSession) => void; onCancel: () => void;
}) {
  const [type, setType] = useState<CardioType>(existing?.type ?? "run");
  const [minutes, setMinutes] = useState(existing ? String(Math.floor(existing.duration_sec / 60)) : "");
  const [seconds, setSeconds] = useState(existing ? String(existing.duration_sec % 60 || "") : "");
  const [distance, setDistance] = useState(existing?.distance ? String(toDisplayDistance(existing.distance, units)) : "");
  const [hr, setHr] = useState(existing?.avg_hr ? String(existing.avg_hr) : "");
  const [rpe, setRpe] = useState<number | null>(existing?.rpe ?? null);
  const [when, setWhen] = useState(localInputValue(existing ? new Date(existing.started_at) : new Date()));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const showDistance = CARDIO_TYPES.find((t) => t.id === type)?.distance;
  const durationSec = (Number(minutes) || 0) * 60 + (Number(seconds) || 0);

  return (
    <form
      className="safe-top safe-bottom flex flex-col gap-4 px-5 pb-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (durationSec <= 0) return;
        const d = distance.trim() ? Number(distance.replace(",", ".")) : null;
        onSave({
          id: existing?.id ?? newId(),
          workout_id: existing?.workout_id ?? workoutId,
          type,
          started_at: new Date(when).toISOString(),
          duration_sec: durationSec,
          distance: d && showDistance ? fromDisplayDistance(d, units) : null,
          avg_hr: hr.trim() ? Math.round(Number(hr)) : null,
          rpe,
          intervals: existing?.intervals ?? null,
          notes: notes.trim() || null,
        });
      }}
    >
      <PageHeader title={existing ? "Edit cardio" : "Log cardio"} right={<button type="button" className={btn.ghost} onClick={onCancel}>Cancel</button>} />
      <div className="grid grid-cols-3 gap-2">
        {CARDIO_TYPES.map((t) => <Chip key={t.id} active={type === t.id} onClick={() => setType(t.id)}>{t.label}</Chip>)}
      </div>
      <div className="flex flex-col gap-2">
        <span className={label}>HOW LONG</span>
        <div className="grid grid-cols-2 gap-2">
          <label className="relative"><input className={`${field} display num h-16 pr-14 text-3xl font-extrabold`} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="30" required={!seconds} /><span className="absolute top-1/2 right-4 -translate-y-1/2 text-sm font-bold text-muted">min</span></label>
          <label className="relative"><input className={`${field} display num h-16 pr-14 text-3xl font-extrabold`} inputMode="numeric" value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="0" /><span className="absolute top-1/2 right-4 -translate-y-1/2 text-sm font-bold text-muted">sec</span></label>
        </div>
      </div>
      {showDistance && (
        <label className="flex flex-col gap-2">
          <span className={label}>DISTANCE ({distanceUnit(units).toUpperCase()}, OPTIONAL)</span>
          <input className={`${field} display num h-16 text-3xl font-extrabold`} inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="3.1" />
        </label>
      )}
      <label className="flex flex-col gap-2">
        <span className={label}>AVERAGE HEART RATE (OPTIONAL)</span>
        <input className={field} inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} placeholder="bpm" />
      </label>
      <div className="flex flex-col gap-2">
        <span className={label}>EFFORT (RPE, OPTIONAL)</span>
        <div className="grid grid-cols-7 gap-1.5">
          {RPE_CHOICES.map((r) => (
            <button key={r} type="button" onClick={() => setRpe(rpe === r ? null : r)} aria-pressed={rpe === r} className={`display num h-11 rounded-xl text-lg font-extrabold ${rpe === r ? "bg-primary text-white" : "bg-card-2 text-muted"}`}>{r}</button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-2">
        <span className={label}>WHEN</span>
        <input className={field} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      <label className="flex flex-col gap-2">
        <span className={label}>NOTES</span>
        <input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Intervals, route, incline…" />
      </label>
      <button type="submit" disabled={durationSec <= 0} className={btn.primary}>{existing ? "Save changes" : "Save cardio"}</button>
    </form>
  );
}
