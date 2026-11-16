import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalDB } from "./dexie";
import { fetchAll } from "./sync";
import type { Equipment, Exercise, ExerciseEquipment, ExerciseMuscle, Muscle, Split, SplitDay } from "./types";

/** Bump when the catalog seed changes so every phone downloads it again. */
export const CATALOG_VERSION = "2026-11-20.1";

/**
 * Copies the shared exercise library (muscles, equipment, ~900 exercises and their tags, the split library) onto the phone,
 * so the picker, gym checklist and library work offline. Runs once, then again only when CATALOG_VERSION changes.
 */
export async function ensureCatalog(db: LocalDB, sb: SupabaseClient, force = false) {
  const have = await db.getMeta<string>("catalogVersion");
  if (have === CATALOG_VERSION && !force) return false;

  const [muscles, equipment, exercises, exMuscles, exEquip, splits, splitDays] = await Promise.all([
    fetchAll<Muscle>((f, t) => sb.from("muscles").select("*").order("sort_order").range(f, t)),
    fetchAll<Equipment>((f, t) => sb.from("equipment").select("id, name, category, sort_order, common_at_home").order("sort_order").range(f, t)),
    fetchAll<Exercise>((f, t) =>
      sb
        .from("exercises")
        .select("id, name, aliases, category, movement_pattern, mechanic, force, level, instructions, images, is_common, is_active, owner_id")
        .is("owner_id", null)
        .order("id")
        .range(f, t),
    ),
    fetchAll<ExerciseMuscle>((f, t) => sb.from("exercise_muscles").select("exercise_id, muscle_id, role").order("exercise_id").order("muscle_id").range(f, t)),
    fetchAll<ExerciseEquipment>((f, t) =>
      sb.from("exercise_equipment").select("exercise_id, option_group, equipment_id").order("exercise_id").order("option_group").order("equipment_id").range(f, t),
    ),
    fetchAll<Split>((f, t) => sb.from("splits").select("id, name, days_per_week, description, sort_order").order("sort_order").range(f, t)),
    fetchAll<SplitDay>((f, t) => sb.from("split_days").select("id, split_id, day_order, name, target_muscle_ids").order("split_id").order("day_order").range(f, t)),
  ]);

  await db.transaction("rw", [db.muscles, db.equipment, db.exercises, db.exercise_muscles, db.exercise_equipment, db.splits, db.split_days, db.meta], async () => {
    // Keep custom (owned) exercises and their tags; replace the shared catalog.
    const catalogIds = (await db.exercises.filter((e) => !e.owner_id).primaryKeys()) as string[];
    await db.exercises.bulkDelete(catalogIds);
    await db.exercise_muscles.where("exercise_id").anyOf(catalogIds).delete();
    await db.exercise_equipment.where("exercise_id").anyOf(catalogIds).delete();
    await db.muscles.clear();
    await db.equipment.clear();
    await db.muscles.bulkPut(muscles);
    await db.equipment.bulkPut(equipment);
    await db.exercises.bulkPut(exercises);
    await db.exercise_muscles.bulkPut(exMuscles);
    await db.exercise_equipment.bulkPut(exEquip);
    await db.splits.clear();
    await db.split_days.clear();
    await db.splits.bulkPut(splits);
    await db.split_days.bulkPut(splitDays);
    await db.setMeta("catalogVersion", CATALOG_VERSION);
  });
  return true;
}
