import type { ExerciseEquipment } from "./db/types";

/**
 * Can this exercise be done with this equipment?
 * Rows sharing an option_group are alternatives (any one will do); every group must be met.
 * No rows at all means no equipment is needed.
 */
export function isAvailable(needs: ExerciseEquipment[], have: Set<string>) {
  const groups = new Map<number, boolean>();
  for (const n of needs) groups.set(n.option_group, (groups.get(n.option_group) ?? false) || have.has(n.equipment_id));
  for (const ok of groups.values()) if (!ok) return false;
  return true;
}

/** Groups equipment needs by exercise for quick lookups. */
export function needsByExercise(rows: ExerciseEquipment[]) {
  const map = new Map<string, ExerciseEquipment[]>();
  for (const r of rows) {
    const list = map.get(r.exercise_id);
    if (list) list.push(r);
    else map.set(r.exercise_id, [r]);
  }
  return map;
}

/** Plain-English summary like "Barbell + Flat bench or Adjustable bench". */
export function describeNeeds(needs: ExerciseEquipment[], names: Map<string, string>) {
  if (!needs.length) return "No equipment";
  const groups = new Map<number, string[]>();
  for (const n of needs) groups.set(n.option_group, [...(groups.get(n.option_group) ?? []), names.get(n.equipment_id) ?? n.equipment_id]);
  return [...groups.values()].map((g) => g.join(" or ")).join(" + ");
}
