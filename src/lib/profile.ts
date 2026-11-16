import type { Experience, Goal } from "@/lib/db/types";

export type { Experience, Goal, Profile, Units } from "@/lib/db/types";

export const GOAL_LABELS: Record<Goal, string> = {
  strength: "Strength",
  hypertrophy: "Build muscle",
  fat_loss: "Fat loss / toning",
  general: "General fitness",
};

export const EXPERIENCE_LABELS: Record<Experience, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
