import Dexie, { type EntityTable } from "dexie";
import type {
  CardioSession,
  Equipment,
  Exercise,
  ExerciseEquipment,
  ExerciseMuscle,
  Gym,
  GymEquipment,
  Muscle,
  OutboxEntry,
  Profile,
  Tombstone,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "./types";

/**
 * The phone's own copy of everything the app needs, so logging works with no signal.
 * One database per signed-in person, so family members sharing a phone never see each other's data.
 */
export class LocalDB extends Dexie {
  muscles!: EntityTable<Muscle, "id">;
  equipment!: EntityTable<Equipment, "id">;
  exercises!: EntityTable<Exercise, "id">;
  exercise_muscles!: Dexie.Table<ExerciseMuscle, [string, string]>;
  exercise_equipment!: Dexie.Table<ExerciseEquipment, [string, number, string]>;
  profile!: EntityTable<Profile, "id">;
  gyms!: EntityTable<Gym, "id">;
  gym_equipment!: Dexie.Table<GymEquipment, [string, string]>;
  workouts!: EntityTable<Workout, "id">;
  workout_exercises!: EntityTable<WorkoutExercise, "id">;
  sets!: EntityTable<WorkoutSet, "id">;
  cardio_sessions!: EntityTable<CardioSession, "id">;
  outbox!: Dexie.Table<OutboxEntry, [string, string]>;
  tombstones!: Dexie.Table<Tombstone, [string, string]>;
  meta!: Dexie.Table<{ key: string; value: unknown }, string>;

  constructor(userId: string) {
    super(`rep-${userId}`);
    this.version(1).stores({
      muscles: "id",
      equipment: "id, category",
      exercises: "id, name, owner_id",
      exercise_muscles: "[exercise_id+muscle_id], exercise_id, muscle_id",
      exercise_equipment: "[exercise_id+option_group+equipment_id], exercise_id",
      profile: "id",
      gyms: "id",
      gym_equipment: "[gym_id+equipment_id], gym_id",
      workouts: "id, started_at, ended_at",
      workout_exercises: "id, workout_id, exercise_id",
      sets: "id, workout_exercise_id, completed_at",
      cardio_sessions: "id, started_at, workout_id",
      outbox: "[table+id], table",
      tombstones: "[table+id], table",
      meta: "key",
    });
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown) {
    await this.meta.put({ key, value });
  }
}

export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
