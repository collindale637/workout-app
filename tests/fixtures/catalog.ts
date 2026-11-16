import raw from "./catalog.json";
import { needsByExercise } from "@/lib/availability";
import type { GenCatalog } from "@/lib/generator";
import type { Equipment, Exercise, ExerciseMuscle, Muscle } from "@/lib/db/types";
import { templateEquipment } from "@/lib/defaults";

type Raw = {
  muscles: Muscle[];
  exercises: [string, string, string, string | null, "compound" | "isolation" | null, string, boolean][];
  muscles_of: [string, string, "p" | "s"][];
  needs: [string, number, string][];
  equipment: [string, Equipment["category"], boolean][];
};
const r = raw as unknown as Raw;

export const muscles = r.muscles;

export const exercises: Exercise[] = r.exercises.map(([id, name, category, movement_pattern, mechanic, level, is_common]) => ({
  id, name, aliases: [], category, movement_pattern, mechanic, force: null, level, instructions: [], images: [], is_common, is_active: true, owner_id: null,
}));

const musclesOf = new Map<string, ExerciseMuscle[]>();
for (const [exercise_id, muscle_id, role] of r.muscles_of) {
  musclesOf.set(exercise_id, [...(musclesOf.get(exercise_id) ?? []), { exercise_id, muscle_id, role: role === "p" ? "primary" : "secondary" }]);
}

export const catalog: GenCatalog = {
  exercises,
  musclesOf,
  needs: needsByExercise(r.needs.map(([exercise_id, option_group, equipment_id]) => ({ exercise_id, option_group, equipment_id }))),
};

const equipment: Equipment[] = r.equipment.map(([id, category, common_at_home], i) => ({ id, name: id, category, sort_order: i, common_at_home }));
export const commercialGym = new Set(templateEquipment("commercial", equipment));
export const homeGym = new Set(templateEquipment("home", equipment));
export const hotelGym = new Set(templateEquipment("hotel", equipment));
export const bodyweightGym = new Set<string>();

export const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name ?? id;
