"use client";

import { useState } from "react";
import { cmToInches, fromDisplayWeight, inchesToCm, splitFeetInches, toDisplayWeight, weightUnit } from "@/lib/units";
import { Chip, field, label } from "@/components/ui/kit";
import type { Sex, Units } from "@/lib/db/types";

/*
  Weight, height and sex inputs, used by onboarding and Profile. Weight and height are held in lb and inches
  (the app's storage units) and shown in the person's units. Mount these with a `key` that includes the units
  so they re-read the value when the units change.
*/

export const WEIGHT_RANGE_LB = [60, 800] as const;
export const HEIGHT_RANGE_IN = [40, 100] as const;

export const validWeightLb = (lb: number | null): lb is number => lb !== null && lb >= WEIGHT_RANGE_LB[0] && lb <= WEIGHT_RANGE_LB[1];
export const validHeightIn = (inches: number | null): inches is number => inches !== null && inches >= HEIGHT_RANGE_IN[0] && inches <= HEIGHT_RANGE_IN[1];

/** Message for a weight or height that's missing or out of range, saying what's accepted. */
export function weightProblem(lb: number | null, units: Units): string | null {
  if (validWeightLb(lb)) return null;
  const [lo, hi] = WEIGHT_RANGE_LB.map((v) => Math.round(toDisplayWeight(v, units)));
  return lb === null ? `Enter your weight (${lo}–${hi} ${weightUnit(units)}).` : `Weight must be between ${lo} and ${hi} ${weightUnit(units)}.`;
}
export function heightProblem(inches: number | null, units: Units): string | null {
  if (validHeightIn(inches)) return null;
  const [lo, hi] = HEIGHT_RANGE_IN;
  const range = units === "kg" ? `${Math.round(inchesToCm(lo))}–${Math.round(inchesToCm(hi))} cm` : `3 ft 4 in to 8 ft 4 in`;
  return inches === null ? `Enter your height (${range}).` : `Height must be between ${range}.`;
}

function FieldError({ id, message }: { id: string; message?: string | null }) {
  return message ? (
    <p id={id} role="alert" className="text-sm font-bold text-[#FFD2B3]">
      {message}
    </p>
  ) : null;
}

const num = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function WeightField({ units, valueLb, onChange, error }: { units: Units; valueLb: number | null; onChange: (lb: number | null) => void; error?: string | null }) {
  const [text, setText] = useState(() => (valueLb === null ? "" : String(toDisplayWeight(valueLb, units))));
  return (
    <label className="flex flex-col gap-2">
      <span className={label}>WEIGHT ({weightUnit(units).toUpperCase()})</span>
      <input
        className={field}
        inputMode="decimal"
        value={text}
        placeholder={units === "kg" ? "82" : "180"}
        aria-label={`Weight in ${weightUnit(units)}`}
        aria-invalid={!!error}
        aria-describedby={error ? "weight-error" : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const n = num(e.target.value);
          onChange(n === null ? null : Math.round(fromDisplayWeight(n, units) * 10) / 10);
        }}
      />
      <FieldError id="weight-error" message={error} />
    </label>
  );
}

export function HeightField({ units, valueIn, onChange, error }: { units: Units; valueIn: number | null; onChange: (inches: number | null) => void; error?: string | null }) {
  const start = valueIn === null ? null : splitFeetInches(valueIn);
  const [ft, setFt] = useState(start ? String(start.ft) : "");
  const [inch, setInch] = useState(start ? String(start.inch) : "");
  const [cm, setCm] = useState(valueIn === null ? "" : String(Math.round(inchesToCm(valueIn))));

  if (units === "kg") {
    return (
      <label className="flex flex-col gap-2">
        <span className={label}>HEIGHT (CM)</span>
        <input
          className={field}
          inputMode="decimal"
          value={cm}
          placeholder="178"
          aria-label="Height in centimeters"
          onChange={(e) => {
            setCm(e.target.value);
            const n = num(e.target.value);
            onChange(n === null ? null : cmToInches(n));
          }}
        />
        <FieldError id="height-error" message={error} />
      </label>
    );
  }
  const update = (f: string, i: string) => {
    const feet = num(f);
    onChange(feet === null ? null : Math.round((feet * 12 + (num(i) ?? 0)) * 10) / 10);
  };
  return (
    <div className="flex flex-col gap-2">
      <span className={label}>HEIGHT</span>
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <input
            className={`${field} pr-12`}
            inputMode="numeric"
            value={ft}
            placeholder="5"
            aria-label="Height, feet"
            onChange={(e) => {
              setFt(e.target.value);
              update(e.target.value, inch);
            }}
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm font-bold text-muted">ft</span>
        </div>
        <div className="relative">
          <input
            className={`${field} pr-12`}
            inputMode="decimal"
            value={inch}
            placeholder="10"
            aria-label="Height, inches"
            onChange={(e) => {
              setInch(e.target.value);
              update(ft, e.target.value);
            }}
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm font-bold text-muted">in</span>
        </div>
      </div>
      <FieldError id="height-error" message={error} />
    </div>
  );
}

export function SexField({ value, onChange }: { value: Sex | null; onChange: (sex: Sex | null) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className={label}>SEX (OPTIONAL)</span>
      <div className="grid grid-cols-3 gap-2">
        <Chip active={value === "male"} onClick={() => onChange("male")}>Male</Chip>
        <Chip active={value === "female"} onClick={() => onChange("female")}>Female</Chip>
        <Chip active={value === null} onClick={() => onChange(null)}>Skip</Chip>
      </div>
    </div>
  );
}
