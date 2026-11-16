"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useData, useProfile, useSave } from "@/lib/db/provider";
import { newId } from "@/lib/db/dexie";
import { Chip, PageHeader, btn } from "@/components/ui/kit";
import { CardioResultsForm, resultsFromSession } from "@/components/cardio-results";
import { CARDIO_TYPES } from "@/lib/cardio";
import { CardioTimerFlow } from "./cardio-timer-flow";
import type { CardioSession, CardioType } from "@/lib/db/types";

/**
 * /cardio: pick a type and start a timer (default), or log a past session by hand (?manual=1), or edit one (?id=).
 * Add ?workout=id to attach the session to the workout in progress.
 */
export function CardioForm() {
  const params = useSearchParams();
  const workoutId = params.get("workout");
  const editId = params.get("id");
  const manual = params.get("manual") === "1";
  if (editId || manual) return <ManualCardio editId={editId} workoutId={workoutId} />;
  return <CardioTimerFlow workoutId={workoutId} />;
}

function ManualCardio({ editId, workoutId }: { editId: string | null; workoutId: string | null }) {
  const router = useRouter();
  const { db } = useData();
  const { profile } = useProfile();
  const save = useSave();
  const units = profile?.units ?? "lb";
  const existing = useLiveQuery(async () => (editId ? (await db.cardio_sessions.get(editId)) ?? null : null), [db, editId]);
  if (editId && existing === undefined) return null;
  return (
    <Form
      key={existing?.id ?? "new"}
      existing={existing ?? null}
      units={units}
      onSave={async (row) => {
        const final = { ...row, workout_id: existing?.workout_id ?? workoutId };
        await save("cardio_sessions", final);
        router.replace(final.workout_id ? "/workout" : `/progress/session?cardio=${final.id}`);
      }}
      onCancel={() => router.back()}
    />
  );
}

function Form({ existing, units, onSave, onCancel }: {
  existing: CardioSession | null; units: "lb" | "kg";
  onSave: (row: CardioSession) => Promise<void>; onCancel: () => void;
}) {
  const [type, setType] = useState<CardioType>(existing?.type ?? "run");
  return (
    <main className="safe-top safe-bottom flex flex-col gap-4 px-5 pb-8">
      <PageHeader title={existing ? "Edit cardio" : "Log past cardio"} right={<button type="button" className={btn.ghost} onClick={onCancel}>Cancel</button>} />
      <div className="grid grid-cols-3 gap-2">
        {CARDIO_TYPES.map((t) => <Chip key={t.id} active={type === t.id} onClick={() => setType(t.id)}>{t.label}</Chip>)}
      </div>
      <CardioResultsForm
        key={type}
        type={type}
        units={units}
        initial={existing ? resultsFromSession(existing) : undefined}
        askWhen
        submitLabel={existing ? "Save changes" : "Save cardio"}
        onSubmit={(r) =>
          onSave({
            id: existing?.id ?? newId(),
            workout_id: existing?.workout_id ?? null,
            workout_exercise_id: existing?.workout_exercise_id ?? null,
            type,
            started_at: r.startedAt,
            duration_sec: r.durationSec,
            distance: r.distance,
            avg_hr: r.avgHr,
            rpe: r.rpe,
            intervals: existing?.intervals ?? null,
            notes: r.notes,
          })
        }
      />
    </main>
  );
}
