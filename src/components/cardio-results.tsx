"use client";

import { useState } from "react";
import { INCLINE_MAX, cardioHasDistance, cardioHasIncline } from "@/lib/cardio";
import { distanceUnit, fromDisplayDistance, toDisplayDistance } from "@/lib/units";
import { btn, field, label } from "@/components/ui/kit";
import { RpeSlider } from "./rpe-slider";
import type { CardioSession, CardioType, Units } from "@/lib/db/types";

export type CardioResults = {
  durationSec: number;
  /** Miles. */
  distance: number | null;
  /** Treadmill incline, percent grade. */
  incline: number | null;
  avgHr: number | null;
  rpe: number | null;
  notes: string | null;
  /** ISO time the session started. */
  startedAt: string;
};

export type CardioResultsInitial = {
  durationSec?: number;
  distance?: number | null;
  incline?: number | null;
  avgHr?: number | null;
  rpe?: number | null;
  notes?: string | null;
  startedAt?: Date;
};

export const resultsFromSession = (c: CardioSession): CardioResultsInitial => ({
  durationSec: c.duration_sec,
  distance: c.distance,
  incline: c.incline ?? null,
  avgHr: c.avg_hr,
  rpe: c.rpe,
  notes: c.notes,
  startedAt: new Date(c.started_at),
});

function localInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valid resting-to-max heart rates, matching the database's check. */
const HR_MIN = 30;
const HR_MAX = 250;

/**
 * How it went: time, distance, heart rate, effort, notes. Used after a cardio timer finishes,
 * for a cardio exercise in a workout, and when logging a past session by hand (askWhen).
 */
export function CardioResultsForm({
  type, units, initial, askWhen = false, submitLabel, onSubmit, children,
}: {
  type: CardioType;
  units: Units;
  initial?: CardioResultsInitial;
  askWhen?: boolean;
  submitLabel: string;
  onSubmit: (r: CardioResults) => void | Promise<void>;
  /** Extra buttons under Save (discard, skip…). */
  children?: React.ReactNode;
}) {
  const start = initial?.durationSec;
  const [minutes, setMinutes] = useState(start ? String(Math.floor(start / 60)) : "");
  const [seconds, setSeconds] = useState(start ? String(start % 60 || "") : "");
  const [distance, setDistance] = useState(initial?.distance ? String(toDisplayDistance(initial.distance, units)) : "");
  const [incline, setIncline] = useState(initial?.incline ? String(initial.incline) : "");
  const [hr, setHr] = useState(initial?.avgHr ? String(initial.avgHr) : "");
  const [rpe, setRpe] = useState<number | null>(initial?.rpe ?? null);
  const [when, setWhen] = useState(() => localInputValue(initial?.startedAt ?? new Date()));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [startedAt] = useState(() => initial?.startedAt ?? new Date());
  const [saving, setSaving] = useState(false);

  const showDistance = cardioHasDistance(type);
  const durationSec = (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
  const hrNum = hr.trim() ? Math.round(Number(hr)) : null;
  const hrBad = hrNum !== null && (Number.isNaN(hrNum) || hrNum < HR_MIN || hrNum > HR_MAX);
  const distNum = distance.trim() ? Number(distance.replace(",", ".")) : null;
  const distBad = distNum !== null && (Number.isNaN(distNum) || distNum < 0);
  const showIncline = cardioHasIncline(type);
  const inclineNum = incline.trim() ? Number(incline.replace(",", ".")) : null;
  const inclineBad = showIncline && inclineNum !== null && (Number.isNaN(inclineNum) || inclineNum < 0 || inclineNum > INCLINE_MAX);
  const invalid = durationSec <= 0 || hrBad || (showDistance && distBad) || inclineBad;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (invalid || saving) return;
        setSaving(true);
        try {
          await onSubmit({
            durationSec,
            distance: showDistance && distNum ? fromDisplayDistance(distNum, units) : null,
            incline: showIncline && inclineNum ? Math.round(inclineNum * 10) / 10 : null,
            avgHr: hrNum,
            rpe,
            notes: notes.trim() || null,
            startedAt: (askWhen ? new Date(when) : startedAt).toISOString(),
          });
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="flex flex-col gap-2">
        <span className={label}>HOW LONG</span>
        <div className="grid grid-cols-2 gap-2">
          <label className="relative">
            <input className={`${field} display num h-16 pr-14 text-3xl font-extrabold`} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="30" aria-label="Minutes" />
            <span className="absolute top-1/2 right-4 -translate-y-1/2 text-sm font-bold text-muted">min</span>
          </label>
          <label className="relative">
            <input className={`${field} display num h-16 pr-14 text-3xl font-extrabold`} inputMode="numeric" value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="0" aria-label="Seconds" />
            <span className="absolute top-1/2 right-4 -translate-y-1/2 text-sm font-bold text-muted">sec</span>
          </label>
        </div>
      </div>
      {showDistance && (
        <label className="flex flex-col gap-2">
          <span className={label}>DISTANCE ({distanceUnit(units).toUpperCase()}, OPTIONAL)</span>
          <input className={`${field} display num h-16 text-3xl font-extrabold`} inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="3.1" />
          {distBad && <span className="text-sm font-semibold text-warn">Enter a distance like 3.1</span>}
        </label>
      )}
      {showIncline && (
        <label className="flex flex-col gap-2">
          <span className={label}>TREADMILL INCLINE (%, OPTIONAL)</span>
          <input className={field} inputMode="decimal" value={incline} onChange={(e) => setIncline(e.target.value)} placeholder="e.g. 5" />
          {inclineBad && <span className="text-sm font-semibold text-warn">Incline should be between 0 and {INCLINE_MAX} %</span>}
        </label>
      )}
      <label className="flex flex-col gap-2">
        <span className={label}>AVERAGE HEART RATE (OPTIONAL)</span>
        <input className={field} inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} placeholder="bpm" />
        {hrBad && <span className="text-sm font-semibold text-warn">Heart rate should be between {HR_MIN} and {HR_MAX} bpm</span>}
      </label>
      <div className="flex flex-col gap-2">
        <span className={label}>EFFORT (RPE, OPTIONAL)</span>
        <RpeSlider value={rpe} defaultRpe={null} resetKey={type} onChange={setRpe} tone="dark" />
      </div>
      {askWhen && (
        <label className="flex flex-col gap-2">
          <span className={label}>WHEN</span>
          <input className={field} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
      )}
      <label className="flex flex-col gap-2">
        <span className={label}>NOTES</span>
        <input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Intervals, route…" />
      </label>
      <button type="submit" disabled={invalid || saving} className={btn.primary}>{submitLabel}</button>
      {children}
    </form>
  );
}
