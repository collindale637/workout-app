"use client";

import { useState } from "react";
import { useProfile } from "@/lib/db/provider";
import { useBodyweightActions } from "@/lib/progress-data";
import { dateKey } from "@/lib/progress";
import { fromDisplayWeight, toDisplayWeight, weightUnit } from "@/lib/units";
import { Sheet, btn, field, label } from "@/components/ui/kit";

/** Log (or fix) a day's bodyweight. One entry per day; logging the same day again replaces it. */
export function BodyweightSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: { date: string; lb: number } }) {
  return (
    <Sheet open={open} onClose={onClose} title={initial ? "Edit weight" : "Log weight"}>
      {/* Remounts each time it opens so it starts from today (or the entry being edited). */}
      {open && <Form onDone={onClose} initial={initial} />}
    </Sheet>
  );
}

function Form({ onDone, initial }: { onDone: () => void; initial?: { date: string; lb: number } }) {
  const { profile } = useProfile();
  const { log } = useBodyweightActions();
  const units = profile?.units ?? "lb";
  const [date, setDate] = useState(() => initial?.date ?? dateKey(new Date()));
  const [value, setValue] = useState(() => (initial ? String(toDisplayWeight(initial.lb, units)) : ""));
  const [saving, setSaving] = useState(false);
  const n = Number(value);
  const ok = value.trim() !== "" && n > 20 && n < 1000 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok) return;
        setSaving(true);
        await log(date, fromDisplayWeight(n, units));
        onDone();
      }}
    >
      <label className="flex flex-col gap-2">
        <span className={label}>WEIGHT ({weightUnit(units).toUpperCase()})</span>
        <input
          className={`${field} display num h-16 text-4xl font-extrabold`}
          inputMode="decimal"
          autoFocus
          onFocus={(e) => e.target.select()}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(",", "."))}
          placeholder={units === "kg" ? "82.5" : "182.4"}
          aria-label={`Weight in ${weightUnit(units)}`}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className={label}>DATE</span>
        <input className={field} type="date" value={date} max={dateKey(new Date())} onChange={(e) => setDate(e.target.value)} disabled={Boolean(initial)} />
      </label>
      <p className="-mt-1 text-sm font-medium text-muted">Weigh in at the same time of day (first thing in the morning is easiest). The chart smooths out day-to-day swings.</p>
      <button type="submit" className={btn.primary} disabled={!ok || saving}>{saving ? "Saving…" : "Save"}</button>
    </form>
  );
}
