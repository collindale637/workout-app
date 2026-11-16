"use client";

import { ExercisePicker } from "@/components/exercise-picker";
import { PageHeader } from "@/components/ui/kit";
import { useActiveGym } from "@/lib/hooks";

export function Library() {
  const { gym, equipment } = useActiveGym();
  return (
    <main className="flex flex-col gap-3">
      <PageHeader title="Exercises" back="/more" />
      <ExercisePicker mode="browse" gymEquipment={gym ? equipment : null} gymName={gym?.name} />
    </main>
  );
}
