import { markDirty } from "@/lib/db/sync";
import { newId, type LocalDB } from "@/lib/db/dexie";

export type NewCustomExercise = {
  name: string;
  kind: "strength" | "cardio";
  mechanic: "compound" | "isolation";
  primary: string[];
  secondary?: string[];
  /** Equipment it needs (all of these). */
  needs?: string[];
};

/** Saves a custom exercise on the phone (only its owner sees it) and queues it to sync. Returns its id. */
export async function createCustomExercise(db: LocalDB, userId: string, x: NewCustomExercise) {
  const id = `custom_${newId().replace(/-/g, "")}`;
  const { kind, mechanic, primary } = x;
  await db.transaction("rw", [db.exercises, db.exercise_muscles, db.exercise_equipment, db.outbox], async () => {
    await db.exercises.put({
      id, name: x.name.trim(), aliases: [], category: kind, movement_pattern: kind === "cardio" ? "cardio" : mechanic === "isolation" ? "isolation" : "other",
      mechanic: kind === "cardio" ? null : mechanic, force: null, level: "beginner", instructions: [], images: [],
      is_common: false, is_active: true, owner_id: userId, source: "custom",
    });
    await db.exercise_muscles.bulkPut([
      ...primary.map((m) => ({ exercise_id: id, muscle_id: m, role: "primary" as const })),
      ...(x.secondary ?? []).filter((m) => !primary.includes(m)).map((m) => ({ exercise_id: id, muscle_id: m, role: "secondary" as const })),
    ]);
    await db.exercise_equipment.bulkPut((x.needs ?? []).map((eq, i) => ({ exercise_id: id, option_group: i + 1, equipment_id: eq })));
    await markDirty(db, "exercises", id);
    await markDirty(db, "exercise_tags", id);
  });
  return id;
}
