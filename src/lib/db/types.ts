// Row shapes for the phone's local database (mirrors the Supabase tables).

export type Muscle = {
  id: string;
  name: string;
  region: "front" | "back";
  size_class: "small" | "medium" | "large";
  recovery_tau_hours: number;
  sort_order: number;
};

export type EquipmentCategory =
  | "free_weights"
  | "benches_racks"
  | "machines"
  | "cables"
  | "bodyweight"
  | "cardio"
  | "accessories";

export type Equipment = {
  id: string;
  name: string;
  category: EquipmentCategory;
  sort_order: number;
  common_at_home: boolean;
};

export type Exercise = {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  movement_pattern: string | null;
  mechanic: "compound" | "isolation" | null;
  force: string | null;
  level: string;
  instructions: string[];
  images: string[];
  is_common: boolean;
  is_active: boolean;
  owner_id: string | null;
  source?: string;
  created_at?: string;
};

export type ExerciseMuscle = { exercise_id: string; muscle_id: string; role: "primary" | "secondary" };
export type ExerciseEquipment = { exercise_id: string; option_group: number; equipment_id: string };

export type Goal = "strength" | "hypertrophy" | "fat_loss" | "general";
export type Experience = "beginner" | "intermediate" | "advanced";
export type Units = "lb" | "kg";
/** How much cardio to add on its own: none = only on days that ask for it, auto = what the goal calls for, more = every lifting day. */
export type CardioPref = "none" | "auto" | "more";

export type Profile = {
  id: string;
  display_name: string | null;
  units: Units;
  goal: Goal;
  experience: Experience;
  days_per_week: number;
  session_minutes: number;
  default_rpe: number;
  active_gym_id: string | null;
  onboarded_at: string | null;
  cardio_pref: CardioPref;
};

export type GymTemplate = "commercial" | "home" | "hotel" | "bodyweight" | "custom";

export type Gym = {
  id: string;
  owner_id?: string;
  name: string;
  template: GymTemplate | null;
  is_default: boolean;
  created_at: string;
  updated_at?: string;
};

/** Extra info about a piece of equipment at a gym. Weights are in pounds. */
export type EquipmentDetails = {
  dumbbell_min?: number;
  dumbbell_max?: number;
  dumbbell_step?: number;
  plate_increment?: number;
  stack_max?: number;
  kettlebells?: number[];
};

export type GymEquipment = { gym_id: string; equipment_id: string; details: EquipmentDetails };

export type Workout = {
  id: string;
  name: string | null;
  gym_id: string | null;
  plan_day_id: string | null;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  source: "plan" | "generated" | "ai" | "manual" | "imported";
  updated_at?: string;
};

export type WorkoutExercise = {
  id: string;
  workout_id: string;
  exercise_id: string;
  sort_order: number;
  superset_group: number | null;
  notes: string | null;
  target_sets: number | null;
  rep_min: number | null;
  rep_max: number | null;
  rest_sec: number | null;
  /** Planned set slots (1 = first working set) skipped in this workout. */
  skipped_sets?: number[];
  updated_at?: string;
};

export type SetType = "warmup" | "working" | "drop";

export type WorkoutSet = {
  id: string;
  workout_exercise_id: string;
  set_no: number;
  type: SetType;
  /** Pounds. Null = bodyweight / no load. */
  weight: number | null;
  reps: number | null;
  /** Null = use the profile's default RPE. */
  rpe: number | null;
  completed_at: string;
  updated_at?: string;
};

export type CardioType = "run" | "walk" | "bike" | "row" | "elliptical" | "stairs" | "swim" | "hiit" | "other";

export type CardioSession = {
  id: string;
  workout_id: string | null;
  /** Set when this is the result of a cardio exercise in the workout (Start / Done), not a standalone log. */
  workout_exercise_id?: string | null;
  type: CardioType;
  started_at: string;
  duration_sec: number;
  /** Miles. */
  distance: number | null;
  avg_hr: number | null;
  rpe: number | null;
  intervals: unknown | null;
  notes: string | null;
  updated_at?: string;
};

/** A split from the library (catalog, read-only). */
export type Split = { id: string; name: string; days_per_week: number; description: string; sort_order: number };

export type SplitDay = { id: string; split_id: string; day_order: number; name: string; target_muscle_ids: string[] };

export type PlanSource = "generated" | "ai" | "imported" | "manual";

export type Plan = {
  id: string;
  name: string;
  goal: Goal | null;
  split_id: string | null;
  /** YYYY-MM-DD */
  start_date: string | null;
  weeks: number | null;
  source: PlanSource;
  is_active: boolean;
  /** AI-built and imported plans: a short overview and how the plan progresses. */
  notes?: string | null;
  created_at: string;
  updated_at?: string;
};

export type PlanDay = {
  id: string;
  plan_id: string;
  day_order: number;
  name: string;
  gym_id: string | null;
  /** What the day trains; used to regenerate it and to pick swaps. */
  target_muscle_ids: string[];
  updated_at?: string;
};

export type PlanExercise = {
  id: string;
  plan_day_id: string;
  exercise_id: string;
  sort_order: number;
  sets: number;
  rep_min: number | null;
  rep_max: number | null;
  rest_sec: number | null;
  superset_group: number | null;
  notes: string | null;
  updated_at?: string;
};

/** One bodyweight entry per day. Pounds. */
export type BodyMetric = { id: string; date: string; bodyweight: number | null; updated_at?: string };

/** Favorites get picked more often; excluded exercises are never suggested. Keyed by exercise. */
export type ExercisePref = { exercise_id: string; favorite: boolean; excluded: boolean };

/** Tables the phone writes and syncs. */
export type SyncTable =
  | "profiles"
  | "exercises"
  | "exercise_tags"
  | "exercise_prefs"
  | "gyms"
  | "gym_equipment"
  | "plans"
  | "plan_days"
  | "plan_exercises"
  | "workouts"
  | "workout_exercises"
  | "sets"
  | "cardio_sessions"
  | "body_metrics";

export type OutboxEntry = { table: SyncTable; id: string; rev: number };
export type Tombstone = { table: SyncTable; id: string };
