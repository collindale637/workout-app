"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCatalog, useActiveGym } from "@/lib/hooks";
import { useData } from "@/lib/db/provider";
import { markDeleted } from "@/lib/db/sync";
import { ExerciseInfo } from "@/components/exercise-info";
import { PageHeader, Sheet, btn } from "@/components/ui/kit";

export function ExerciseDetail() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const catalog = useCatalog();
  const { gym, equipment } = useActiveGym();
  const { db, userId, requestSync } = useData();
  const [confirm, setConfirm] = useState(false);
  if (!catalog) return null;
  const ex = catalog.byId.get(id);

  return (
    <main className="flex flex-col gap-4">
      <PageHeader title={ex?.name ?? "Exercise"} back="/more/library" />
      <ExerciseInfo catalog={catalog} id={id} gymEquipment={gym ? equipment : null} gymName={gym?.name} />
      {ex?.owner_id === userId && (
        <>
          <button type="button" className={btn.danger} onClick={() => setConfirm(true)}>Delete this custom exercise</button>
          <Sheet open={confirm} onClose={() => setConfirm(false)} title="Delete it?">
            <p className="mb-4 text-base font-medium text-muted">You can only delete it if it isn&apos;t in any logged workout.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={btn.secondary} onClick={() => setConfirm(false)}>Keep</button>
              <button
                type="button"
                className={btn.danger}
                onClick={async () => {
                  const used = await db.workout_exercises.where("exercise_id").equals(id).count();
                  if (used) {
                    alert("It's in your workout history, so it can't be deleted.");
                    return;
                  }
                  await db.exercise_muscles.where("exercise_id").equals(id).delete();
                  await db.exercise_equipment.where("exercise_id").equals(id).delete();
                  await db.exercises.delete(id);
                  await db.outbox.delete(["exercise_tags", id]);
                  await markDeleted(db, "exercises", id);
                  requestSync();
                  router.replace("/more/library");
                }}
              >
                Delete
              </button>
            </div>
          </Sheet>
        </>
      )}
    </main>
  );
}
