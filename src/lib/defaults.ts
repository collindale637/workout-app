import type { Equipment, EquipmentDetails, Goal, GymTemplate } from "./db/types";

/** Starting sets, reps and rest for a newly added exercise, by goal. */
export function defaultTargets(goal: Goal, mechanic: "compound" | "isolation" | null) {
  const compound = mechanic !== "isolation";
  switch (goal) {
    case "strength":
      return compound ? { sets: 5, repMin: 3, repMax: 5, rest: 180 } : { sets: 3, repMin: 8, repMax: 10, rest: 90 };
    case "fat_loss":
      return { sets: 3, repMin: 12, repMax: 15, rest: compound ? 75 : 45 };
    case "general":
      return { sets: 3, repMin: 8, repMax: 12, rest: compound ? 90 : 60 };
    default:
      return compound ? { sets: 3, repMin: 6, repMax: 10, rest: 120 } : { sets: 3, repMin: 10, repMax: 15, rest: 60 };
  }
}

export const TEMPLATE_LABELS: Record<GymTemplate, { name: string; blurb: string }> = {
  commercial: { name: "Commercial gym", blurb: "Racks, machines, cables, dumbbells, cardio" },
  home: { name: "Home: dumbbells + bench", blurb: "Dumbbells, bench, pull-up bar, bands" },
  hotel: { name: "Hotel gym", blurb: "Light dumbbells, a bench, cardio machines" },
  bodyweight: { name: "Bodyweight only", blurb: "Nothing but you (add a bar or bands if you have them)" },
  custom: { name: "Blank", blurb: "Start empty and tick what's there" },
};

const STRONGMAN_AND_SPECIALTY = new Set([
  "atlas_stone", "log_bar", "axle_bar", "yoke", "farmers_handles", "keg", "tire", "sledgehammer", "chains",
  "safety_squat_bar", "reverse_hyper", "climbing_rope", "balance_board", "wrist_roller", "sandbag", "pendulum_squat", "belt_squat",
]);

/** Which equipment a new gym starts with. Everything stays editable. */
export function templateEquipment(template: GymTemplate, catalog: Equipment[]): string[] {
  switch (template) {
    case "commercial":
      return catalog.filter((e) => !STRONGMAN_AND_SPECIALTY.has(e.id)).map((e) => e.id);
    case "home":
      return catalog.filter((e) => e.common_at_home).map((e) => e.id);
    case "hotel":
      return ["dumbbells", "adjustable_bench", "flat_bench", "treadmill", "stationary_bike", "elliptical", "stability_ball"].filter((id) =>
        catalog.some((e) => e.id === id),
      );
    case "bodyweight":
      return [];
    default:
      return [];
  }
}

/** Starting details for equipment that has them (pounds). */
export function defaultDetails(equipmentId: string, template: GymTemplate | null): EquipmentDetails {
  switch (equipmentId) {
    case "dumbbells":
      return template === "hotel"
        ? { dumbbell_min: 5, dumbbell_max: 50, dumbbell_step: 5 }
        : template === "home"
          ? { dumbbell_min: 5, dumbbell_max: 50, dumbbell_step: 5 }
          : { dumbbell_min: 5, dumbbell_max: 120, dumbbell_step: 5 };
    case "barbell":
      return { plate_increment: 2.5 };
    case "cable_crossover":
    case "cable_pulley":
    case "lat_pulldown":
    case "cable_row_station":
      return { stack_max: 200 };
    default:
      return {};
  }
}

export const hasDetails = (equipmentId: string) =>
  ["dumbbells", "barbell", "cable_crossover", "cable_pulley", "lat_pulldown", "cable_row_station"].includes(equipmentId);

export const CATEGORY_LABELS: Record<string, string> = {
  free_weights: "Free weights",
  benches_racks: "Benches & racks",
  machines: "Machines",
  cables: "Cables",
  bodyweight: "Bodyweight stations",
  cardio: "Cardio",
  accessories: "Accessories",
};

export const CATEGORY_ORDER = ["free_weights", "benches_racks", "cables", "machines", "bodyweight", "cardio", "accessories"];

/** Muscle groups for filters, in the order people think about them. */
export const MUSCLE_GROUPS: { label: string; muscles: string[] }[] = [
  { label: "Chest", muscles: ["chest"] },
  { label: "Back", muscles: ["lats", "upper_back", "lower_back", "traps"] },
  { label: "Shoulders", muscles: ["front_delts", "side_delts", "rear_delts"] },
  { label: "Arms", muscles: ["biceps", "triceps", "forearms"] },
  { label: "Legs", muscles: ["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"] },
  { label: "Core", muscles: ["abs", "obliques"] },
];

export const RPE_CHOICES = [6, 7, 7.5, 8, 8.5, 9, 10];
/** Full scale for logging a set: slide sideways in the live workout to reach the easy end. */
export const RPE_SCALE = [1, 2, 3, 4, 5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
